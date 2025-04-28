import { useNfc } from '../components/nfc/NfcContext';
import HDKey from 'hdkey';
import * as bip39 from 'bip39';
import { ec as EC } from 'elliptic';
import bs58check from 'bs58check';

export enum INSTRUCTIONS {
  SELECT_APPLET = 0xA4,
  INS_STORE_ENCRYPTED_MASTER_SEED = 0x10,
  INS_SIGN_TRANSACTION = 0x20,
  INS_ACCOUNT_DISCOVERY = 0x30,
  INS_FIRMWARE_VERSION = 0x40,
}

export enum ELLIPTIC_CURVE {
  SECP256K1 = 0x10
}

/**
 * FortisCardAPI - Development version
 * 
 * This class provides methods to fake generating APDU (Application Protocol Data Unit) commands
 * for communicating with the FortisCard hardware wallet. The application will still show NFC 
 * modal popup for around a second and then recieve all of the proper information from the mnemonic.
 *
 * NOTE: FortisCard only supports account 0' and address indices 0-255. Account 0' is the
 * only account that should be used with a hardware wallet for security reasons.
 *
 * NOTE: All BIP-44 fields are sent unhardened to the FortisCard. The FortisCard will
 * automatically harden the fields as needed.
 *
 */
export class FortisCardAPI {
  private static nfcContext: ReturnType<typeof useNfc> | null = null;
  public static readonly LATEST_FIRMWARE_VERSION = '1.0.0';
  private static mnemonic: string = 'sausage cost core ozone then scatter oppose switch barrel jeans snake pony';
  private static password?: string;
  private static readonly ec = new EC('secp256k1');

  /**
   * @returns The firmware version of the FortisCard
   */
  public static async getFirmwareVersion(): Promise<string> {
    return this.LATEST_FIRMWARE_VERSION;
  }

  /**
   * @param mnemonic - The BIP-39 mnemonic to store to the FortisCard
   * @param password - The BIP-39 password to store to the FortisCard
   *
   */
  public static async storeEncryptedMasterSeed(
    _pin: number[],
    mnemonic: string,
    password?: string
  ) {
    this.mnemonic = mnemonic;
    this.password = password;
  }

  /**
   * @param purpose - The purpose field as per BIP-44 (4 bytes)
   * @param coinType - The coin_type as per BIP-44 (4 bytes)
   * @param versionBytes - The version bytes for the specific coin (4 bytes)
   *
   * @returns The xpub as a base 58 encoded string
   */
  public static async getXpub(
    _pin: number[],
    purpose: number,
    coinType: number,
    _ellipticCurve: ELLIPTIC_CURVE,
    versionBytes: number[]
  ): Promise<string> {
    await this.wait(100);
    const child = await this.bip32derive(`m/${purpose}'/${coinType}'/0'`);
    const xpub = bs58check.decode(child.publicExtendedKey);
    versionBytes.forEach((b, i) => { xpub[i] = b; });
    return bs58check.encode(xpub);
  }

  /**
   * @param purpose - The purpose field as per BIP-44 (4 bytes)
   * @param coinType - The coin_type as per BIP-44 (4 bytes)
   * @param change - The change (0 for external, 1 for internal) as per BIP-44 (1 byte)
   * @param addressIndex - The address_index (0-255) as per BIP-44 (1 byte)
   * @param transactionHash - The hash of the transaction to sign (32 bytes)
   *
   * @returns { recoveryId (1 byte), r (32 bytes), s (32 bytes) }
   */
  public static async getSignature(
    _pin: number[],
    purpose: number,
    coinType: number,
    change: number,
    addressIndex: number,
    _ellipticCurve: ELLIPTIC_CURVE,
    transactionHash: number[]
  ): Promise<{ recoveryId: number, r: number[], s: number[] }> {
    if (addressIndex < 0 || addressIndex > 255) {
      throw new Error('Invalid address index');
    }

    await this.wait(100);
    const child = await this.bip32derive(`m/${purpose}'/${coinType}'/0'/${change}/${addressIndex}`);

    const key = this.ec.keyFromPrivate(child.privateKey!);
    const signature = key.sign(Buffer.from(transactionHash), { canonical: true });
    const recoveryId: number = signature.recoveryParam!;
    const r: number[] = Array.from(signature.r.toArrayLike(Buffer, 'be', 32));
    const s: number[] = Array.from(signature.s.toArrayLike(Buffer, 'be', 32));

    return { recoveryId, r, s };
  }

  public static setNfcContext(context: ReturnType<typeof useNfc>) {
    FortisCardAPI.nfcContext = context;
  }

  private static async bip32derive(derivePath: string) {
    const seed: Buffer = await bip39.mnemonicToSeed(this.mnemonic, this.password);
    const root = HDKey.fromMasterSeed(seed);
    return root.derive(derivePath);
  }

  private static async wait(ms: number) {
    this.nfcContext?.showNfcPrompt();
    await new Promise(resolve => setTimeout(resolve, ms));
    this.nfcContext?.hideNfcPrompt();
  }
}
