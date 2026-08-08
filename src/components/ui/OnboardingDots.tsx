import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

/**
 * One row of progress dots. Replaces four hand-rolled copies that each
 * hardcoded a count, so adding an onboarding step meant editing all of them
 * and quietly getting one wrong.
 */
export const OnboardingDots = ({ total, step }: { total: number; step: number }) => (
  <View style={styles.row}>
    {Array.from({ length: total }, (_, i) => (
      <View key={i} style={i + 1 === step ? styles.active : styles.inactive} />
    ))}
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  active: { height: 8, width: 32, borderRadius: 4, backgroundColor: colors.brandPrimary },
  inactive: { height: 8, width: 8, borderRadius: 4, backgroundColor: `${colors.brandPrimary}33` },
});
