import React, { useState } from 'react';
import { View, StyleSheet, Text, Switch, TouchableOpacity, Alert } from 'react-native';
import { useTheme } from '../components/theme/ThemeContext';
import { FortisCardAPI } from '../utils/FortisCardAPI';

const Settings = () => {
  const { theme, toggleTheme } = useTheme();
  const appVersion = '1.0.0'; // Get from config
  const [isChecking, setIsChecking] = useState(false);

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
    marginVertical: 16,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default Settings;
