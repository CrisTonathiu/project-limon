import type { Preview } from '@storybook/react-native';
import { sharedPreview } from '../src/design-system/stories/decorators';

const preview: Preview = {
  ...sharedPreview,
  parameters: {
    controls: { matchers: { color: /(background|color)$/i } },
  },
};

export default preview;
