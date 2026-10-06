# Limón patient app: UI brief

This is the design handoff for building the patient app's new interface in `apps/patient`. It is separate from `docs/roadmap/mvp-roadmap.md` and does not change it.

- Screen board, with live mockups, notes and comments: https://claude.ai/artifact/3jTqjhZzBh6ZGS561w8EyD
- UI roadmap: https://claude.ai/code/artifact/d1d7ab05-71ec-41b7-b4d3-acdaa4d48dce
- Reference mockups: `docs/ui/mockups/`, one HTML file per screen (see "Reading the mockups" below).

## Direction

The look is fresh, rounded and calm, inspired by Headspace. The home screen leads with the patient's progress, the motion is medium (noticeable but not bouncy), and the app is light mode only for now. Each clinic brings one brand color, and every tint comes from that one color. All copy is es-MX and goes in `src/i18n/es-MX.ts`, never hard-coded.

## Tokens (extend `packages/ui/src/index.ts`)

| Token         | Value                                                                                          | Use                                          |
| ------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `primary`     | clinic `primaryColor` from `/apps/bootstrap` (preview #3173BD, platform default today #2E7D32) | Active tab, main buttons, rings, chart lines |
| `primaryTint` | primary mixed 16% into #FFFFFF                                                                 | Ring tracks, chips, icon tiles, header bands |
| `onPrimary`   | existing `onColor(primary)`                                                                    | Text on primary                              |
| `accent`      | #E9B308, with its track color #FBEFC4                                                          | Second ring (plan adherence), carbs          |
| `background`  | #FBF8F2                                                                                        | Every screen                                 |
| `surface`     | #FFFFFF                                                                                        | Cards                                        |
| `text`        | #1B1F1C                                                                                        | Body text                                    |
| `textMuted`   | #5F6B63 (#44504A on tinted bands)                                                              | Labels and captions (4.5:1 on background)    |
| `divider`     | #ECE7DC / #F0EBE1                                                                              | Tab bar border, list rows                    |
| `favorite`    | #D9480F                                                                                        | Heart, streak flame                          |
| `danger`      | #C62828                                                                                        | Delete account                               |
| `shadow`      | 0 6px 24px rgba(27,31,28,.06)                                                                  | Hero cards only                              |
| radius        | card 20 to 28, chip and button 999, icon tile 12 to 14                                         |                                              |
| spacing       | screen gutter 24, gap between blocks 12 to 18, top padding 56 below the safe area              |                                              |

Type: Fredoka 600 for headings and numbers (h1 30, h2 18 to 20, big numbers 22 to 34), and Nunito 400/600/700 for body text (15 body, 13 labels, 12 captions, 11 tab labels). Load them with `@expo-google-fonts/fredoka` and `@expo-google-fonts/nunito`. Every touch target is at least 44 px.

To compute `primaryTint` in React Native, mix the hex in JS (no CSS color-mix). Write a `mix(hex, '#FFFFFF', 0.16)` helper in `packages/ui`.

## Libraries

Install each of these with `npx expo install` so it matches Expo SDK 57: `react-native-svg`, `react-native-reanimated`, `expo-font`, `@expo-google-fonts/fredoka`, `@expo-google-fonts/nunito` and `@react-navigation/bottom-tabs`.

## Shared components (`apps/patient/src/components`)

`Card`, `StatTile`, `ProgressRing` (one or two concentric rings), `Sparkline`, `PrimaryCard` (the brand-colored "next meal" card), `ScreenHeader` (caption plus h1), `Chip` and `SegmentedControl`, `BottomSheet`, `TabBar`, and `MacroBar`. Each one takes an optional `delay` prop for the staggered entrance.

## Motion

| Pattern      | Spec                                                                                                                     | Where                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| Entrance     | Opacity 0 to 1 and translateY 12 to 0, 500 ms ease-out, staggered 80 ms per block in reading order                       | Every screen                  |
| Ring draw    | strokeDashoffset from the full length to its value, 900 ms, cubic-bezier(.2,.8,.2,1). The inner ring starts 150 ms later | Inicio, Comidas day ring      |
| Line draw    | dashoffset from the full length to 0, 1100 ms ease-out, after the ring. The end dot fades in last                        | Inicio weight, Progreso chart |
| Bar fill     | scaleX 0 to 1 from the left, 800 ms, staggered 120 ms                                                                    | Recipe macros, goal bar       |
| Bottom sheet | Spring up from below with a slight overshoot (-6 px), about 520 ms, and the backdrop fades to 38%                        | Swaps, log weight             |
| Favorite     | Heart scales to 1.2 and back, 250 ms                                                                                     | Comidas, recipe detail        |
| Streak flame | Scales 1 to 1.08 with a 4° rotation, 1.6 s loop                                                                          | Inicio                        |
| Press        | Scale 0.97 on cards, and rows darken slightly                                                                            | Everywhere                    |

Build one `useEntrance(delay)` hook with Reanimated. When `AccessibilityInfo.isReduceMotionEnabled()` is true, every animation jumps to its end state and loops are turned off.

## Navigation

Replace the current Home screen (a title plus a list of buttons) with bottom tabs: Inicio, Comidas, Recetas, Progreso and Perfil. Each tab is a native stack that holds its detail screens. Keep the existing gates in `RootNavigator` (onboarding before the paywall, the paywall before the app). Keep leaving out tabs and screens that are switched off for a clinic, via `isScreenEnabled`.

## Screens

| #       | Screen                                                                                                                                  | Mockup                    | Data                                                                                                                       | Status                                        |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1       | Inicio (Anillo)                                                                                                                         | 01-inicio.html            | energy target, today's plan, weight goal (goal tracker), streak and meals eaten (needs meal check-off, not in the MVP yet) | designed                                      |
| 2       | Comidas, the week                                                                                                                       | 02-comidas.html           | GET /meal-plans/current                                                                                                    | designed                                      |
| 3       | Detalle de comida with swaps                                                                                                            | 03-detalle-de-comida.html | meal detail and swap endpoints                                                                                             | designed                                      |
| 4       | Recetas                                                                                                                                 | 04-recetas.html           | GET /recipes?mealType=                                                                                                     | designed                                      |
| 5       | Detalle de receta                                                                                                                       | 05-detalle-de-receta.html | GET /recipes/:id                                                                                                           | designed                                      |
| 6       | Progreso y metas, with a water card                                                                                                     | 06-progreso.html          | goal tracker and water tracker (MVP week 6)                                                                                | designed                                      |
| 7       | Perfil                                                                                                                                  | 07-perfil.html            | GET /patients/me/profile, entitlement                                                                                      | designed                                      |
| 8 to 17 | Editar perfil, sign-in, sign-up, confirm email, invite code, onboarding, subscription, shopping list, water detail, service unavailable | none yet                  |                                                                                                                            | to design: use the same tokens and components |

Notes for each screen:

- **Inicio:** a hero card with two rings, the weight goal (outer, primary) and plan adherence this week (inner, accent). Below it, three tiles: streak, meals today, and calories today against the target. Then a weight sparkline card and the brand-colored next-meal card. There is no appointment tile, because not every clinic offers appointments. Until the goal tracker ships, the outer ring shows today's calories. Hide each block whose feature flag is off.
- **Comidas:** a strip of the 7 days, with today selected. A day summary card shows a ring against the target and P/C/G chips. Below it are the meal cards (meal and time, dish, kcal, heart) and the outline button "Cambiar el menú de este día" (hidden on past days).
- **Detalle de comida:** a tinted header band with a back button. Macro chips, then the list of ingredients, each with a "Cambiar" pill. The swap sheet lists equivalents from the same SMAE group, with the selected one tinted. Keep the FatSecret attribution under the macros.
- **Recetas:** a search field, meal-type chips and a 2-column card grid. Recipes have no photos yet, so each card has a tinted block with an icon.
- **Detalle de receta:** a tinted header with back and favorite buttons, and meta chips. A per-serving card shows kcal and three macro bars. Then the ingredients and numbered steps. If the macros are unavailable, say "no disponible" instead of showing partial numbers.
- **Progreso:** a goal card with a progress bar, a weight chart with a period switch (8 weeks, 3 months, all), the primary "Registrar peso" button (opens a sheet with a number wheel), three measurement tiles and a water card with +250 ml.
- **Perfil:** an avatar and name, a brand-colored daily target card, "Tus datos" (with an Editar link), then Suscripción, Cerrar sesión and Eliminar cuenta (danger). Eliminar cuenta must stay reachable from here and from the paywall, because the stores require it.

## Build order (from the UI roadmap)

0. **Foundations (Oct 7 to 10):** tokens, fonts, libraries, shared components and bottom tabs.
1. **Oct 13 to 23:** Inicio, Recetas, Detalle de receta, Comidas.
2. **Oct 26 to Nov 6:** Detalle de comida with swaps, shopping list, water, Progreso.
3. **Nov 9 to 13:** the entry screens, Suscripción, Perfil and Editar perfil.
4. **Nov 17 to 20:** motion pass, Reduce Motion, empty, loading and error states, and checking every screen in each pilot clinic's color. The UI freezes on Nov 20, and launch is Nov 27.

## Open questions

- Meal check-off is not in the MVP, but the home streak and "3/5 comidas" tiles need it.
- Which color should a clinic with no brand color get: #3173BD or #2E7D32?

## Reading the mockups

The mockups come from a design canvas. Each file is HTML with inline styles and CSS keyframes. `{{brand}}` and `{{tint}}` are the brand color and its tint. `<sc-for>` repeats an element, and the class at the bottom of each file holds the sample data. Treat them as visual references for layout, sizes, colors and timing, not as code to port. Build the screens in React Native with the components above.
