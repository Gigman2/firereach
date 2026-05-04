export const colors = {
  // Brand
  brandPrimary: '#CC1B1B', // FireReach Red

  // Status
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Light Theme
  light: {
    background: '#FFFFFF',
    surface: '#F9FAFB',
    textPrimary: '#111827',
    textSecondary: '#4B5563',
    textTertiary: '#9CA3AF',
    border: '#E5E7EB',
    divider: '#F3F4F6',
    // Semantic surfaces
    warningBg: '#FFFBEB',
    warningBorder: '#FDE68A',
    warningText: '#92400E',
    emergencyBg: '#FEF2F2',
    emergencyBorder: '#FECACA',
    emergencyText: '#7F1D1D',
    successBadgeBg: '#DCFCE7',
    successBadgeText: '#15803D',
    // Tab bar
    tabBarBg: '#FFFFFF',
  },

  // Dark Theme — warm red-brown tint from brand primary
  dark: {
    background: '#211111',       // bg-background-dark
    surface: '#2D1515',          // primary/10 on bg
    textPrimary: '#F1F5F9',      // slate-100
    textSecondary: '#CBD5E1',    // slate-300
    textTertiary: '#94A3B8',     // slate-400
    border: '#3D1717',           // primary/20 on bg
    divider: '#2D1515',          // primary/10 on bg
    // Semantic surfaces
    warningBg: '#451A03',
    warningBorder: '#78350F',
    warningText: '#FDE68A',
    emergencyBg: '#3B0A0A',
    emergencyBorder: '#991B1B',
    emergencyText: '#FECACA',
    successBadgeBg: '#0D2818',
    successBadgeText: '#4ADE80',
    // Tab bar
    tabBarBg: '#211111',
  },
};

export type ThemeColors = typeof colors.light;
