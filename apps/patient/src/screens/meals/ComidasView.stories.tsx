import type { Meta, StoryObj } from '@storybook/react-native';
import type { MealLogStatus } from '@limon/types';
import { useState } from 'react';
import { PhoneFrame } from '../../design-system/stories/PhoneFrame';
import { ComidasView, type ComidasViewProps, type ComidasWeek, type MealRow } from './ComidasView';
import type { MealLogTarget } from './MealLogParts';

const letters = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const names = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

/** The mockup's week (docs/ui/mockups/02-comidas.html), on Monday 5 October 2026. */
const week: ComidasWeek = {
  weekLabel: '5 al 11 de octubre',
  days: letters.map((letter, i) => ({
    date: `2026-10-${String(5 + i).padStart(2, '0')}`,
    letter,
    day: String(5 + i),
    accessibilityLabel: `${names[i]}, ${5 + i} de octubre${i === 0 ? ', hoy' : ''}`,
    today: i === 0,
  })),
  selected: 0,
  totals: { calories: 1780, protein: 112, carbohydrate: 205, fat: 58 },
  targetKcal: 1800,
  meals: [
    {
      id: '1',
      label: 'Desayuno',
      time: '8:00',
      recipe: { id: 'r1', title: 'Avena con fresas' },
      kcal: '380 kcal',
      favourite: true,
      status: 'EATEN',
      loggable: true,
    },
    {
      id: '2',
      label: 'Colación',
      time: '11:00',
      recipe: { id: 'r2', title: 'Yogur con nuez' },
      kcal: '180 kcal',
      favourite: false,
      status: 'OTHER',
      loggable: true,
    },
    {
      id: '3',
      label: 'Comida',
      time: '14:00',
      recipe: { id: 'r3', title: 'Ensalada de quinoa con pollo' },
      kcal: '520 kcal',
      favourite: true,
      status: null,
      loggable: true,
    },
    {
      id: '4',
      label: 'Colación',
      time: '17:00',
      recipe: { id: 'r4', title: 'Jícama con limón' },
      kcal: '120 kcal',
      favourite: false,
      status: null,
      loggable: true,
    },
    {
      id: '5',
      label: 'Cena',
      time: '20:00',
      recipe: { id: 'r5', title: 'Tacos de pescado' },
      kcal: '580 kcal',
      favourite: false,
      status: null,
      loggable: true,
    },
  ],
  canRegenerate: true,
  regenerating: false,
  regenerateFailed: false,
  favouriteFailed: false,
  logFailed: false,
};

/** Day switching, hearts and check-offs work, so the story can be clicked through. */
function Phone({
  state,
  openSheet,
}: Pick<ComidasViewProps, 'state'> & { openSheet?: MealLogTarget & { id: string } }) {
  const [selected, setSelected] = useState(0);
  const [favourites, setFavourites] = useState<Record<string, boolean>>({});
  const [logs, setLogs] = useState<Record<string, MealLogStatus | null>>({});
  const [sheet, setSheet] = useState<(MealLogTarget & { id: string }) | null>(openSheet ?? null);
  const statusOf = (m: MealRow) => (m.id in logs ? logs[m.id]! : m.status);
  const answer = (status: MealLogStatus | null) => {
    if (sheet) setLogs((l) => ({ ...l, [sheet.id]: status }));
    setSheet(null);
  };
  const shown: ComidasViewProps['state'] =
    state.status === 'ready'
      ? {
          ...state,
          selected,
          meals: state.meals.map((m) => ({
            ...m,
            favourite: favourites[m.id] ?? m.favourite,
            status: statusOf(m),
          })),
        }
      : state;
  return (
    <PhoneFrame tab="meals">
      <ComidasView
        state={shown}
        onSelectDay={setSelected}
        onToggleFavourite={(m) => setFavourites((f) => ({ ...f, [m.id]: !m.favourite }))}
        onOpenMeal={() => {}}
        onRegenerate={() => {}}
        onOpenShoppingList={() => {}}
        onLogMeal={(m) => {
          const status = statusOf(m);
          setSheet({
            id: m.id,
            label: m.label,
            hasRecipe: !!m.recipe,
            log: status ? { status, note: null, loggedAt: '2026-10-05T15:00:00Z' } : null,
          });
        }}
        logSheet={sheet}
        onSave={(status) => answer(status)}
        onClear={() => answer(null)}
        onClose={() => setSheet(null)}
      />
    </PhoneFrame>
  );
}

const meta = {
  title: 'Screens/Comidas',
  component: Phone,
  parameters: { screen: true, layout: 'fullscreen' },
  args: { state: { status: 'ready', ...week } },
} satisfies Meta<typeof Phone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Semana: Story = {};

/** Two days ago: no "Cambiar el menú" button, and the answers can't be changed any more. */
export const PastDay: Story = {
  args: {
    state: {
      status: 'ready',
      ...week,
      canRegenerate: false,
      meals: week.meals.map((m, i) => ({
        ...m,
        loggable: false,
        status: (['EATEN', 'EATEN', 'OTHER', 'SKIPPED', null] as const)[i]!,
      })),
    },
  },
};

/** A later day: the meals can't be checked off yet. */
export const LaterDay: Story = {
  args: {
    state: {
      status: 'ready',
      ...week,
      meals: week.meals.map((m) => ({ ...m, loggable: false, status: null })),
    },
  },
};

/** The check-off sheet for a meal not answered yet. */
export const CheckOffSheet: Story = {
  args: { openSheet: { id: '3', label: 'Comida', hasRecipe: true, log: null } },
};

/** Answered "something else" with a note: the note field and "Quitar respuesta" show. */
export const CheckOffSheetOther: Story = {
  args: {
    openSheet: {
      id: '2',
      label: 'Colación',
      hasRecipe: true,
      log: { status: 'OTHER', note: 'Unas galletas en la oficina', loggedAt: '2026-10-05T17:00:00Z' },
    },
  },
};

export const CheckOffFailed: Story = {
  args: { state: { status: 'ready', ...week, logFailed: true } },
};

export const Regenerating: Story = {
  args: { state: { status: 'ready', ...week, regenerating: true } },
};

/** FatSecret didn't answer: no totals, no kcal per meal, and one meal had no recipe that fits. */
export const NoNutrition: Story = {
  args: {
    state: {
      status: 'ready',
      ...week,
      totals: null,
      meals: [
        ...week.meals.slice(0, 2).map((m) => ({ ...m, kcal: null })),
        {
          id: 'x',
          label: 'Comida',
          time: '14:00',
          recipe: null,
          kcal: null,
          favourite: false,
          status: null,
          loggable: true,
        },
      ],
    },
  },
};

export const Consult: Story = {
  args: {
    state: {
      status: 'consult',
      message: 'Durante el embarazo o la lactancia, tu nutriólogo definirá tu meta diaria.',
    },
  },
};
export const Loading: Story = { args: { state: { status: 'loading' } } };
export const Failed: Story = { args: { state: { status: 'failed', onRetry: () => {} } } };
