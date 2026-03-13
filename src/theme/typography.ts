export const typography = {
  fonts: {
    regular: 'system-font', // Will default to San Francisco on iOS and Roboto on Android
    medium: 'system-font',
    semiBold: 'system-font',
    bold: 'system-font',
  },
  sizes: {
    displayBold: { fontSize: 32, fontWeight: 'bold' as const, lineHeight: 40 },
    heading1: { fontSize: 28, fontWeight: 'bold' as const, lineHeight: 36 },
    heading2: { fontSize: 24, fontWeight: 'bold' as const, lineHeight: 32 },
    heading3: { fontSize: 20, fontWeight: 'bold' as const, lineHeight: 28 },
    bodyLarge: { fontSize: 18, fontWeight: 'normal' as const, lineHeight: 28 },
    bodyMedium: { fontSize: 16, fontWeight: 'normal' as const, lineHeight: 24 },
    caption: { fontSize: 14, fontWeight: 'normal' as const, lineHeight: 20 },
    label: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },
  },
};
