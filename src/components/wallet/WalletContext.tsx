import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BaseProtocol } from '../../protocols/BaseProtocol';
import { FortisCardAPI } from '../../utils/FortisCardAPI';
import  * as Protocols from '../../protocols/index';

export interface Account {
  protocol: BaseProtocol;
  xpub: string;
  addressIndex: number; // BIP-44 address_index
  selected: boolean;
}

interface IWalletContext {
  accounts: Account[];
  selectedAccount: Account | null;
  addAccount: (protocol: BaseProtocol, pin: number[]) => Promise<void>;
  selectAccount: (protocol: BaseProtocol, addressIndex: number) => void;
  deleteAccount: (protocol: BaseProtocol, addressIndex: number) => void;
  signTx: (
    toAddress: string,
    amount: string,
    fee: Record<string, bigint>,
    useSuggestedFee: boolean,
    pin: number[]
  ) => Promise<{ signedTx: string, totalFee: number }>;
  broadcastTx: (signedTx: string) => Promise<string>;
}

const WalletContext = createContext<IWalletContext | null>(null);

export const WalletProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async (): Promise<void> => {
    try {
      const savedAccounts = await AsyncStorage.getItem('accounts');
      if (savedAccounts) {
        const parsed = JSON.parse(savedAccounts);
        const reconstructedAccounts = parsed.map((acc: any) => ({
          xpub: acc.xpub,
          addressIndex: acc.addressIndex,
          selected: acc.selected,
          protocol:
            // TODO: Use a registry to avoid this switch statement
            // Add other protocols here as needed
            acc.protocolType === Protocols.EthereumProtocol.NAME ? Protocols.EthereumProtocol.getInstance() :
            acc.protocolType === Protocols.ArbitrumOneProtocol.NAME ? Protocols.ArbitrumOneProtocol.getInstance() :
            acc.protocolType === Protocols.BitcoinNativeSegWitProtocol.NAME ? Protocols.BitcoinNativeSegWitProtocol.getInstance() :
            null
        }));
        setAccounts(reconstructedAccounts);
        const selected = reconstructedAccounts.find((acc: Account) => acc.selected);
        if (selected) {
          setSelectedAccount(selected);
        }
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  };

  const saveAccounts = async (accounts: Account[]): Promise<void> => {
    try {
      // Create a simplified version of accounts for storage
      const accountsForStorage = accounts.map(account => ({
        xpub: account.xpub,
        addressIndex: account.addressIndex,
        selected: account.selected,
        protocolType: account.protocol.getStaticConfig().NAME // Store just the protocol type name
      }));

      await AsyncStorage.setItem('accounts', JSON.stringify(accountsForStorage));
    } catch (error) {
      console.error('Error saving accounts:', error);
    }
  };

  const addAccount = async (protocol: BaseProtocol, pin: number[]): Promise<void> => {
    try {
      const existingAccounts = accounts.filter(a => a.protocol.getStaticConfig().NAME === protocol.getStaticConfig().NAME);
      const addressIndex = existingAccounts.length;
      const config = protocol.getStaticConfig();

      const xpub = await FortisCardAPI.getXpub(
        pin,
        config.PURPOSE,
        config.COIN_TYPE,
        config.CURVE,
        config.VERSION_BYTES
      );

      const newAccount: Account = {
        protocol,
        xpub,
        addressIndex,
        selected: false
      };

      const updatedAccounts = [...accounts, newAccount];
      setAccounts(updatedAccounts);
      await saveAccounts(updatedAccounts);
    } catch (error) {
      console.error('Error adding account:', error);
      throw error;
    }
  };

  const selectAccount = (protocol: BaseProtocol, addressIndex: number): void => {
    const updatedAccounts = accounts.map(acc => ({
      ...acc,
      selected: acc.protocol.getStaticConfig().NAME === protocol.getStaticConfig().NAME && acc.addressIndex === addressIndex
    }));

    setAccounts(updatedAccounts);
    const selected = updatedAccounts.find(acc => acc.selected);
    setSelectedAccount(selected || null);
    saveAccounts(updatedAccounts);
  };

  const deleteAccount = (protocol: BaseProtocol, addressIndex: number): void => {
    const updatedAccounts = accounts.filter(
      acc => !(acc.protocol.getStaticConfig().NAME === protocol.getStaticConfig().NAME && acc.addressIndex === addressIndex)
    );
    setAccounts(updatedAccounts);
    if (selectedAccount?.protocol.getStaticConfig().NAME === protocol.getStaticConfig().NAME && selectedAccount?.addressIndex === addressIndex) {
      setSelectedAccount(null);
    }
    saveAccounts(updatedAccounts);
  };

  const signTx = async (
    toAddress: string,
    amount: string,
    fee: Record<string, bigint>,
    useSuggestedFee: boolean,
    pin: number[]
  ): Promise<{ signedTx: string, totalFee: number }> => {
    if (!selectedAccount) throw new Error('No account selected');

    try {
      return await selectedAccount.protocol.signTx(
        selectedAccount.xpub,
        toAddress,
        selectedAccount.addressIndex,
        amount,
        fee,
        useSuggestedFee,
        pin
      );

    } catch (error) {
      console.error('Error signing transaction:', error);
      throw error;
    }
  };

  const broadcastTx = async (signedTx: string): Promise<string> => {
    if (!selectedAccount) throw new Error('No account selected');
    try {
      return await selectedAccount.protocol.broadcastTx(signedTx);
    } catch (error) {
      console.error('Error broadcasting transaction:', error);
      throw error;
    }
  };

  return (
    <WalletContext.Provider value={{
      accounts,
      selectedAccount,
      addAccount,
      selectAccount,
      deleteAccount,
      signTx,
      broadcastTx
    }}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return context;
};
