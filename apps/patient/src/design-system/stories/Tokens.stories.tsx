import type { Meta, StoryObj } from '@storybook/react-native';
import { ScrollView } from 'react-native';
import { Box, Text, useAppTheme } from '../restyle';
import type { AppTheme } from '../theme';

function Tokens() {
  const theme = useAppTheme();
  return (
    <ScrollView>
      <Text variant="h2" marginBottom="m">
        Colors
      </Text>
      <Box flexDirection="row" flexWrap="wrap" gap="s" marginBottom="xl">
        {(Object.keys(theme.colors) as (keyof AppTheme['colors'])[]).map((key) => (
          <Box key={key} width={96} gap="xs">
            <Box
              height={48}
              borderRadius="s"
              backgroundColor={key}
              borderWidth={1}
              borderColor="divider"
            />
            <Text variant="caption">{key}</Text>
            <Text variant="caption">{theme.colors[key]}</Text>
          </Box>
        ))}
      </Box>
      <Text variant="h2" marginBottom="m">
        Type
      </Text>
      {(Object.keys(theme.textVariants) as (keyof AppTheme['textVariants'])[])
        .filter((v) => v !== 'defaults')
        .map((variant) => (
          <Box key={variant} flexDirection="row" alignItems="baseline" gap="m" marginBottom="s">
            <Box width={88}>
              <Text variant="caption">{variant}</Text>
            </Box>
            <Text variant={variant}>Hola, Ana 72.4</Text>
          </Box>
        ))}
      <Text variant="h2" marginVertical="m">
        Spacing
      </Text>
      {(Object.keys(theme.spacing) as (keyof AppTheme['spacing'])[]).map((key) => (
        <Box key={key} flexDirection="row" alignItems="center" gap="m" marginBottom="xs">
          <Box width={88}>
            <Text variant="caption">
              {key} · {theme.spacing[key]}
            </Text>
          </Box>
          <Box
            height={12}
            width={theme.spacing[key]}
            backgroundColor="primary"
            borderRadius="pill"
          />
        </Box>
      ))}
    </ScrollView>
  );
}

const meta = {
  title: 'Foundations/Tokens',
  component: Tokens,
} satisfies Meta<typeof Tokens>;

export default meta;

export const All: StoryObj<typeof meta> = {};
