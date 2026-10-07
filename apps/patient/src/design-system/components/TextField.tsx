import { TextInput } from 'react-native';
import { fonts } from '../theme';
import { Box, Text, useAppTheme } from '../restyle';

export type TextFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  /** Also the screen reader label. */
  placeholder: string;
  keyboardType?: 'decimal-pad' | 'number-pad';
  multiline?: boolean;
  /** A unit after the value, e.g. "kg". */
  suffix?: string;
  maxLength?: number;
  /** `background` stands out inside a white sheet; `surface` on the beige screen background. */
  tone?: 'surface' | 'background';
};

/** A rounded text field with an optional unit after it. */
export function TextField({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  suffix,
  maxLength,
  tone = 'surface',
}: TextFieldProps) {
  const { colors } = useAppTheme();
  return (
    <Box
      flexDirection="row"
      alignItems="center"
      gap="s"
      backgroundColor={tone}
      borderRadius="m"
      paddingHorizontal="l"
      minHeight={52}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={placeholder}
        keyboardType={keyboardType}
        multiline={multiline}
        maxLength={maxLength ?? (multiline ? 300 : 6)}
        style={{
          flex: 1,
          minHeight: multiline ? 96 : 44,
          paddingVertical: 12,
          fontFamily: fonts.body,
          fontSize: 15,
          color: colors.text,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
      {suffix ? <Text variant="label">{suffix}</Text> : null}
    </Box>
  );
}
