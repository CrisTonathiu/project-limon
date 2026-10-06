import './src/features/auth/crypto-polyfill';
import { registerRootComponent } from 'expo';
import App from './src/app/App';

// `pnpm storybook` opens the component catalog instead of the app (see docs/ui/DESIGN-SYSTEM.md).
const Root =
  process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true'
    ? (require('./.rnstorybook').default as typeof App)
    : App;

registerRootComponent(Root);
