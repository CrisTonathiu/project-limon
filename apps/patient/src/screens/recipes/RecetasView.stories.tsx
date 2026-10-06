import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { PhoneFrame } from '../../design-system/stories/PhoneFrame';
import { matchesSearch } from '../../features/recipes/recipe-search';
import { RecetasView, type RecetasViewProps, type RecipeCard } from './RecetasView';

/** The mockup's recipes (docs/ui/mockups/04-recetas.html); the API gives time and servings, not kcal. */
const recipes: RecipeCard[] = [
  ['Avena con fresas', '10 min · 1 porción'],
  ['Ensalada de quinoa con pollo', '20 min · 2 porciones'],
  ['Tacos de pescado', '25 min · 4 porciones'],
  ['Yogur con nuez', '5 min · 1 porción'],
  ['Sopa de verduras', '30 min · 4 porciones'],
  ['Molletes integrales', '15 min · 2 porciones'],
  ['Jícama con limón', '5 min · 1 porción'],
].map(([title, meta], i) => ({ id: String(i), title: title!, meta: meta! }));

const filters = ['Todas', 'Desayuno', 'Comida', 'Cena', 'Colación'].map((label) => ({
  key: label,
  label,
}));

/** Search and chips work on the sample recipes. */
function Phone({ state }: Pick<RecetasViewProps<string>, 'state'>) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Todas');
  const shown: RecetasViewProps<string>['state'] =
    state.status === 'loaded'
      ? { status: 'loaded', recipes: state.recipes.filter((r) => matchesSearch(r.title, query)) }
      : state;
  return (
    <PhoneFrame tab="recipes">
      <RecetasView
        query={query}
        onChangeQuery={setQuery}
        filters={filters}
        filter={filter}
        onSelectFilter={setFilter}
        state={shown}
      />
    </PhoneFrame>
  );
}

const meta = {
  title: 'Screens/Recetas',
  component: Phone,
  parameters: { screen: true, layout: 'fullscreen' },
  args: { state: { status: 'loaded', recipes } },
} satisfies Meta<typeof Phone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { state: { status: 'loaded', recipes: [] } } };
export const Loading: Story = { args: { state: { status: 'loading' } } };
export const Failed: Story = { args: { state: { status: 'failed', onRetry: () => {} } } };
