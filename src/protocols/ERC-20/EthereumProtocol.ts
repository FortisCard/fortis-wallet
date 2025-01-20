import Config from 'react-native-config';
import { BaseProtocol, ProtocolStatic } from '../BaseProtocol';
import { FortisCardAPI } from '../../utils/FortisCardAPI';
import { fromHex, toHex } from '../../utils/utils';
import { ethers } from 'ethers';

export class EthereumProtocol extends BaseProtocol {
  private static instance: EthereumProtocol;

  public static readonly COIN_TYPE: number = 60;
  public static readonly SYMBOL: string = 'ETH';
  public static readonly NAME: string = 'Ethereum';
  public static readonly BLOCKCHAIN_EXPLORER_URL: string = 'https://etherscan.io/tx/';

  // In wei
  fee_t: Record<string, bigint> = { maxFeePerGas: -1n, maxPriorityFeePerGas: -1n, gasLimit: -1n };

  protected readonly CHAIN_ID: number = 1;
  protected readonly provider = new ethers.JsonRpcProvider(`https://mainnet.infura.io/v3/${Config.INFURA_API_KEY}`);

  protected constructor() {
    super();
  }

  public getStaticConfig(): ProtocolStatic {
    return {
      COIN_TYPE: EthereumProtocol.COIN_TYPE,
      PURPOSE: EthereumProtocol.PURPOSE,
      VERSION_BYTES: EthereumProtocol.VERSION_BYTES,
      CURVE: EthereumProtocol.CURVE,
      SYMBOL: EthereumProtocol.SYMBOL,
      NAME: EthereumProtocol.NAME,
      BLOCKCHAIN_EXPLORER_URL: EthereumProtocol.BLOCKCHAIN_EXPLORER_URL,
    };
  }

  public static getInstance(): EthereumProtocol {
    if (!EthereumProtocol.instance) {
      EthereumProtocol.instance = new EthereumProtocol();
    }
    return EthereumProtocol.instance;
  }


  public async signTx(xpub: string, toAddress: string, addressIndex: number, amount: string, fee: Record<string, bigint>, useSuggestedFee: boolean, pin: number[], data: string): Promise<{ signedTx: string, totalFee: number }> {
    try {
      console.log('xpub', xpub);
      console.log('addressIndex', addressIndex);
      console.log('toAddress', toAddress);
      console.log('amount', amount);
      console.log('fee', fee);
      console.log('pin', pin);

      const fromAddress: string = this.getAddress(xpub, addressIndex);
      const nonce: number = await this.provider.getTransactionCount(fromAddress);
      const eip155: boolean = 'gasPrice' in fee;
      const baseFeePerGas: bigint | null = eip155 ? null : (await this.provider.getBlock('latest'))?.baseFeePerGas!;
      let unsignedTxData: Record<string, any> = {
        data,
        type: eip155 ? 0 : 2,
        chainId: this.CHAIN_ID,
        nonce,
        to: toAddress,
        value: Math.round(parseFloat(amount) * 1e18),
      };
      let totalFee: number;
      let gasLimit: bigint

      if (eip155) {
        // Construct unsigned EIP-155 transaction
        console.log('EIP-155 transaction');
        const { gasPrice } = useSuggestedFee ? await this.getSuggestedFees() : fee;
        unsignedTxData = { ...unsignedTxData, gasPrice };
        gasLimit = useSuggestedFee ? await this.provider.estimateGas(unsignedTxData) : fee.gasLimit;
        totalFee = Number(ethers.formatEther(gasPrice! * gasLimit));
      } else {
        // Construct unsigned EIP-1559 transaction
        console.log('EIP-1559 transaction');
        const { maxFeePerGas, maxPriorityFeePerGas } = useSuggestedFee ? await this.getSuggestedFees() : fee;
        unsignedTxData = { ...unsignedTxData, maxFeePerGas, maxPriorityFeePerGas };
        gasLimit = useSuggestedFee ? await this.provider.estimateGas(unsignedTxData) : fee.gasLimit;
        totalFee = Number(ethers.formatEther(maxFeePerGas! < maxPriorityFeePerGas! + baseFeePerGas! ? maxFeePerGas! : maxPriorityFeePerGas! + baseFeePerGas! * gasLimit));
      }

      const unsignedTx = ethers.Transaction.from({ ...unsignedTxData, gasLimit });
      console.log('gasLimit:', gasLimit);
      console.log('unsignedTx', unsignedTx);
      console.log('hex:', unsignedTx.unsignedSerialized);
      const hash: number[] = fromHex(ethers.keccak256(unsignedTx.unsignedSerialized).slice(2));

      let { recoveryId, r, s } = await FortisCardAPI.getSignature(
        pin,
        EthereumProtocol.PURPOSE,
        EthereumProtocol.COIN_TYPE,
        0, // change
        addressIndex,
        EthereumProtocol.CURVE,
        hash
      );

      console.log('recoveryId: ', recoveryId);
      console.log('r: ', toHex(r));
      console.log('s: ', toHex(s));

      const r_str: string = '0x' + toHex(r);
      let s_str: string = '0x' + toHex(s);

      // EIP-2: Canonicalize 's'
      const SECP256K1_N = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
      const s_bigint: bigint = ethers.getBigInt('0x' + toHex(s));
      if (s_bigint > SECP256K1_N / BigInt(2)) {
        s_str = '0x' + (SECP256K1_N - s_bigint).toString(16);
        recoveryId = 1 - recoveryId;
      }

      // Create and serialize signed transaction
      const signedTx: string = ethers.Transaction.from({
        ...unsignedTxData,
        gasLimit,
        signature: ethers.Signature.from({
          r: r_str,
          s: s_str,
          yParity: recoveryId ? 1 : 0
        })
      }).serialized;

      console.log('signedTx', signedTx);
      console.log('totalFee', totalFee);
      return { signedTx, totalFee };
    } catch (error) {
      return this.handleError(error, 'signTx');
    }
  }

  public async broadcastTx(signedTx: string): Promise<string> {
    try {
      const txReceipt = await this.provider.broadcastTransaction(signedTx);
      console.log('txReceipt: ', txReceipt.hash);
      return txReceipt.hash;
    } catch (error) {
      return this.handleError(error, 'broadcastTx');
    }
  }

  public async getBalance(xpub: string, addressIndex: number): Promise<string> {
    try {
      const address: string = this.getAddress(xpub, addressIndex);
      return ethers.formatEther(await this.provider.getBalance(address));
    } catch (error) {
      return this.handleError(error, 'getBalance');
    }
  }

  public getAddress(xpub: string, addressIndex: number): string {
    try {
      const pubKey = this.getPublicKey(xpub, addressIndex);
      return ethers.computeAddress('0x' + pubKey.toString('hex'));
    } catch (error) {
      return this.handleError(error, 'getAddress');
    }
  }

  public async getSuggestedFees(): Promise<Record<string, bigint>> {
    try {
      const { maxFeePerGas, maxPriorityFeePerGas, gasPrice } = await this.provider.getFeeData();
      return {
        maxFeePerGas: maxFeePerGas ?? BigInt(0),
        maxPriorityFeePerGas: maxPriorityFeePerGas ?? BigInt(0),
        gasPrice: gasPrice ?? BigInt(0),
      };
    } catch (error) {
      return this.handleError(error, 'getFees');
    }
  }

  public useWalletConnect(): boolean {
    return true;
  }

  public getChainId(): number | null {
    return this.CHAIN_ID;
  }
}
