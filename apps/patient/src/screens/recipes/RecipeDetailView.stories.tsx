import type { Meta, StoryObj } from '@storybook/react-native';
import { PhoneFrame } from '../../design-system/stories/PhoneFrame';
import { RecipeDetailView, type RecipeDetailData } from './RecipeDetailView';

/** The mockup's recipe (docs/ui/mockups/05-detalle-de-receta.html). */
const recipe: RecipeDetailData = {
  title: 'Avena con fresas',
  meta: ['Desayuno', '10 min', '1 porción'],
  description: null,
  macrosPerServing: { calories: 380, protein: 14, carbohydrate: 58, fat: 10 },
  ingredients: [
    ['Avena en hojuelas', '½ taza'],
    ['Leche descremada', '1 taza'],
    ['Fresas', '1 taza'],
    ['Canela', '1 pizca'],
    ['Almendras', '6 piezas'],
  ].map(([name, amount], i) => ({ key: String(i), name: name!, amount: amount! })),
  steps: [
    'Calienta la leche con la canela sin que hierva.',
    'Agrega la avena y cocina 5 minutos, moviendo.',
    'Sirve con las fresas en rodajas y las almendras.',
  ],
};

function Phone({ data }: { data: RecipeDetailData }) {
  return (
    <PhoneFrame>
      <RecipeDetailView
        state={{ status: 'loaded', ...data }}
        fallbackTitle={data.title}
        onBack={() => {}}
      />
    </PhoneFrame>
  );
}

const meta = {
  title: 'Screens/Detalle de receta',
  component: Phone,
  parameters: { screen: true, layout: 'fullscreen' },
  args: { data: recipe },
} satisfies Meta<typeof Phone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** FatSecret couldn't give every ingredient: "no disponible", never partial numbers. */
export const NoNutrition: Story = { args: { data: { ...recipe, macrosPerServing: null } } };
export const LongTitle: Story = {
  args: {
    data: {
      ...recipe,
      title: 'Chiles rellenos de queso panela al horno con caldillo de jitomate',
      meta: ['Comida', 'Cena', '40 min', '4 porciones'],
    },
  },
};
