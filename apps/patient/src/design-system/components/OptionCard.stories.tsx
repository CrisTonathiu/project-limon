import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { Box } from '../restyle';
import { OptionCard } from './OptionCard';

const options = [
  ['Gradual', 'Poco a poco: más fácil de sostener.'],
  ['Moderado', 'Un ritmo constante.'],
  ['Más rápido', 'Pide más constancia.'],
];

function Demo() {
  const [selected, setSelected] = useState('Gradual');
  return (
    <Box gap="m">
      {options.map(([label, hint]) => (
        <OptionCard
          key={label}
          label={label!}
          hint={hint}
          selected={label === selected}
          onPress={() => setSelected(label!)}
        />
      ))}
    </Box>
  );
}

const meta = { title: 'Components/OptionCard', component: Demo } satisfies Meta<typeof Demo>;
export default meta;
export const Paces: StoryObj<typeof meta> = {};
