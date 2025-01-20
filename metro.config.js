const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const config = {
  resolver: {
    extraNodeModules: {
      crypto: require.resolve('react-native-crypto'),
      stream: require.resolve('stream-browserify'),
      process: require.resolve('process/browser'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
