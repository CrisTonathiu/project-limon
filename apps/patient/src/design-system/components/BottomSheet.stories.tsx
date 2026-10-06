import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { Box } from '../restyle';
import { BottomSheet, SheetOption } from './BottomSheet';
import { Button } from './Button';

const options = [
  ['Atún en agua', '90 g'],
  ['Pescado blanco', '120 g'],
  ['Huevo', '2 piezas'],
  ['Queso panela', '80 g'],
];

function Demo() {
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState(options[0]![0]!);
  return (
    <Box>
      <Button variant="outline" label="Abrir" onPress={() => setOpen(true)} />
      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        closeLabel="Cerrar"
        title="Cambiar pechuga de pollo"
        subtitle="Equivalentes del mismo grupo: alimentos de origen animal"
        footer={<Button label={`Usar ${selected}`} onPress={() => setOpen(false)} />}
      >
        {options.map(([name, amount]) => (
          <SheetOption
            key={name}
            label={name!}
            detail={amount}
            selected={name === selected}
            onPress={() => setSelected(name!)}
          />
        ))}
      </BottomSheet>
    </Box>
  );
}

const meta = { title: 'Components/BottomSheet', component: Demo } satisfies Meta<typeof Demo>;
export default meta;
export const Swap: StoryObj<typeof meta> = {};
