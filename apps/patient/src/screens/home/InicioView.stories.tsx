import type { Meta, StoryObj } from '@storybook/react-native';
import { PhoneFrame } from '../../design-system/stories/PhoneFrame';
import { InicioView, type InicioViewProps } from './InicioView';

function Phone(props: InicioViewProps) {
  return (
    <PhoneFrame tab="home">
      <InicioView {...props} />
    </PhoneFrame>
  );
}

/** The mockup's sample data (docs/ui/mockups/01-inicio.html). */
const full: InicioViewProps = {
  today: new Date(2026, 9, 5),
  firstName: 'Ana',
  ring: { kind: 'weightGoal', changeKg: -4.2, goalKg: -7 },
  planAdherence: 0.86,
  streakDays: 12,
  mealsToday: { eaten: 3, planned: 5 },
  calories: { eaten: 1240, target: 1800 },
  weight: { valuesKg: [78, 77.4, 76.8, 76.3, 75.1, 74.8, 74.2, 73.9, 73.8], weeks: 8 },
  nextMeal: { when: '14:00', title: 'Ensalada de quinoa' },
  onOpenProfile: () => {},
  onOpenNextMeal: () => {},
};

const meta = {
  title: 'Screens/Inicio',
  component: Phone,
  parameters: { screen: true, layout: 'fullscreen' },
  args: full,
} satisfies Meta<typeof Phone>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every block on: what Inicio looks like once the goal tracker and meal check-off ship. */
export const Anillo: Story = {};

/**
 * What the MVP can fill today: no goal tracker yet, so the ring shows today's calories, and
 * without meal check-off there is no plan ring, streak or meals tile.
 */
export const MvpToday: Story = {
  args: {
    ring: { kind: 'calories', eaten: 1240, target: 1800 },
    planAdherence: null,
    streakDays: null,
    mealsToday: null,
    weight: null,
  },
};

/** A patient whose goal is to gain weight. */
export const GainGoal: Story = {
  args: {
    firstName: 'Mariana Guadalupe',
    ring: { kind: 'weightGoal', changeKg: 2.5, goalKg: 4 },
    planAdherence: 0.4,
    streakDays: 1,
    mealsToday: { eaten: 0, planned: 4 },
    weight: { valuesKg: [52, 52.4, 53.1, 53.5, 54.5], weeks: 4 },
  },
};

/** A new patient whose nutritionist hasn't set a plan or goal yet: only the greeting. */
export const Empty: Story = {
  args: {
    ring: null,
    planAdherence: null,
    streakDays: null,
    mealsToday: null,
    calories: null,
    weight: null,
    nextMeal: null,
  },
};
