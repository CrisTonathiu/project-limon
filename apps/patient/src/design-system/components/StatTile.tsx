import type { ReactNode } from 'react';
import { Box, Text } from '../restyle';
import { Card } from './Card';

export type StatTileProps = {
  /** A 24 px icon, colored by the caller. */
  icon?: ReactNode;
  value: string;
  label: string;
  delay?: number;
};

/** One number with a short label, used three to a row on Inicio and Progreso. */
export function StatTile({ icon, value, label, delay }: StatTileProps) {
  return (
    <Card variant="tile" delay={delay} gap="xs" accessible accessibilityLabel={`${value} ${label}`}>
      {icon ? (
        <Box height={24} justifyContent="center">
          {icon}
        </Box>
      ) : null}
      <Text variant="number">{value}</Text>
      <Text variant="caption">{label}</Text>
    </Card>
  );
}
