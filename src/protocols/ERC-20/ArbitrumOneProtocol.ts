import Config from 'react-native-config';
import { EthereumProtocol } from './EthereumProtocol';
import { ProtocolStatic } from '../BaseProtocol';
import { ethers } from 'ethers';

export class ArbitrumOneProtocol extends EthereumProtocol {
  private static _instance: ArbitrumOneProtocol;

  public static readonly NAME: string = 'Arbitrum One';
  public static readonly BLOCKCHAIN_EXPLORER_URL: string = 'https://arbiscan.io/tx/';

  protected readonly CHAIN_ID: number = 42161;
  protected readonly provider = new ethers.JsonRpcProvider(`https://arbitrum-mainnet.infura.io/v3/${Config.INFURA_API_KEY}`);

  protected constructor() {
    super();
  }

  public getStaticConfig(): ProtocolStatic {
    return {
      COIN_TYPE: ArbitrumOneProtocol.COIN_TYPE,
      PURPOSE: ArbitrumOneProtocol.PURPOSE,
      VERSION_BYTES: ArbitrumOneProtocol.VERSION_BYTES,
      CURVE: ArbitrumOneProtocol.CURVE,
      SYMBOL: ArbitrumOneProtocol.SYMBOL,
      NAME: ArbitrumOneProtocol.NAME,
      BLOCKCHAIN_EXPLORER_URL: ArbitrumOneProtocol.BLOCKCHAIN_EXPLORER_URL,
    };
  }

  public static getInstance(): ArbitrumOneProtocol {
    if (!ArbitrumOneProtocol._instance) {
      ArbitrumOneProtocol._instance = new ArbitrumOneProtocol();
    }
    return ArbitrumOneProtocol._instance;
  }
}
