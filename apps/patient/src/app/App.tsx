import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DesignSystemProvider, useDesignFonts } from '../design-system';
import { RootNavigator } from '../navigation/RootNavigator';
import { SessionProvider } from '../state/session-context';
import { TenantThemeProvider, useTenantTheme } from '../theme/theme-context';

/** Feeds the tenant's runtime brand color into the design system theme. */
function BrandedDesignSystem({ children }: { children: ReactNode }) {
  const { theme } = useTenantTheme();
  return <DesignSystemProvider primary={theme.colors.primary}>{children}</DesignSystemProvider>;
}

export default function App() {
  const fontsReady = useDesignFonts();
  if (!fontsReady) return null;
  return (
    <SafeAreaProvider>
      <TenantThemeProvider>
        <BrandedDesignSystem>
          <SessionProvider>
            <StatusBar style="auto" />
            <RootNavigator />
          </SessionProvider>
        </BrandedDesignSystem>
      </TenantThemeProvider>
    </SafeAreaProvider>
  );
}
