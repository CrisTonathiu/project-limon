const { getDefaultConfig } = require('expo/metro-config');
const { withStorybook } = require('@storybook/react-native/metro/withStorybook');

const config = getDefaultConfig(__dirname);

// Storybook only ships when EXPO_PUBLIC_STORYBOOK_ENABLED=true (pnpm storybook); release builds strip it.
module.exports = withStorybook(config, {
  enabled: process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true',
  configPath: './.rnstorybook',
});
