import type { Preview } from '@storybook/react-native-web-vite';
import { sharedPreview } from '../src/design-system/stories/decorators';

const preview: Preview = {
  ...sharedPreview,
  parameters: {
    layout: 'fullscreen',
    controls: { matchers: { color: /(background|color)$/i } },
  },
};

export default preview;
