import type { Meta, StoryObj } from '@storybook/react-native';
import { PhoneFrame } from '../../design-system/stories/PhoneFrame';
import { PerfilView, type PerfilViewProps } from './PerfilView';

/** The mockup (docs/ui/mockups/07-perfil.html). */
const base: PerfilViewProps = {
  name: 'Ana',
  email: 'ana@correo.com',
  state: {
    status: 'loaded',
    profile: {
      target: { kcal: 1800, proteinG: 112, carbsG: 205, fatG: 58 },
      facts: [
        { label: 'Estatura', value: '162 cm' },
        { label: 'Peso', value: '73.8 kg' },
        { label: 'Nacimiento', value: '12 de abril de 1992' },
        { label: 'Actividad', value: 'Moderada' },
        { label: 'Comidas al día', value: '5' },
        { label: 'Alergias', value: 'Ninguna' },
      ],
    },
  },
  subscription: { label: 'Activa', active: true },
  supportEmail: 'hola@marianutricion.mx',
  deleting: false,
  deleteError: null,
  onEdit: () => {},
  onOpenSubscription: () => {},
  onSignOut: () => {},
  onDeleteAccount: () => {},
};

function Phone(props: PerfilViewProps) {
  return (
    <PhoneFrame tab="profile">
      <PerfilView {...props} />
    </PhoneFrame>
  );
}

const meta = {
  title: 'Screens/Perfil',
  component: Phone,
  parameters: { screen: true, layout: 'fullscreen' },
  args: base,
} satisfies Meta<typeof Phone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The guardrails withheld an automatic target: the nutritionist sets it. */
export const TargetOnHold: Story = {
  args: {
    state: {
      status: 'loaded',
      profile: {
        target: {
          hold: 'Durante el embarazo o la lactancia, tu nutriólogo definirá tu meta diaria.',
        },
        facts: [
          { label: 'Estatura', value: '158 cm' },
          { label: 'Peso', value: '64 kg' },
          { label: 'Alergias', value: 'Cacahuate, Mariscos' },
          { label: 'No te gusta', value: 'Hígado, Betabel' },
          { label: 'Embarazo o lactancia', value: 'Sí' },
        ],
      },
    },
  },
};

/** On the paywall, never subscribed. */
export const NotSubscribed: Story = { args: { subscription: null } };
export const Deleting: Story = { args: { deleting: true } };
export const Loading: Story = { args: { name: null, state: { status: 'loading' } } };
