import type { TenantAppConfig } from '@limon/types';

/**
 * Platform-agnostic design tokens. Deliberately NO components: the dashboard (DOM)
 * and patient app (React Native) render natively; they share tokens and theming logic only.
 */
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;
export const typography = {
  fontSize: { xs: 12, sm: 14, md: 16, lg: 20, xl: 28 },
  fontWeight: { regular: '400', medium: '500', bold: '700' },
} as const;

const neutral = {
  background: '#FFFFFF',
  surface: '#F6F7F6',
  text: '#1B1F1C',
  textMuted: '#5F6B63',
  border: '#DDE3DF',
  danger: '#C62828',
} as const;

export type Theme = {
  colors: typeof neutral & { primary: string; onPrimary: string; secondary: string };
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
};

export const PLATFORM_DEFAULT_PRIMARY = '#2E7D32';

/** Readable text color on top of a tenant-chosen brand color (WCAG relative luminance). */
export function onColor(hex: string): '#FFFFFF' | '#000000' {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.179 ? '#000000' : '#FFFFFF';
}

/** Builds a theme from runtime tenant branding. */
export function createTheme(branding?: Pick<TenantAppConfig, 'primaryColor' | 'secondaryColor'> | null): Theme {
  const primary = branding?.primaryColor ?? PLATFORM_DEFAULT_PRIMARY;
  return {
    colors: { ...neutral, primary, onPrimary: onColor(primary), secondary: branding?.secondaryColor ?? primary },
    spacing,
    radius,
    typography,
  };
}
