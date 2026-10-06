import type { ReactNode } from 'react';
import { Box, Entering, fonts, Text } from '../../design-system';
import { formatNumber } from '../../i18n/format';

/** A titled block of a detail screen (Ingredientes, Preparación). */
export function Section({
  title,
  delay,
  children,
}: {
  title: string;
  delay?: number;
  children: ReactNode;
}) {
  return (
    <Entering delay={delay}>
      <Box gap="s">
        <Text variant="h2" accessibilityRole="header">
          {title}
        </Text>
        {children}
      </Box>
    </Entering>
  );
}

/** Numbered preparation steps, each number in a tinted circle. */
export function StepList({ steps }: { steps: string[] }) {
  return (
    <Box gap="m">
      {steps.map((step, n) => (
        <Box key={n} flexDirection="row" gap="m" alignItems="flex-start">
          <Box
            width={28}
            height={28}
            borderRadius="pill"
            backgroundColor="primaryTint"
            alignItems="center"
            justifyContent="center"
          >
            <Text variant="chip" fontFamily={fonts.display} color="primary">
              {formatNumber(n + 1)}
            </Text>
          </Box>
          <Box flex={1} paddingTop="xs">
            <Text variant="body">{step}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/** "Nombre ……… cantidad" rows with a divider between them. */
export function AmountList({ rows }: { rows: { key: string; name: string; amount: string }[] }) {
  return (
    <Box>
      {rows.map((row) => (
        <Box
          key={row.key}
          flexDirection="row"
          justifyContent="space-between"
          gap="m"
          paddingVertical="s"
          borderBottomWidth={1}
          borderBottomColor="divider"
        >
          <Box flex={1}>
            <Text variant="body">{row.name}</Text>
          </Box>
          <Text variant="body" color="textMuted">
            {row.amount}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
