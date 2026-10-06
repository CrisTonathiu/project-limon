import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { Box, CardBox } from '../restyle';
import { Chip, FilterChip } from './Chip';

function All() {
  const [filter, setFilter] = useState('Todas');
  return (
    <Box gap="l">
      <Box flexDirection="row" flexWrap="wrap" gap="xs">
        <Chip tone="tint" label="P 112 g" />
        <Chip tone="accent" label="C 205 g" />
        <Chip tone="neutral" label="G 58 g" />
        <Chip tone="success" label="Activa" />
        <Chip tone="muted" label="Inactiva" />
      </Box>
      <Box
        flexDirection="row"
        flexWrap="wrap"
        gap="s"
        backgroundColor="primaryTint"
        padding="m"
        borderRadius="m"
      >
        <Chip size="m" label="Desayuno" />
        <Chip size="m" label="10 min" />
        <Chip size="m" label="1 porción" />
      </Box>
      <CardBox variant="primary" flexDirection="row" flexWrap="wrap" gap="xs">
        <Chip tone="onPrimary" label="Proteína 112 g" />
        <Chip tone="onPrimary" label="Carbs 205 g" />
        <Chip tone="onPrimary" label="Grasa 58 g" />
      </CardBox>
      <Box flexDirection="row" flexWrap="wrap" gap="s">
        {['Todas', 'Desayuno', 'Comida', 'Cena'].map((label) => (
          <FilterChip
            key={label}
            label={label}
            selected={label === filter}
            onPress={() => setFilter(label)}
          />
        ))}
      </Box>
    </Box>
  );
}

const meta = { title: 'Components/Chip', component: All } satisfies Meta<typeof All>;
export default meta;
export const Tones: StoryObj<typeof meta> = {};
