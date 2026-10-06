import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-native-web-vite';
import type { Plugin } from 'vite';

const require = createRequire(import.meta.url);
const fontsShim = fileURLToPath(new URL('./fonts.web.js', import.meta.url));

/**
 * Reanimated's web build reaches react-native-web's style helpers with require() inside try/catch.
 * Vite leaves those calls as-is, they fail silently in the browser, and every animated style
 * then throws. This swaps that one module for the same exports as ESM imports.
 */
function reanimatedWebUtils(): Plugin {
  const domStyle =
    require.resolve('react-native-web/dist/exports/StyleSheet/compiler/createReactDOMStyle');
  const preprocess = require.resolve('react-native-web/dist/exports/StyleSheet/preprocess');
  return {
    name: 'limon:reanimated-web-utils',
    enforce: 'pre',
    load(id) {
      if (
        !/react-native-reanimated[\\/]lib[\\/]module[\\/].*[\\/]webUtils\.web\.js$/.test(
          id.split('?')[0]!,
        )
      )
        return null;
      return [
        `export { default as createReactDOMStyle } from ${JSON.stringify(domStyle)};`,
        `export { createTransformValue, createTextShadowValue } from ${JSON.stringify(preprocess)};`,
      ].join('\n');
    },
  };
}

// The same stories as the on-device Storybook (.rnstorybook), rendered in the browser through react-native-web.
const main: StorybookConfig = {
  stories: ['../src/**/*.stories.?(ts|tsx)'],
  framework: {
    name: '@storybook/react-native-web-vite',
    options: {
      modulesToTranspile: ['react-native-reanimated', 'react-native-worklets', '@shopify/restyle'],
      // Same worklet transform babel-preset-expo applies on device; Reanimated hooks need it to capture closures.
      pluginReactOptions: { babel: { plugins: ['react-native-worklets/plugin'] } },
    },
  },
  viteFinal: (config) => {
    const alias = [
      // The font packages' index files require() every weight; load only the ones the theme uses.
      { find: /^@expo-google-fonts\/(fredoka|nunito)$/, replacement: fontsShim },
      ...(Array.isArray(config.resolve?.alias)
        ? config.resolve.alias
        : Object.entries(config.resolve?.alias ?? {}).map(([find, replacement]) => ({
            find,
            replacement,
          }))),
    ];
    return {
      ...config,
      plugins: [reanimatedWebUtils(), ...(config.plugins ?? [])],
      resolve: { ...config.resolve, alias },
    };
  },
};

export default main;
