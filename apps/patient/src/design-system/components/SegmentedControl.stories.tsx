import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { SegmentedControl } from './SegmentedControl';

function Demo() {
  const [value, setValue] = useState<'weeks8' | 'months3' | 'all'>('weeks8');
  return (
    <SegmentedControl
      accessibilityLabel="Periodo"
      value={value}
      onChange={setValue}
      options={[
        { key: 'weeks8', label: '8 sem' },
        { key: 'months3', label: '3 meses' },
        { key: 'all', label: 'Todo' },
      ]}
    />
  );
}

const meta = { title: 'Components/SegmentedControl', component: Demo } satisfies Meta<typeof Demo>;
export default meta;
export const Period: StoryObj<typeof meta> = {};
