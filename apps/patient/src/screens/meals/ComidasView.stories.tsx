import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { PhoneFrame } from '../../design-system/stories/PhoneFrame';
import { ComidasView, type ComidasViewProps, type ComidasWeek } from './ComidasView';

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
      recipe: { id: 'r1', title: 'Avena con fresas' },
      kcal: '380 kcal',
      favourite: true,
    },
    {
      id: '2',
      label: 'Colación',
      recipe: { id: 'r2', title: 'Yogur con nuez' },
      kcal: '180 kcal',
      favourite: false,
    },
    {
      id: '3',
      label: 'Comida',
      recipe: { id: 'r3', title: 'Ensalada de quinoa con pollo' },
      kcal: '520 kcal',
      favourite: true,
    },
    {
      id: '4',
      label: 'Colación',
      recipe: { id: 'r4', title: 'Jícama con limón' },
      kcal: '120 kcal',
      favourite: false,
    },
    {
      id: '5',
      label: 'Cena',
      recipe: { id: 'r5', title: 'Tacos de pescado' },
      kcal: '580 kcal',
      favourite: false,
    },
  ],
  canRegenerate: true,
  regenerating: false,
  regenerateFailed: false,
  favouriteFailed: false,
};

/** Day switching and hearts work, so the story can be clicked through. */
function Phone({ state }: Pick<ComidasViewProps, 'state'>) {
  const [selected, setSelected] = useState(0);
  const [favourites, setFavourites] = useState<Record<string, boolean>>({});
  const shown: ComidasViewProps['state'] =
    state.status === 'ready'
      ? {
          ...state,
          selected,
          meals: state.meals.map((m) => ({ ...m, favourite: favourites[m.id] ?? m.favourite })),
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

/** A past day: no "Cambiar el menú" button. */
export const PastDay: Story = {
  args: { state: { status: 'ready', ...week, canRegenerate: false } },
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
        { id: 'x', label: 'Comida', recipe: null, kcal: null, favourite: false },
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
