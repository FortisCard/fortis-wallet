import React, { useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Text } from 'react-native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useWallet } from '../components/wallet/WalletContext';
import { useTheme } from '../components/theme/ThemeContext';
import { Account } from '../components/wallet/WalletContext';
import * as Protocols from '../protocols/index';


type CoinListProps = {
  navigation: BottomTabNavigationProp<any>;
};

interface SupportedCoin {
  name: string;
  symbol: string;
  protocol: Protocols.BaseProtocol;
}

const CoinList: React.FC<CoinListProps> = ({ navigation }) => {
  const { accounts, addAccount, selectAccount, deleteAccount } = useWallet();
  const { theme } = useTheme();

  // TODO: Use ProtocolRegistery with decorators to get supported coins if list grows
  const supportedCoins: SupportedCoin[] = [
    {
      name: Protocols.EthereumProtocol.NAME,
      symbol: Protocols.EthereumProtocol.SYMBOL,
      protocol: Protocols.EthereumProtocol.getInstance()
    },
    {
      name: Protocols.ArbitrumOneProtocol.NAME,
      symbol: Protocols.ArbitrumOneProtocol.SYMBOL,
      protocol: Protocols.ArbitrumOneProtocol.getInstance()
    },
    {
      name: Protocols.BitcoinNativeSegWitProtocol.NAME,
      symbol: Protocols.BitcoinNativeSegWitProtocol.SYMBOL,
      protocol: Protocols.BitcoinNativeSegWitProtocol.getInstance()
    }
  ];

  const handleAddAccount = async (protocol: Protocols.BaseProtocol): Promise<void> => {
    try {
      // TODO: Implement proper PIN input UI
      const pin = [141, 150, 158, 239, 110, 202, 211, 194, 154, 58, 98, 146, 128, 230, 134, 207, 12, 63, 93, 90, 134, 175, 243, 202, 18, 2, 12, 146, 58, 220, 108, 146]; // sha256(b'123456')
      await addAccount(protocol, pin);
    } catch (error) {
      console.error('Error adding account:', error);
    } finally {
    }
  };

  const renderAccountItem = ({ item: account }: { item: Account }) => (
    <TouchableOpacity
      style={[
        styles.accountItem,
        { borderColor: theme.colors.border },
        account.selected && { backgroundColor: theme.colors.primary + '40' }
      ]}
      onPress={() => {
        selectAccount(account.protocol, account.addressIndex);
        navigation.navigate('Account');
      }}
    >
      <Text style={[styles.accountText, { color: theme.colors.text }]}>
        Account {account.addressIndex + 1}
      </Text>
      <TouchableOpacity
        onPress={() => deleteAccount(account.protocol, account.addressIndex)}
        style={styles.deleteButton}
      >
        <Text style={[styles.deleteButtonText, { color: theme.colors.secondary }]}>Delete</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderCoinItem = ({ item: coin }: { item: SupportedCoin }) => {
    const coinAccounts = accounts.filter(acc => 
      acc.protocol.getStaticConfig().NAME === coin.protocol.getStaticConfig().NAME
    );
    
    return (
      <View style={[styles.coinContainer, { borderColor: theme.colors.border }]}>
        <Text style={[styles.coinName, { color: theme.colors.text }]}>
          {coin.name} ({coin.symbol})
        </Text>
        
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.colors.primary }]}
          onPress={() => handleAddAccount(coin.protocol)}
        >
          <Text style={styles.buttonText}>Add Account</Text>
        </TouchableOpacity>

        <FlatList
          data={coinAccounts}
          renderItem={renderAccountItem}
          keyExtractor={(item) => `${item.protocol.constructor.name}-${item.addressIndex}`}
        />
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={supportedCoins}
        renderItem={renderCoinItem}
        keyExtractor={(item) => item.protocol.constructor.name}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  coinContainer: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  coinName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  addButton: {
    padding: 8,
    borderRadius: 4,
    alignItems: 'center',
    marginVertical: 8,
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  accountItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 4,
    marginVertical: 4,
    borderWidth: 1,
  },
  accountText: {
    fontSize: 16,
  },
  deleteButton: {
    padding: 8,
  },
  deleteButtonText: {
    fontSize: 14,
  }
});

export default CoinList;
