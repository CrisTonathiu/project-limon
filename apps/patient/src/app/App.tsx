import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from '../navigation/RootNavigator';
import { SessionProvider } from '../state/session-context';
import { TenantThemeProvider } from '../theme/theme-context';

export default function App() {
  return (
    <SafeAreaProvider>
      <TenantThemeProvider>
        <SessionProvider>
          <StatusBar style="auto" />
          <RootNavigator />
        </SessionProvider>
      </TenantThemeProvider>
    </SafeAreaProvider>
  );
}
