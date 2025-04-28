import React, { useState } from 'react';
import { View, StyleSheet, Text, Switch, TouchableOpacity, Alert, TextInput, Modal, ActivityIndicator } from 'react-native';
import { useTheme } from '../components/theme/ThemeContext';
import { FortisCardAPI } from '../utils/FortisCardAPI';
import * as bip39 from 'bip39';

const Settings = () => {
  const { theme, toggleTheme } = useTheme();
  const appVersion = '1.0.0';
  const [isChecking, setIsChecking] = useState(false);

  // State for mnemonic storage flow
  const [showMnemonicModal, setShowMnemonicModal] = useState(false);
  const [generatingMnemonic, setGeneratingMnemonic] = useState(false);
  const [customMnemonic, setCustomMnemonic] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [isStoring, setIsStoring] = useState(false);

  const checkFirmware = async () => {
    try {
      setIsChecking(true);
      const currentVersion = await FortisCardAPI.getFirmwareVersion();
      const latestVersion = FortisCardAPI.LATEST_FIRMWARE_VERSION;

      if (currentVersion === latestVersion) {
        Alert.alert(
          'Firmware Check',
          `Your FortisCard firmware is up to date (v${currentVersion})`
        );
      } else {
        Alert.alert(
          'Firmware Update Available',
          `Current version: ${currentVersion}\nLatest version: ${latestVersion}\n\nPlease update your FortisCard firmware.`
        );
      }
    } catch (error) {
      Alert.alert(
        'Error',
        'Failed to check firmware version.'
      );
    } finally {
      setIsChecking(false);
    }
  };

  const startMnemonicFlow = () => {
    setCustomMnemonic('');
    setPassword('');
    setPin('');
    setGeneratingMnemonic(false);

    Alert.alert(
      'Security Warning',
      'The safest way to store a mnemonic on your FortisCard is by using a computer that is not connected to the internet.\n\nLearn more at fortis-card.com.\n\nWould you like to input your own BIP-39 mnemonic or generate a new one?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Input My Own', onPress: () => setShowMnemonicModal(true) },
        { text: 'Generate New', onPress: handleGenerateNewMnemonic },
      ],
    );
  };

  const handleGenerateNewMnemonic = () => {
    setGeneratingMnemonic(true);
    const newMnemonic = bip39.generateMnemonic();
    setCustomMnemonic(newMnemonic);
    setShowMnemonicModal(true);
  };

  const handleStoreMnemonic = async () => {
    if (!customMnemonic || !pin) {
      Alert.alert('Missing Information', 'Please make sure you have entered the mnemonic and a 6-digit PIN.');
      return;
    }
    if (pin.length !== 6 || !/^\d+$/.test(pin)) {
      Alert.alert('Invalid PIN', 'PIN must be exactly 6 digits.');
      return;
    }

    // Validate BIP-39 mnemonic
    if (!bip39.validateMnemonic(customMnemonic)) {
      Alert.alert('Invalid Mnemonic', 'The mnemonic you entered is not valid.');
      return;
    }

    try {
      setIsStoring(true);
      const pinBytes = pin.split('').map((digit) => digit.charCodeAt(0));
      await FortisCardAPI.storeEncryptedMasterSeed(pinBytes, customMnemonic.trim(), password.trim() || undefined);

      Alert.alert('Success', 'Mnemonic stored successfully on your FortisCard.');
      setShowMnemonicModal(false);
      setCustomMnemonic('');
      setPassword('');
      setPin('');
    } catch (error) {
      Alert.alert('Error', 'Failed to store mnemonic on FortisCard.');
    } finally {
      setIsStoring(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.settingItem}>
        <Text style={[styles.settingLabel, { color: theme.colors.text }]}>Dark Mode</Text>
        <Switch
          value={theme.dark}
          onValueChange={toggleTheme}
        />
      </View>

      <View style={styles.settingItem}>
        <Text style={[styles.settingLabel, { color: theme.colors.text }]}>FortisWallet app version</Text>
        <Text style={[styles.settingValue, { color: theme.colors.text }]}>{appVersion}</Text>
      </View>

      <TouchableOpacity
        style={[styles.checkFirmwareButton, { backgroundColor: theme.colors.primary }]}
        onPress={checkFirmware}
        disabled={isChecking}
      >
        <Text style={styles.buttonText}>
          {isChecking ? 'Checking...' : 'Check FortisCard firmware version'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.checkFirmwareButton, { backgroundColor: theme.colors.primary }]}
        onPress={startMnemonicFlow}
      >
        <Text style={styles.buttonText}>Store New Mnemonic on FortisCard</Text>
      </TouchableOpacity>

      <Modal
        visible={showMnemonicModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowMnemonicModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.background }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Store Mnemonic</Text>

            <Text style={[styles.modalLabel, { color: theme.colors.text }]}>Mnemonic:</Text>
            <TextInput
              style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.primary }]}
              value={customMnemonic}
              onChangeText={setCustomMnemonic}
              editable={!generatingMnemonic}
              multiline
              placeholder="Enter your BIP-39 mnemonic"
              placeholderTextColor="#888"
            />

            <Text style={[styles.modalLabel, { color: theme.colors.text }]}>Optional Password:</Text>
            <TextInput
              style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.primary }]}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter password (optional)"
              placeholderTextColor="#888"
            />

            <Text style={[styles.modalLabel, { color: theme.colors.text }]}>6-digit FortisCard PIN:</Text>
            <TextInput
              style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.primary }]}
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              placeholder="e.g. 123456"
              maxLength={6}
              placeholderTextColor="#888"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.colors.primary }]}
                onPress={handleStoreMnemonic}
                disabled={isStoring}
              >
                {isStoring ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Store</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#aaa' }]}
                onPress={() => setShowMnemonicModal(false)}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  settingLabel: {
    fontSize: 16,
  },
  settingValue: {
    fontSize: 16,
    color: '#666',
  },
  checkFirmwareButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    padding: 20,
    borderRadius: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 14,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    marginTop: 4,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  modalButton: {
    flex: 1,
    marginHorizontal: 8,
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
});

export default Settings;
