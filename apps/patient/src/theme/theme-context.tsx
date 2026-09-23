import type { TenantAppConfig } from '@limon/types';
import { createTheme, type Theme } from '@limon/ui';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../services/api';

/**
 * RUNTIME tenant branding. Fetched from /apps/bootstrap on launch; falls back to
 * platform defaults if offline. Changing colors in the dashboard needs no store release.
 */
type Branding = { config: TenantAppConfig | null; theme: Theme; unavailable: boolean };

const ThemeContext = createContext<Branding>({ config: null, theme: createTheme(), unavailable: false });

export function TenantThemeProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<Branding>({ config: null, theme: createTheme(), unavailable: false });
  useEffect(() => {
    api.apps
      .bootstrap()
      .then((config) => setValue({ config, theme: createTheme(config), unavailable: false }))
      .catch((err: { code?: string }) =>
        setValue((v) => ({ ...v, unavailable: err.code === 'TENANT_SUSPENDED' || err.code === 'APP_NOT_RECOGNIZED' })),
      );
  }, []);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTenantTheme = () => useContext(ThemeContext);
