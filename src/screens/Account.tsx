import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { useWallet } from '../components/wallet/WalletContext';
import { useWalletConnect } from '../components/wallet/WalletConnectContext';
import { useTheme } from '../components/theme/ThemeContext';
import { Picker } from '@react-native-picker/picker';

const Account: React.FC = () => {
  const { selectedAccount, signTx, broadcastTx } = useWallet();
  const {
    connect,
    disconnect,
    sessions,
    pendingRequest,
    pendingProposal,
    confirmRequest,
    confirmProposal
  } = useWalletConnect();
  const { theme } = useTheme();

  const [address, setAddress] = useState<string>('');
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [useSuggestedFee, setUseSuggestedFee] = useState(true);
  const [customFee, setCustomFee] = useState<Record<string, any>>({});
  const [isSending, setIsSending] = useState(false);
  const [isConfirmationVisible, setIsConfirmationVisible] = useState(false);
  const [signedTx, setSignedTx] = useState<string | null>(null);
  const [balance, setBalance] = useState('0');
  const [totalFee, setTotalFee] = useState<number | null>(null);
  const [uri, setUri] = useState('');

  useEffect(() => {
    const fetchAddress = async () => {
      if (selectedAccount) {
        const addr = selectedAccount.protocol.getAddress(
          selectedAccount.xpub,
          selectedAccount.addressIndex
        );
        setAddress(addr);
      }
    };
    fetchAddress();
  }, [selectedAccount]);

  useEffect(() => {
    const fetchBalance = async () => {
      if (selectedAccount) {
        const bal = await selectedAccount.protocol.getBalance(
          selectedAccount.xpub,
          selectedAccount.addressIndex
        );
        setBalance(bal);
      }
    };
    fetchBalance();
  }, [selectedAccount]);

  const renderFeeInputs = () => {
    if (!selectedAccount || useSuggestedFee) return null;

    const feeFields = selectedAccount.protocol.fee_t;
    return Object.entries(feeFields).map(([key, type]) => (
      <View key={key}>
        <Text style={[styles.label, { color: theme.colors.text }]}>{key}</Text>
        <TextInput
          style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
          placeholder={`Enter ${key}`}
          placeholderTextColor={theme.colors.secondary}
          value={customFee[key]?.toString() || ''}
          onChangeText={(value) => setCustomFee(prev => ({ ...prev, [key]: value }))}
          keyboardType="decimal-pad"
        />
      </View>
    ));
  };

  const handleNext = () => {
    if (!toAddress || !amount) {
      Alert.alert('Error', 'Please fill in recipient address and amount');
      return;
    }
    if (!useSuggestedFee && Object.keys(customFee).length === 0) {
      Alert.alert('Error', 'Please enter custom fee parameters or use suggested fee');
      return;
    }
    setIsConfirmationVisible(true);
  };

  const handleSign = async () => {
    if (!selectedAccount) return;

    try {
      setIsSending(true);
      // TODO: Implement proper PIN input UI
      const pin = Array.from(new TextEncoder().encode("123456"))

      const { signedTx: signed, totalFee: fee } = await signTx(
        toAddress,
        amount,
        customFee,
        useSuggestedFee,
        pin
      );
      setSignedTx(signed);
      setTotalFee(fee);
    } catch (error) {
      console.error('Error signing transaction:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to sign transaction');
    } finally {
      setIsSending(false);
    }
  };

  const handleBroadcast = async () => {
    if (!signedTx) return;

    try {
      setIsSending(true);
      const txHash = await broadcastTx(signedTx);
      Alert.alert('Success', `Transaction broadcast: ${selectedAccount?.protocol.getStaticConfig().BLOCKCHAIN_EXPLORER_URL + txHash}`);
      // Reset form
      setToAddress('');
      setAmount('');
      setCustomFee({});
      setSignedTx(null);
      setIsConfirmationVisible(false);
    } catch (error) {
      console.error('Error broadcasting transaction:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to broadcast transaction');
    } finally {
      setIsSending(false);
    }
  };

  if (!selectedAccount) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text style={[styles.text, { color: theme.colors.text }]}>No account selected</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>

      {/* Account Details */}

      <View style={styles.addressContainer}>
        <Text style={[styles.label, { color: theme.colors.text }]}>Address:</Text>
        <Text style={[styles.address, { color: theme.colors.text }]}>{address}</Text>
        <Text style={[styles.balance, { color: theme.colors.text }]}>
          Balance: {balance} {selectedAccount.protocol.getStaticConfig().SYMBOL}
        </Text>
      </View>

      {/* Send coins */}

      <View style={styles.sendSection}>
          <Text style={[styles.label, { color: theme.colors.text }]}>Send {selectedAccount.protocol.getStaticConfig().SYMBOL}</Text>
        <TextInput
          style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
          placeholder="Recipient Address"
          placeholderTextColor={theme.colors.secondary}
          value={toAddress}
          onChangeText={setToAddress}
        />

        <TextInput
          style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
          placeholder="Amount"
          placeholderTextColor={theme.colors.secondary}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
        />

        <View style={styles.feeContainer}>
          <Picker
            selectedValue={useSuggestedFee ? 'suggested' : 'custom'}
            onValueChange={(value) => {
              setUseSuggestedFee(value === 'suggested');
              if (value === 'suggested') {
                setCustomFee({});
              }
            }}
            style={[styles.picker, { color: theme.colors.text }]}
          >
            <Picker.Item label="Use Suggested Fee" value="suggested" />
            <Picker.Item label="Use Custom Fee" value="custom" />
          </Picker>

          {renderFeeInputs()}
        </View>

        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: theme.colors.primary }]}
          onPress={handleNext}
          disabled={isSending}
        >
          <Text style={styles.buttonText}>Next</Text>
        </TouchableOpacity>

        {/* WalletConnect Section */}

        {selectedAccount.protocol.useWalletConnect() && (
          <View style={styles.walletConnectSection}>
            <Text style={[styles.label, { color: theme.colors.text }]}>WalletConnect</Text>

            {/* Active Sessions */}
            {sessions && Object.keys(sessions).length > 0 && (
              <View style={styles.sessionsList}>
                <Text style={[styles.subLabel, { color: theme.colors.text }]}>Connected Sessions:</Text>
                {Object.entries(sessions).map(([sessionId, session]) => (
                  <View key={sessionId} style={styles.sessionItem}>
                    <Text style={[styles.sessionText, { color: theme.colors.text }]}>
                      {session.peer.metadata.name}
                    </Text>
                    <TouchableOpacity
                      style={[styles.disconnectButton, { backgroundColor: theme.colors.secondary }]}
                      onPress={() => disconnect(sessionId)}
                    >
                      <Text style={styles.buttonText}>Disconnect</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Connect New Session */}
            <View style={styles.newConnection}>
              <Text style={[styles.subLabel, { color: theme.colors.text }]}>Connect New Session:</Text>
              <TextInput
                style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
                placeholder="Enter WalletConnect URI (wc:...)"
                placeholderTextColor={theme.colors.secondary}
                value={uri}
                onChangeText={setUri}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={[styles.connectButton, { backgroundColor: theme.colors.primary }]}
                onPress={() => {
                  if (uri.startsWith('wc:')) {
                    connect(uri);
                    setUri('');
                  } else {
                    Alert.alert('Error', 'Invalid WalletConnect URI');
                  }
                }}
              >
                <Text style={styles.buttonText}>Connect</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Pending Session Proposal Modal */}
        {pendingProposal && (
          <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
            <View style={[styles.modalContent, { backgroundColor: theme.colors.background }]}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                Connection Request
              </Text>
              <Text style={[styles.confirmationLabel, { color: theme.colors.text }]}>
                App Name
              </Text>
              <Text style={[styles.confirmationValue, { color: theme.colors.text }]}>
                {pendingProposal.params.proposer.metadata.name}
              </Text>
              <Text style={[styles.confirmationLabel, { color: theme.colors.text }]}>
                Description
              </Text>
              <Text style={[styles.confirmationValue, { color: theme.colors.text }]}>
                {pendingProposal.params.proposer.metadata.description}
              </Text>
              <Text style={[styles.confirmationLabel, { color: theme.colors.text }]}>
                URL
              </Text>
              <Text style={[styles.confirmationValue, { color: theme.colors.text }]}>
                {pendingProposal.params.proposer.metadata.url}
              </Text>

              <TouchableOpacity
                style={[styles.confirmButton, { backgroundColor: theme.colors.primary }]}
                onPress={() => confirmProposal(true)}
              >
                <Text style={styles.buttonText}>Connect</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.cancelButton, { backgroundColor: theme.colors.secondary }]}
                onPress={() => confirmProposal(false)}
              >
                <Text style={styles.buttonText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Pending Request Modal */}
      {pendingRequest && (
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
              WalletConnect Request
            </Text>

            <ScrollView style={styles.modalScrollContent}>
              <Text style={[styles.confirmationLabel, { color: theme.colors.text }]}>
                Method: {pendingRequest.method}
              </Text>

              {Object.entries(pendingRequest.details).map(([key, value]) => (
                <React.Fragment key={key}>
                  <Text style={[styles.confirmationLabel, { color: theme.colors.text }]}>
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </Text>
                  <Text style={[styles.confirmationValue, { color: theme.colors.text }]}>
                    {value}
                  </Text>
                </React.Fragment>
              ))}
            </ScrollView>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.confirmButton, { backgroundColor: theme.colors.primary }]}
                onPress={() => confirmRequest(true)}
              >
                <Text style={styles.buttonText}>Confirm</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.cancelButton, { backgroundColor: theme.colors.secondary }]}
                onPress={() => confirmRequest(false)}
              >
                <Text style={styles.buttonText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      </View>

      {isConfirmationVisible && (
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.background }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Confirm Transaction</Text>
            <View style={styles.confirmationDetails}>
              <Text style={[styles.confirmationLabel, { color: theme.colors.text }]}>To:</Text>
              <Text style={[styles.confirmationValue, { color: theme.colors.text }]}>{toAddress}</Text>
              <Text style={[styles.confirmationLabel, { color: theme.colors.text }]}>Amount:</Text>
              <Text style={[styles.confirmationValue, { color: theme.colors.text }]}>
                {amount} {selectedAccount.protocol.getStaticConfig().SYMBOL}
              </Text>
              {totalFee !== null && (
                <>
                  <Text style={[styles.confirmationLabel, { color: theme.colors.text }]}>Fee:</Text>
                  <Text style={[styles.confirmationValue, { color: theme.colors.text }]}>
                    {totalFee.toFixed(18).replace(/\.?0+$/, "")} {selectedAccount.protocol.getStaticConfig().SYMBOL}
                  </Text>
                </>
              )}
            </View>

            {!signedTx ? (
              <TouchableOpacity
                style={[styles.confirmButton, { backgroundColor: theme.colors.primary }]}
                onPress={handleSign}
                disabled={isSending}
              >
                <Text style={styles.buttonText}>
                  {isSending ? 'Signing...' : 'Sign Transaction'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.confirmButton, { backgroundColor: theme.colors.primary }]}
                onPress={handleBroadcast}
                disabled={isSending}
              >
                <Text style={styles.buttonText}>
                  {isSending ? 'Broadcasting...' : 'Broadcast Transaction'}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.cancelButton, { backgroundColor: theme.colors.secondary }]}
              onPress={() => setIsConfirmationVisible(false)}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  addressContainer: {
    marginBottom: 24,
  },
  sendSection: {
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  picker: {
    marginBottom: 16,
  },
  nextButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    padding: 20,
    borderRadius: 12,
    elevation: 5,
  },
  modalContainer: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: 10,
    padding: 20,
  },
  modalScrollContent: {
    flexGrow: 0,
    maxHeight: '70%',
    marginVertical: 10,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  confirmationDetails: {
    marginBottom: 20,
  },
  confirmationLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 8,
  },
  confirmationValue: {
    fontSize: 14,
    marginBottom: 8,
  },
  confirmButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  cancelButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
  },
  address: {
    fontSize: 14,
    marginBottom: 8,
  },
  balance: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  text: {
    fontSize: 16,
  },
  feeContainer: {
    marginVertical: 16,
  },
  walletConnectSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#ccc',
  },
  connectButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  disconnectButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  sessionsList: {
    marginBottom: 20,
  },
  sessionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    marginTop: 8,
  },
  sessionText: {
    fontSize: 14,
    flex: 1,
    marginRight: 12,
  },
  subLabel: {
    fontSize: 14,
    marginBottom: 8,
    fontWeight: 'bold',
  },
  newConnection: {
    marginTop: 16,
  },
});

export default Account;
