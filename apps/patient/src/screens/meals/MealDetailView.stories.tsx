import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { PhoneFrame } from '../../design-system/stories/PhoneFrame';
import {
  MealDetailView,
  type MealDetailData,
  type MealIngredientRow,
  type SwapOption,
  type SwapSheetState,
} from './MealDetailView';

/** The mockup's meal (docs/ui/mockups/03-detalle-de-comida.html). */
const meal: MealDetailData = {
  title: 'Ensalada de quinoa con pollo',
  caption: 'Comida · lunes, 5 de octubre',
  meta: ['1 porción', '20 min', '520 kcal'],
  description: null,
  macros: { calories: 520, protein: 38, carbohydrate: 52, fat: 17 },
  ingredients: [
    ['Quinoa cocida', '1 taza (185 g)'],
    ['Pechuga de pollo', '120 g'],
    ['Jitomate cherry', '1 taza (150 g)'],
    ['Pepino', '½ pieza (100 g)'],
    ['Aguacate', '⅓ pieza (50 g)'],
    ['Aceite de oliva', '1 cdita. (5 g)'],
  ].map(([name, amount], i) => ({
    id: `i${i}`,
    foodId: `f${i}`,
    name: name!,
    amount: amount!,
    insteadOf: null,
    swappable: i !== 5,
  })),
  steps: [
    'Cocina la quinoa y déjala enfriar.',
    'Asa la pechuga y córtala en tiras.',
    'Mezcla todo y aliña con el aceite y limón.',
  ],
  canSwap: true,
};

const options: SwapOption[] = [
  { foodId: 'f1', name: 'Pechuga de pollo', amount: '120 g', original: true },
  { foodId: 'a', name: 'Atún en agua', amount: '90 g', original: false },
  { foodId: 'b', name: 'Pescado blanco', amount: '120 g', original: false },
  { foodId: 'c', name: 'Huevo', amount: '100 g', original: false },
  { foodId: 'd', name: 'Queso panela', amount: '80 g', original: false },
];

/** The swap sheet works: open it from any "Cambiar", pick an option, confirm. */
function Phone({ data, startWithSheet }: { data: MealDetailData; startWithSheet?: boolean }) {
  const [rows, setRows] = useState(data.ingredients);
  const open = (ingredient: MealIngredientRow): SwapSheetState => ({
    ingredient,
    status: 'loaded',
    options,
    selected: 'a',
    saving: false,
    saveFailed: false,
  });
  const [swap, setSwap] = useState<SwapSheetState | null>(startWithSheet ? open(rows[1]!) : null);
  return (
    <PhoneFrame>
      <MealDetailView
        state={{ status: 'loaded', ...data, ingredients: rows }}
        fallbackTitle={data.title}
        swap={swap}
        onBack={() => {}}
        onOpenSwap={(i) => setSwap(open(i))}
        onSelectSwap={(foodId) => setSwap((s) => (s ? { ...s, selected: foodId } : s))}
        onConfirmSwap={() => {
          if (!swap) return;
          const choice = swap.options.find((o) => o.foodId === swap.selected)!;
          setRows((r) =>
            r.map((i) =>
              i.id === swap.ingredient.id
                ? {
                    ...i,
                    foodId: choice.foodId,
                    name: choice.name,
                    amount: choice.amount,
                    insteadOf: choice.original ? null : options[0]!.name,
                  }
                : i,
            ),
          );
          setSwap(null);
        }}
        onCloseSwap={() => setSwap(null)}
      />
    </PhoneFrame>
  );
}

const meta = {
  title: 'Screens/Detalle de comida',
  component: Phone,
  parameters: { screen: true, layout: 'fullscreen' },
  args: { data: meal },
} satisfies Meta<typeof Phone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** As in the mockup: the swap sheet open on the chicken. */
export const SwapSheet: Story = { args: { startWithSheet: true } };
/** A past meal, or a clinic without food swaps: no "Cambiar" buttons. */
export const NoSwaps: Story = { args: { data: { ...meal, canSwap: false } } };
export const NoNutrition: Story = { args: { data: { ...meal, macros: null } } };
