# Patient app design system

The patient app styles everything through one typed theme, built with [Restyle](https://github.com/Shopify/restyle). Components take token names (`padding="l"`, `color="textMuted"`, `variant="hero"`), never raw hex values or pixel numbers, so TypeScript rejects anything outside the system. The tokens come from [UI-BRIEF.md](./UI-BRIEF.md).

## Where things live

| Path                                         | What it is                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/patient/src/design-system/theme.ts`    | Colors, spacing, radii, text and card variants, motion timings. `buildTheme(primary)`.                                                                                                                                                                                                                                                                               |
| `apps/patient/src/design-system/restyle.tsx` | `Box`, `Text`, `CardBox`, `useAppTheme`, `DesignSystemProvider`.                                                                                                                                                                                                                                                                                                     |
| `apps/patient/src/design-system/components/` | Shared components, each with a `*.stories.tsx` next to it: layout (`ScreenScroll`, `ScreenHeader`, `DetailHeader`, `Card`, `TabBar`, `BottomSheet`), controls (`Button`, `RoundButton`, `HeartButton`, `FilterChip`, `SegmentedControl`, `OptionCard`), data (`StatTile`, `ProgressRing`, `Sparkline`, `ProgressBar`, `MacroBar`, `Chip`, `PrimaryCard`) and `Icon`. |
| `apps/patient/src/design-system/motion.ts`   | `useEntrance(delay)` (the fade and rise every block uses), `useFlicker`, `usePressScale`. Respect reduced motion.                                                                                                                                                                                                                                                    |
| `apps/patient/src/screens/*/*View.tsx`       | Screen designs: presentational views that take plain data, with `*.stories.tsx` under Screens/.                                                                                                                                                                                                                                                                      |
| `apps/patient/.rnstorybook/`, `.storybook/`  | Storybook on a phone and in the browser. Both load the same stories.                                                                                                                                                                                                                                                                                                 |

Only `primary` changes per clinic. `primaryTint` (16% on white) and `onPrimary` (black or white text) are derived from it, and `App.tsx` feeds in the tenant color from `/apps/bootstrap`.

## Rules

1. Use `Box` and `Text` from `src/design-system`, not `View`, `Text` or `StyleSheet` from React Native, in new UI.
2. Need a new color, size or text style? Add a token to `theme.ts` first, then use it by name.
3. A component used on more than one screen goes in `src/design-system/components/` with a story covering its states.
4. Animate with `motion` values and `useEntrance`; don't hard-code durations.

## Storybook

From the repo root or `apps/patient`:

| Command                | What it does                                                                      |
| ---------------------- | --------------------------------------------------------------------------------- |
| `pnpm storybook`       | Starts Expo with Storybook instead of the app. Open it in Expo Go or a dev build. |
| `pnpm storybook:web`   | Storybook in the browser at http://localhost:6006, through react-native-web.      |
| `pnpm storybook:build` | Static web Storybook in `storybook-static/`, ready to host for teammates.         |

Every story has a `brand` control to try another clinic's primary color.

Storybook only ships when `EXPO_PUBLIC_STORYBOOK_ENABLED=true`. `metro.config.js` strips it from normal and release builds, and `index.ts` mounts the app as usual.

`.rnstorybook/storybook.requires.ts` is generated by Metro when Storybook starts; commit it when it changes after adding a stories folder.

### Adding a story

```tsx
// src/design-system/components/Badge.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-native';
import { Badge } from './Badge';

const meta = {
  title: 'Components/Badge',
  component: Badge,
  args: { label: 'Nuevo' },
} satisfies Meta<typeof Badge>;
export default meta;

export const Default: StoryObj<typeof meta> = {};
```

The theme, fonts, safe areas and background are added for you by the shared decorator in `src/design-system/stories/decorators.tsx`. A screen story sets `parameters: { screen: true }` to fill the frame edge to edge.
