import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ThemeProvider } from './components/theme/ThemeContext';
import { WalletProvider } from './components/wallet/WalletContext';
import { WalletConnectProvider } from './components/wallet/WalletConnectContext';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import CoinList from './screens/CoinList';
import Account from './screens/Account';
import Settings from './screens/Settings';
import { NfcProvider, useNfc } from './components/nfc/NfcContext';
import { FortisCardAPI } from './utils/FortisCardAPI';

const Tab = createBottomTabNavigator();

const App: React.FC = () => {
  return (
    <NfcProvider>
      <AppContent/>
    </NfcProvider>
  );
};

const AppContent: React.FC = () => {
  const nfcContext = useNfc();
  React.useEffect(() => {
    FortisCardAPI.setNfcContext(nfcContext);
  }, [nfcContext]);
  return (
    <ThemeProvider>
      <WalletProvider>
        <WalletConnectProvider>
          <NavigationContainer>
            <Tab.Navigator>
              <Tab.Screen
                name="Coins"
                component={CoinList}
                options={{
                  tabBarIcon: ({ color, size }) => (
                    <MaterialIcons name="list" color={color} size={size} />
                  ),
                }}
              />
              <Tab.Screen
                name="Account"
                component={Account}
                options={{
                  tabBarIcon: ({ color, size }) => (
                    <MaterialIcons name="account-balance-wallet" color={color} size={size} />
                  ),
                }}
              />
              <Tab.Screen
                name="Settings"
                component={Settings}
                options={{
                  tabBarIcon: ({ color, size }) => (
                    <MaterialIcons name="settings" color={color} size={size} />
                  ),
                }}
              />
            </Tab.Navigator>
          </NavigationContainer>
        </WalletConnectProvider>
      </WalletProvider>
    </ThemeProvider>
  );
};

export default App;
