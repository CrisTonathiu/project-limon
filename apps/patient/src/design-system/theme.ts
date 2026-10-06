import { mixHex, onColor, PLATFORM_DEFAULT_PRIMARY } from '@limon/ui';

/**
 * The patient app's design system theme (docs/ui/UI-BRIEF.md). Every screen and component
 * styles itself from this object through Restyle props (`padding="l"`, `variant="hero"`),
 * never from raw values. Only `primary` changes per tenant; its tint and on-color are derived.
 *
 * Kept free of react-native imports so it can be unit tested.
 */
export const fonts = {
  display: 'Fredoka_600SemiBold',
  body: 'Nunito_400Regular',
  bodySemiBold: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_700Bold',
} as const;

const palette = {
  accent: '#E9B308',
  accentTrack: '#FBEFC4',
  background: '#FBF8F2',
  surface: '#FFFFFF',
  text: '#1B1F1C',
  textMuted: '#5F6B63',
  textOnTint: '#44504A',
  divider: '#ECE7DC',
  dividerSoft: '#F0EBE1',
  favorite: '#D9480F',
  danger: '#C62828',
} as const;

export function buildTheme(primary: string = PLATFORM_DEFAULT_PRIMARY) {
  return {
    colors: {
      ...palette,
      primary,
      primaryTint: mixHex(primary, palette.surface, 0.16),
      onPrimary: onColor(primary),
    },
    spacing: { none: 0, xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, top: 56 },
    borderRadii: { none: 0, s: 12, m: 20, l: 24, xl: 28, pill: 999 },
    breakpoints: { phone: 0 },
    textVariants: {
      defaults: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: 'text' },
      h1: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: 'text' },
      h2: { fontFamily: fonts.display, fontSize: 19, lineHeight: 24, color: 'text' },
      numberXL: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: 'text' },
      number: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, color: 'text' },
      body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: 'text' },
      bodyStrong: { fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 21, color: 'text' },
      label: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: 'textMuted' },
      caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: 'textMuted' },
      tab: { fontFamily: fonts.bodySemiBold, fontSize: 11, lineHeight: 14, color: 'textMuted' },
    },
    cardVariants: {
      defaults: { backgroundColor: 'surface', borderRadius: 'm', padding: 'l' },
      hero: {
        backgroundColor: 'surface',
        borderRadius: 'xl',
        padding: 'xl',
        shadowColor: 'text',
        shadowOpacity: 0.06,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 6 },
        elevation: 2,
      },
      tile: { backgroundColor: 'surface', borderRadius: 'm', padding: 'l' },
      primary: { backgroundColor: 'primary', borderRadius: 'm', padding: 'l' },
      tint: { backgroundColor: 'primaryTint', borderRadius: 'l', padding: 'l' },
    },
  } as const;
}

export type AppTheme = ReturnType<typeof buildTheme>;

/** Motion tokens (ms). Everything jumps to its end state when the OS asks for reduced motion. */
export const motion = {
  entrance: { duration: 500, rise: 12, stagger: 80 },
  ring: { duration: 900, innerDelay: 150 },
  line: { duration: 1100 },
  /** After the line has drawn, its end dot fades in. */
  dot: { duration: 300 },
  flicker: { duration: 1600, scale: 1.08, rotate: 4 },
  press: { duration: 120, scale: 0.97 },
} as const;
