import Config from 'react-native-config';
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import '@walletconnect/react-native-compat';
import { Core } from '@walletconnect/core';
import { WalletKit } from '@reown/walletkit';
import { buildApprovedNamespaces, getSdkError } from '@walletconnect/utils';
import { useWallet } from './WalletContext';
import { FortisCardAPI } from '../../utils/FortisCardAPI';
import { EthereumProtocol } from '../../protocols/ERC-20/EthereumProtocol';
import { ethers } from 'ethers';
import { fromHex, toHex } from '../../utils/utils';

interface WalletConnectContextType {
  connect: (uri: string) => Promise<void>;
  disconnect: (topic: string) => Promise<void>;
  isConnected: boolean;
  sessions: Record<string, any>;
  pendingRequest: PendingRequest | null;
  pendingProposal: SessionProposal | null;
  confirmRequest: (approved: boolean) => Promise<void>;
  confirmProposal: (approved: boolean) => Promise<void>;
}

interface PendingRequest {
  topic: string;
  id: number;
  method: string;
  details: Record<string, string>;
  params: any; // Keep original params for signing
}

interface SessionProposal {
  id: number;
  params: {
    proposer: {
      metadata: {
        name: string;
        description: string;
        url: string;
        icons: string[];
      };
    };
    requiredNamespaces: Record<string, any>;
  };
}
const WalletConnectContext = createContext<WalletConnectContextType | null>(null);

export const WalletConnectProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const walletKitRef = useRef<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [sessions, setSessions] = useState<Record<string, any>>({});
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
  const [pendingProposal, setPendingProposal] = useState<SessionProposal | null>(null);
  const { selectedAccount } = useWallet();

  useEffect(() => {
    initializeWalletConnect();
  }, []);

  const getSupportedNamespaces = () => {
    if (!selectedAccount) return {};

    const protocol = selectedAccount.protocol;
    const chainId = protocol.getChainId();
    const address = protocol.getAddress(selectedAccount.xpub, selectedAccount.addressIndex);

    return {
      eip155: {
        chains: [chainId == 1 ? `eip155:1` : `eip155:1`, `eip155:${chainId}`],
        methods: [
          'eth_sendTransaction',
          'eth_sign',
          'personal_sign',
        ],
        events: ['accountsChanged', 'chainChanged'],
        accounts: [chainId == 1 ? `eip155:1:${address}` : `eip155:1:${address}`, `eip155:${chainId}:${address}`]
      }
    };
  };

  const initializeWalletConnect = async () => {
    try {
      const core = new Core({
        projectId: Config.WALLET_CONNECT_PROJECT_ID
      });

      const walletKit = await WalletKit.init({
        core,
        metadata: {
          name: 'Fortis Wallet',
          description: 'Secure hardware wallet for your digital assets',
          url: 'https://www.fortis-card.com',
          icons: ['https://www.fortis-card.com/icon.png'],
        }
      });

      walletKitRef.current = walletKit;

      walletKit.on('session_proposal', onSessionProposal);
      walletKit.on('session_request', onSessionRequest);
      walletKit.on('session_delete', onSessionDelete);

      const activeSessions = walletKit.getActiveSessions();
      setSessions(activeSessions);
      setIsConnected(Object.keys(activeSessions).length > 0);
    } catch (error) {
      console.error('Failed to initialize WalletConnect:', error);
    }
  };

  const onSessionProposal = async (event: { id: number; params: any }) => {
    console.log('Received session proposal:', event);

    if (!walletKitRef.current) return;
    setPendingProposal({
      id: event.id,
      params: event.params
    });
    console.log('setPendingProposal:', {
      id: event.id,
      params: event.params
    });
  };

  const confirmProposal = async (approved: boolean) => {
    if (!pendingProposal || !walletKitRef.current) return;

    try {
      if (approved) {
        const supportedNamespaces = getSupportedNamespaces();
        const approvedNamespaces = buildApprovedNamespaces({
          proposal: pendingProposal.params as any,
          supportedNamespaces: supportedNamespaces as any
        });

        const session = await walletKitRef.current.approveSession({
          id: pendingProposal.id,
          namespaces: approvedNamespaces
        });

        if (session) {
          setSessions(prev => ({ ...prev, [session.topic]: session }));
          setIsConnected(true);
        }
      } else {
        await walletKitRef.current.rejectSession({
          id: pendingProposal.id,
          reason: getSdkError('USER_REJECTED')
        });
      }
    } catch (error) {
      console.error('Failed to handle session proposal:', error);
      await walletKitRef.current.rejectSession({
        id: pendingProposal.id,
        reason: getSdkError('USER_REJECTED')
      });
    } finally {
      setPendingProposal(null);
    }
  };

  const onSessionRequest = async (event: { topic: string; params: any; id: number }) => {
    console.log('Received request:', event);
    console.log('request.params:', event.params.request.params, '\n');

    if (!walletKitRef.current) return;
    const { topic, params, id } = event;
    const { request } = params;
    let details: Record<string, string>;

    switch (request.method) {
      case 'eth_sendTransaction':
        const tx = request.params[0];
        details = {
          to: tx.to as string,
          value: ethers.formatEther(BigInt(tx.value)), // Convert from wei to ether
          gasPrice: BigInt(tx.gasPrice).toString(10),
          gasLimit: BigInt(tx.gasLimit ?? tx.gas).toString(10),
          data: tx.data as string,
        };
        break;
      case 'eth_sign':
      case 'personal_sign':
        details = {
          message: Buffer.from(request.params[0].slice(2), 'hex').toString('utf8'),
        };
        break;
      default:
        details = {
          raw: JSON.stringify(request.params, null, 2)
        };
    }

    setPendingRequest({
      topic,
      id,
      method: request.method,
      details,
      params: request.params
    });

    console.log('setPendingRequest:', {
      topic,
      id,
      method: request.method,
      details,
      params: request.params
    });
  };

  const confirmRequest = async (approved: boolean) => {
    if (!pendingRequest || !selectedAccount) return;

    try {
      if (approved) {
        let result: string;
        const protocol = selectedAccount.protocol;
        const xpub = selectedAccount.xpub;
        const addressIndex = selectedAccount.addressIndex;
        const param0 = pendingRequest.params[0];
        const pin = [112, 97, 115, 115, 119, 111, 114, 100]; // TODO: Replace with proper PIN input

        console.log('Pending request:', pendingRequest);
        console.log('param0:', param0);

        switch (pendingRequest.method) {
          case 'eth_sendTransaction':
            // pendingRequest.params: [{"data": "0x", "from": "0x0", "gasLimit": "0x0", "gasPrice": "0x0", "nonce": "0x0", "to": "0x0", "value": "0x0"}]
            const { signedTx } = await protocol.signTx(xpub, param0.to, addressIndex, ethers.formatEther(BigInt(param0.value)), { gasPrice: BigInt(param0.gasPrice), gasLimit: BigInt(param0.gasLimit ?? param0.gas) }, false, pin, param0.data);
            result = await protocol.broadcastTx(signedTx);
            break;
          case 'eth_sign':
          case 'personal_sign':
            // pendingRequest.params: ["0x0", "0x0"] (message, fromAddress)
            // EIP-191 encode
            const messageBytes: Uint8Array = ethers.getBytes(param0);
            const prefix: string = `\x19Ethereum Signed Message:\n${messageBytes.length}`;
            const formattedMessage: string = ethers.concat([ethers.toUtf8Bytes(prefix), messageBytes]);
            const messageHash: string = ethers.keccak256(formattedMessage);
            const hash: number[] = Array.from(ethers.getBytes(messageHash));
            let { recoveryId, r, s } = await FortisCardAPI.getSignature(pin, EthereumProtocol.PURPOSE, EthereumProtocol.COIN_TYPE, 0 /* change */, addressIndex, EthereumProtocol.CURVE, hash);
            //const v: number = recoveryId + 2 * selectedAccount.protocol.getChainId()! + 35;
            const v: number = recoveryId + 27;
            result = ethers.Signature.from({ r: '0x' + toHex(r), s: '0x' + toHex(s), v }).serialized;

            console.log('r:', toHex(r));
            console.log('s:', toHex(s));
            console.log('v:', v);
            break;
          default: throw new Error(`Unsupported method: ${pendingRequest.method}`);
        }

        console.log('result:', result);

        await walletKitRef.current.respondSessionRequest({
          topic: pendingRequest.topic,
          response: { id: pendingRequest.id, jsonrpc: '2.0', result }
        });
      } else {
        await walletKitRef.current.respondSessionRequest({
          topic: pendingRequest.topic,
          response: {
            id: pendingRequest.id,
            jsonrpc: '2.0',
            error: getSdkError('USER_REJECTED')
          }
        });
      }
    } catch (error) {
      await walletKitRef.current.respondSessionRequest({
        topic: pendingRequest.topic,
        response: {
          id: pendingRequest.id,
          jsonrpc: '2.0',
          error: {
            code: 5000,
            message: error instanceof Error ? error.message : 'Unknown error occurred'
          }
        }
      });
    } finally {
      setPendingRequest(null);
    }
  };

  const onSessionDelete = (event: { topic: string }) => {
    const { topic } = event;
    setSessions(prev => {
      const newSessions = { ...prev };
      delete newSessions[topic];
      return newSessions;
    });
    setIsConnected(false);
  };

  const connect = async (uri: string) => {
    try {
      console.log('Connecting to:', uri);
      console.log('WalletKit initialized?:', walletKitRef.current !== null);
      await walletKitRef.current.pair({ uri });
    } catch (error) {
      console.error('Failed to connect:', error);
    }
  };

  const disconnect = async (topic: string) => {
    try {
      await walletKitRef.current.disconnectSession({
        topic,
        reason: getSdkError('USER_DISCONNECTED')
      });
      setSessions(prev => {
        const newSessions = { ...prev };
        delete newSessions[topic];
        return newSessions;
      });
      setIsConnected(false);
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  };

  return (
    <WalletConnectContext.Provider value={{
      connect,
      disconnect,
      isConnected,
      sessions,
      pendingRequest,
      pendingProposal,
      confirmRequest,
      confirmProposal
    }}>
      {children}
    </WalletConnectContext.Provider>
  );
};

export const useWalletConnect = () => {
  const context = useContext(WalletConnectContext);
  if (!context) {
    throw new Error('useWalletConnect must be used within WalletConnectProvider');
  }
  return context;
};
