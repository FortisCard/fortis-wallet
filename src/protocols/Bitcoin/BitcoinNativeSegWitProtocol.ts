import * as bitcoinjs from 'bitcoinjs-lib';
import { Psbt, SignerAsync } from 'bitcoinjs-lib';
import { Buffer } from 'buffer';
import { ProtocolStatic, BaseProtocol } from '../BaseProtocol';
import { FortisCardAPI } from '../../utils/FortisCardAPI';
import mempoolJS from "@mempool/mempool.js";

interface Utxo {
  txid: string;
  vout: number;
  value: number;
}

class FortisCardSigner implements SignerAsync {
  constructor(
    private readonly pin: number[],
    private readonly addressIndex: number,
    public readonly publicKey: Buffer
  ) {}

  public async sign(hash: Buffer): Promise<Buffer> {
    console.log('hash:', hash.toString('hex'));
    const { r, s } = await FortisCardAPI.getSignature(
      this.pin,
      BitcoinNativeSegWitProtocol.PURPOSE,
      BitcoinNativeSegWitProtocol.COIN_TYPE,
      0, // change
      this.addressIndex,
      BitcoinNativeSegWitProtocol.CURVE,
      Array.from(hash)
    );

    return Buffer.from([...r, ...s]);
  }
}

export class BitcoinNativeSegWitProtocol extends BaseProtocol {
  private static instance: BitcoinNativeSegWitProtocol;

  public static readonly PURPOSE = 84;
  public static readonly COIN_TYPE = 0;
  public static readonly VERSION_BYTES = [0x04, 0xB2, 0x47, 0x46]; // b'zpub'
  public static readonly SYMBOL = 'BTC';
  public static readonly NAME = 'Bitcoin (Native SegWit)';
  public static readonly BLOCKCHAIN_EXPLORER_URL: string = 'https://mempool.space/tx/';

  fee_t: Record<string, bigint> = { satsPerVByte: -1n };

  private static readonly NETWORK: bitcoinjs.Network = bitcoinjs.networks.bitcoin;
  private static readonly MEMPOOL = mempoolJS({ hostname: 'mempool.space' }).bitcoin; // Can use other node if desired
  private static readonly PSBT_OVERHEAD_VIRTUAL_SIZE: number = 10.5;
  private static readonly PSBT_INPUT_VIRTUAL_SIZE: number = 68;
  private static readonly PSBT_OUTPUT_VIRTUAL_SIZE: number = 31;
  private static readonly PSBT_DUST_THRESHOLD: number = 294;

  public static getInstance(): BitcoinNativeSegWitProtocol {
    if (!BitcoinNativeSegWitProtocol.instance) {
      BitcoinNativeSegWitProtocol.instance = new BitcoinNativeSegWitProtocol();
    }
    return BitcoinNativeSegWitProtocol.instance;
  }

  private constructor() {
    super();
  }

  getStaticConfig(): ProtocolStatic {
    try {
      return {
        PURPOSE: BitcoinNativeSegWitProtocol.PURPOSE,
        COIN_TYPE: BitcoinNativeSegWitProtocol.COIN_TYPE,
        VERSION_BYTES: BitcoinNativeSegWitProtocol.VERSION_BYTES,
        CURVE: BitcoinNativeSegWitProtocol.CURVE,
        SYMBOL: BitcoinNativeSegWitProtocol.SYMBOL,
        NAME: BitcoinNativeSegWitProtocol.NAME,
        BLOCKCHAIN_EXPLORER_URL: BitcoinNativeSegWitProtocol.BLOCKCHAIN_EXPLORER_URL,
      };
    } catch (error) {
      return this.handleError(error, 'getStaticConfig');
    }
  }

  public async signTx(xpub: string, toAddress: string, addressIndex: number, amount: string, fee: Record<string, bigint>, useSuggestedFee: boolean, pin: number[]): Promise<{ signedTx: string, totalFee: number }> {
    try {
      console.log('xpub', xpub);
      console.log('addressIndex', addressIndex);
      console.log('toAddress', toAddress);
      console.log('amount', amount);
      console.log('fee', fee);
      console.log('pin', pin);

      const { satsPerVByte } = useSuggestedFee ? await this.getSuggestedFees() : fee;

      const fromAddress: string = this.getAddress(xpub, addressIndex);
      const amountSatoshis: number = Math.round(parseFloat(amount) * 1e8);
      let amountWithFeeSatoshis: number = amountSatoshis;

      console.log('fromAddress', fromAddress);
      console.log('amountSatoshis', amountSatoshis);

      // Assume inputs cover fee. If not, create a new PSBT until fee is covered
      let psbt: Psbt;
      let totalInput: number;
      let totalNumInputs: number;
      let totalFee: number;
      const signer = new FortisCardSigner(pin, addressIndex, this.getPublicKey(xpub, addressIndex))
      do {
        ({ psbt, totalInput, totalNumInputs } = await this.constructPsbt(fromAddress, toAddress, amountWithFeeSatoshis));

        // Check if fee is covered from inputs
        totalFee = this.getFee(totalNumInputs, 1, Number(satsPerVByte));
        amountWithFeeSatoshis += totalFee;
      } while (totalFee + amountSatoshis > totalInput);

      // Check if change is greater than dust limit plus added fee from adding a change output. If not, add change to fee.
      const change: number = totalInput - amountSatoshis - totalFee;
      const changeOutputFee: number = BitcoinNativeSegWitProtocol.PSBT_OUTPUT_VIRTUAL_SIZE * Number(satsPerVByte);
      if (change > BitcoinNativeSegWitProtocol.PSBT_DUST_THRESHOLD + changeOutputFee) {
          totalFee += changeOutputFee;
          psbt.addOutput({ address: fromAddress, value: change - changeOutputFee });
      } else {
        totalFee += change;
      }

      // Sign inputs
      await psbt.signAllInputsAsync(signer);
      psbt.finalizeAllInputs();
      const signedTx: string = psbt.extractTransaction().toHex();
      console.log('signedTx:', signedTx);
      return { signedTx, totalFee: totalFee / 1e8 };
    } catch (error) {
      return this.handleError(error, 'signTx');
    }
  }

  public async broadcastTx(signedTx: string): Promise<string> {
    try {
      const txReceipt = await BitcoinNativeSegWitProtocol.MEMPOOL.transactions.postTx({ txhex: signedTx }) as string;
      console.log('tx receipt:', txReceipt);
      return txReceipt;
    } catch (error) {
      return this.handleError(error, 'broadcastTx');
    }
  }

  public async getBalance(xpub: string, addressIndex: number): Promise<string> {
    try {
      const address: string = this.getAddress(xpub, addressIndex);
      const utxos: Utxo[] = await this.fetchUtxos(address);
      const balance: number = utxos.reduce((sum, utxo) => sum + utxo.value, 0) / 1e8;
      return balance.toFixed(18).replace(/\.?0+$/, "");
    } catch (error) {
      return this.handleError(error, 'getBalance');
    }
  }

  public getAddress(xpub: string, addressIndex: number): string {
    try {
      const pubKey: Buffer = this.getPublicKey(xpub, addressIndex);
      const { address } = bitcoinjs.payments.p2wpkh({ 
        pubkey: pubKey,
        network: BitcoinNativeSegWitProtocol.NETWORK
      });
      return address!;
    } catch (error) {
      return this.handleError(error, 'getAddress'); 
    }
  }

  public async getSuggestedFees(): Promise<Record<string, bigint>> {
    try {
      return { satsPerVByte: BigInt((await BitcoinNativeSegWitProtocol.MEMPOOL.fees.getFeesRecommended()).fastestFee) };
    } catch (error) {
      return this.handleError(error, 'getFees');
    }
  }


  private async fetchUtxos(address: string): Promise<Utxo[]> {
    try {
      const addressTxsUtxo = await BitcoinNativeSegWitProtocol.MEMPOOL.addresses.getAddressTxsUtxo({ address });
      const utxos: Utxo[] = addressTxsUtxo.map((utxo): Utxo => ({
          txid: utxo.txid,
          vout: utxo.vout,
          value: utxo.value
      }));
      return utxos;
    } catch (error) {
      return this.handleError(error, 'fetchUtxos'); 
    }
  }

  private async constructPsbt(fromAddress: string, toAddress: string, amountSatoshis: number): Promise<{ psbt: Psbt, totalInput: number, totalNumInputs: number }> {
    try {
      // Select UTXOs until we cover the amount
      const psbt: Psbt = new Psbt({ network: BitcoinNativeSegWitProtocol.NETWORK });
      const utxos: Utxo[] = await this.fetchUtxos(fromAddress);
      let totalInput: number = 0;
      let totalNumInputs: number = 0;
      for (const utxo of utxos) {
        if (totalInput >= amountSatoshis) {
          break;
        }
        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          witnessUtxo: {
            script: bitcoinjs.address.toOutputScript(fromAddress, BitcoinNativeSegWitProtocol.NETWORK),
            value: utxo.value,
          }
        });
        totalInput += utxo.value;
        ++totalNumInputs;
      }
      if (totalInput < amountSatoshis) {
        throw new Error('Not enough funds');
      }

      // Add the output sending the specified amount to the destination address
      psbt.addOutput({
        address: toAddress,
        value: amountSatoshis,
      });

      return { psbt, totalInput, totalNumInputs };
    } catch (error) {
      return this.handleError(error, 'constructPsbt');
    }
  }

  private getFee(numInputs: number, numOutputs: number, satsPerVByte: number): number {
    return Math.ceil((BitcoinNativeSegWitProtocol.PSBT_OVERHEAD_VIRTUAL_SIZE + numInputs * BitcoinNativeSegWitProtocol.PSBT_INPUT_VIRTUAL_SIZE + numOutputs * BitcoinNativeSegWitProtocol.PSBT_OUTPUT_VIRTUAL_SIZE) * satsPerVByte);
  }
}
