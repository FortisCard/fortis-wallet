import hash from 'hash.js';
import bs58 from 'bs58';
import NfcManager, { NfcTech } from 'react-native-nfc-manager';
import { useNfc } from '../components/nfc/NfcContext';

export enum INSTRUCTIONS {
  SELECT_APPLET = 0xA4,
  INS_SIGN_TRANSACTION = 0x20,
  INS_ACCOUNT_DISCOVERY = 0x30,
  INS_FIRMWARE_VERSION = 0x40,
}

export enum ELLIPTIC_CURVE {
  SECP256K1 = 0x10
}

/**
 * FortisCardAPI
 * 
 * This class provides methods to generate APDU (Application Protocol Data Unit) commands
 * for communicating with the FortisCard hardware wallet, sends it to the FortisCard through
 * NFC, and recieves APDUs of response and status words back.
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
  private static APPLET_AID = [0xA0, 0x01, 0x02, 0x03, 0x04, 0x05, 0x01, 0x01];
  public static readonly LATEST_FIRMWARE_VERSION = '1.0.0';

  /**
   * @returns The firmware version of the FortisCard
   */
  public static async getFirmwareVersion(): Promise<string> {
    const apdu: number[] = [0x00, INSTRUCTIONS.INS_FIRMWARE_VERSION, 0x00, 0x00, 0x00];
    const response: number[] = await this.sendApdu(apdu);
    return response.slice(0, 3).join('.');
  }

  /**
   * @param pin - The user's PIN for authentication (8 bytes)
   * @param purpose - The purpose field as per BIP-44 (4 bytes)
   * @param coinType - The coin_type as per BIP-44 (4 bytes)
   * @param ellipticCurve - The elliptic curve to use for signing (1 byte)
   * @param versionBytes - The version bytes for the specific coin (4 bytes)
   *
   * @returns The xpub as a base 58 encoded string
   */
  public static async getXpub(
    pin: number[],
    purpose: number,
    coinType: number,
    ellipticCurve: ELLIPTIC_CURVE,
    versionBytes: number[]
  ): Promise<string> {
    const response = await this.getXpubData(pin, purpose, coinType, ellipticCurve);
    return this.constructXpub(response, versionBytes);
  }

  /**
   * @param pin - The user's PIN for authentication (8 bytes)
   * @param purpose - The purpose field as per BIP-44 (4 bytes)
   * @param coinType - The coin_type as per BIP-44 (4 bytes)
   * @param change - The change (0 for external, 1 for internal) as per BIP-44 (1 byte)
   * @param addressIndex - The address_index (0-255) as per BIP-44 (1 byte)
   * @param ellipticCurve - The elliptic curve to use for signing (1 byte)
   * @param transactionHash - The hash of the transaction to sign (32 bytes)
   *
   * @returns { recoveryId (1 byte), r (32 bytes), s (32 bytes) }
   */
  public static async getSignature(
    pin: number[],
    purpose: number,
    coinType: number,
    change: number,
    addressIndex: number,
    ellipticCurve: ELLIPTIC_CURVE,
    transactionHash: number[]
  ): Promise<{ recoveryId: number, r: number[], s: number[] }> {
    if (addressIndex < 0 || addressIndex > 255) {
      throw new Error('Invalid address index');
    }

    const coinTypeArray: number[] = [
        (coinType >> 24) & 0xFF,
        (coinType >> 16) & 0xFF,
        (coinType >> 8) & 0xFF,
        coinType & 0xFF
    ];

    const data: number[] = [
      ...pin,
      purpose,
      ...coinTypeArray,
      change,
      addressIndex,
      ellipticCurve,
      ...transactionHash
    ];

    const apdu: number[] = [0x00, INSTRUCTIONS.INS_SIGN_TRANSACTION, 0x00, 0x00, data.length, ...data];
    const response: number[] = await this.sendApdu(apdu);
    const recoveryId: number = response[0];
    const r = response.slice(1, 33);
    const s = response.slice(33, 65);

    return { recoveryId, r, s };
  }

  /**
   * Sends an APDU command to the FortisCard and returns the response.
   * 
   * @param apdu - The APDU command to send
   * 
   * @returns The response from the FortisCard or an error if the response is invalid
   */
  private static async sendApdu(apdu: number[]): Promise<number[]> {
    return new Promise(async (resolve, reject) => {
      try {
        this.nfcContext?.showNfcPrompt();
        await NfcManager.start();
        await NfcManager.requestTechnology(NfcTech.IsoDep);
        await NfcManager.setTimeout(5000);

        const select_applet_apdu = [0x00, INSTRUCTIONS.SELECT_APPLET, 0x04, 0x00, this.APPLET_AID.length, ...this.APPLET_AID];
        console.log(`Sending APDU: ${select_applet_apdu.map(byte => byte.toString(16)).join(' ')}`);
        const select_applet_response = await NfcManager.transceive(select_applet_apdu);
        console.log(`Received APDU: ${select_applet_response.map(byte => byte.toString(16)).join(' ')}`);
        this.checkResponse(select_applet_response);

        console.log(`Sending APDU: ${apdu.map(byte => byte.toString(16)).join(' ')}`);
        const response = await NfcManager.transceive(apdu);
        console.log(`Received APDU: ${response.map(byte => byte.toString(16)).join(' ')}`);
        this.checkResponse(response);
        resolve(response);
      } catch (err) {
        reject(err);
      } finally {
        NfcManager.cancelTechnologyRequest();
        this.nfcContext?.hideNfcPrompt();
      }
    });
  }

  /**
   * Gets all necessary data to construct xpub. Use the returned information
   * to construct an xpub using BIP-32 Extended Key Serialization format.
   * https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki#Serialization-format
   * 
   * @param pin - The user's PIN for authentication (8 bytes)
   * @param purpose - The purpose field as per BIP-44 (4 bytes)
   * @param coinType - The coin_type as per BIP-44 (4 bytes)
   * @param ellipticCurve - The elliptic curve to use for signing (1 byte)
   * @returns An APDU command as a number[]
   *
   * When sent to FortisCard, it should return (in order):
   * 1. 32 bytes: SHA-256 of coin type public key
   * 2. 32 bytes: Chain code of account extended key
   * 3. 33 bytes: SEC1 compressed form of account public key
   * 4. Success status (0x9000)
   *    Error status if PIN is incorrect, invalid parameters, or other issues occur
   */
  private static async getXpubData(
    pin: number[],
    purpose: number,
    coinType: number,
    ellipticCurve: ELLIPTIC_CURVE
  ): Promise<number[]> {

    const coinTypeArray: number[] = [
        (coinType >> 24) & 0xFF,
        (coinType >> 16) & 0xFF,
        (coinType >> 8) & 0xFF,
        coinType & 0xFF
    ];

    const data: number[] = [
      ...pin,
      purpose,
      ...coinTypeArray,
      ellipticCurve,
    ];

    const apdu: number[] = [0x00, INSTRUCTIONS.INS_ACCOUNT_DISCOVERY, 0x00, 0x00, data.length, ...data];
    return await this.sendApdu(apdu);
  }

  /**
   * Constructs and returns the xpub (extended public key) using the information from the FortisCard.
   * 
   * @param response - The response from the FortisCard after sending the APDU command from getXpubData
   * @param versionBytes - The version bytes for the specific coin (4 bytes)
   * @returns The xpub as a base 58 encoded string
   */
  private static constructXpub(response: number[], versionBytes: number[]): string {
    const sha256Result: number[] = response.slice(0, 32);
    const chainCode: number[] = response.slice(32, 64);
    const publicKey: number[] = response.slice(64, 97);

    const depth: number = 3; // depth for account-level key
    const childNumber: number[] = [0x80, 0x00, 0x00, 0x00]; // hardened child number for account 0'
    const parentFingerprint: number[] = this.ripemd160(sha256Result).slice(0, 4);

    const xpubBytes: number[] = [
      ...versionBytes,
      depth,
      ...parentFingerprint,
      ...childNumber,
      ...chainCode,
      ...publicKey
    ];

    const checksum = this.sha256(this.sha256(xpubBytes)).slice(0, 4);
    const xpubWithChecksum: number[] = [...xpubBytes, ...checksum];

    return bs58.encode(xpubWithChecksum);
  }

  public static setNfcContext(context: ReturnType<typeof useNfc>) {
    FortisCardAPI.nfcContext = context;
  }

  /**
   * Checks the response from the FortisCard and throws an error if the status code is not 0x9000.
   * 
   * @param response - The response from the FortisCard
   */
  private static checkResponse(response: number[]): void {
    const statusCode = (response[response.length - 2] << 8) | response[response.length - 1];
    switch (statusCode) {
      case 0x9000:
        // Valid response
        break;
      case 0x9704:
        const attempts = response[response.length - 3];
        throw new Error(`Warning: Wrong PIN attempt. ${3 - attempts} attempts remaining.`);
      case 0x9700:
        throw new Error('Error: FortisCard is now locked and needs to be reinitialized.');
      default:
        throw new Error(`Internal error: Invalid response code ${statusCode.toString(16)}`);
    }
  }

  private static sha256 = (data: number[]): number[] => {
    return hash.sha256().update(data).digest();
  };

  private static ripemd160 = (data: number[]): number[] => {
    return hash.ripemd160().update(data).digest();
  };
}
