import React from 'react';
import { Text as RNText, TextProps as RNTextProps, useColorScheme } from 'react-native';
import { typography } from '../../theme/typography';
import { colors } from '../../theme/colors';

export interface TextProps extends RNTextProps {
  variant?: keyof typeof typography.sizes;
  color?: string;
  weight?: keyof typeof typography.fonts;
  align?: 'auto' | 'left' | 'right' | 'center' | 'justify';
}

export const Text = ({
  variant = 'bodyMedium',
  color,
  weight,
  align = 'left',
  style,
  ...props
}: TextProps) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? colors.dark : colors.light;

  const getFontFamily = () => {
    if (weight) return typography.fonts[weight];
    const defaultWeight = typography.sizes[variant].fontWeight;
    if (defaultWeight === 'bold') return typography.fonts.bold;
    if (defaultWeight === '600') return typography.fonts.semiBold;
    return typography.fonts.regular;
  };

  return (
    <RNText
      style={[
        {
          ...typography.sizes[variant],
          fontFamily: getFontFamily(),
          color: color || theme.textPrimary,
          textAlign: align,
        },
        style,
      ]}
      {...props}
    />
  );
};
