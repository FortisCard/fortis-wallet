import { ELLIPTIC_CURVE } from '../utils/FortisCardAPI';
import HDKey from 'hdkey';

export interface ProtocolStatic {
  COIN_TYPE: number;
  PURPOSE: number;
  VERSION_BYTES: number[];
  CURVE: ELLIPTIC_CURVE;
  SYMBOL: string;
  NAME: string;
  BLOCKCHAIN_EXPLORER_URL: string;
}

export abstract class BaseProtocol {
  public static readonly PURPOSE: number = 44;
  public static readonly VERSION_BYTES: number[] = [0x04, 0x88, 0xB2, 0x1E]; // b'xpub'
  public static readonly CURVE: ELLIPTIC_CURVE = ELLIPTIC_CURVE.SECP256K1;
  public static readonly COIN_TYPE: number;
  public static readonly SYMBOL: string;
  public static readonly NAME: string;
  public static readonly BLOCKCHAIN_EXPLORER_URL: string;

  protected constructor() {}
  public abstract getStaticConfig(): ProtocolStatic;

  abstract fee_t : Record<string, bigint>;
  /**
   * @param xpub: xpub of sender wallet in base58
   * @param toAddress: address of recipient in hex (prepended with '0x')
   * @param amount: amount to send to 'toAddress' in 'SYMBOL' units as a decimal string
   * @param fee: User inputs all values for keys provided on the app's send page.
   * @param useSuggestedFee: Use fee values from 'this.getSuggestedFees()' and disregard param 'fee'
   * @param data: Arbitrary data to include in the tx in hex (prepended with '0x')
   *
   * @returns signedTx: signed tx in hex 
   * @returns totalFee: total fee in SYMBOL units
  */
  public abstract signTx(xpub: string, toAddress: string, addressIndex: number, amount: string, fee: Record<string, bigint>, useSuggestedFee: boolean, pin: number[], data?: string): Promise<{ signedTx: string, totalFee: number }>;
  /*
   * @returns broadcasted tx hash
  */
  public abstract broadcastTx(signedTx: string): Promise<string>;
  public abstract getBalance(xpub: string, addressIndex: number): Promise<string>;
  public abstract getAddress(xpub: string, addressIndex: number): string;
  public abstract getSuggestedFees(): Promise<Record<string, bigint>>;

  public getPublicKey(xpub: string, addressIndex: number): Buffer {
    try {
      const versionBytes = this.getStaticConfig().VERSION_BYTES;
      return HDKey.fromExtendedKey(xpub, {public: versionBytes.reduce((acc, byte) => (acc << 8) | byte, 0), private: 0}).derive("m/0/" + addressIndex).publicKey!;
    } catch (error) {
      return this.handleError(error, 'getPublicKey');
    }
  }

  public useWalletConnect(): boolean {
    return false;
  }

  public getChainId(): number | null {
    return null;
  }

  protected handleError(error: any, context: string): never {
    console.error(`${this.getStaticConfig().NAME} protocol error (${context}):`, error);
    throw error;
  }
}
