import React from 'react';
import { Text as RNText, TextProps as RNTextProps } from 'react-native';
import { typography } from '../../theme/typography';
import { useTheme } from '../../theme/ThemeContext';

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
  const { theme } = useTheme();

  // fontWeight selects the face; it is deliberately NOT passed through to the
  // style. Each Inter weight is its own bundled family, so also declaring a
  // weight makes Android synthesise a faux-bold on top of the real bold face —
  // visibly heavier and blurrier than the genuine one, and only on Android.
  const { fontWeight, ...size } = typography.sizes[variant];

  const getFontFamily = () => {
    if (weight) return typography.fonts[weight];
    if (fontWeight === 'bold') return typography.fonts.bold;
    if (fontWeight === '600') return typography.fonts.semiBold;
    return typography.fonts.regular;
  };

  return (
    <RNText
      style={[
        {
          ...size,
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
