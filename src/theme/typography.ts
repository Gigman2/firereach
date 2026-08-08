/**
 * Inter, bundled with the binary.
 *
 * These four used to name a placeholder family that exists on neither
 * platform, behind a comment claiming it resolved to San Francisco and Roboto.
 * It resolved to nothing, so every string in the app inherited whatever font
 * the device was set to. On Android that is user-replaceable — Samsung, Xiaomi,
 * Tecno and Infinix all ship font pickers, and they are common handsets in
 * Ghana — so the app could and did render entirely in a handwriting face. For
 * a screen someone reads while a fire is burning, legibility is not a
 * preference to inherit.
 *
 * One family per weight, which is how RN wants custom fonts: pick the face by
 * name and do NOT also set fontWeight, or Android synthesises a second bold on
 * top of an already-bold face. `Text` strips fontWeight for that reason.
 *
 * Font size is deliberately still scaled by the OS accessibility setting —
 * `allowFontScaling` is left at its default. Overriding the family is about
 * consistency; overriding a user's text-size choice would be a real
 * accessibility regression.
 */
export const typography = {
  fonts: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semiBold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
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
