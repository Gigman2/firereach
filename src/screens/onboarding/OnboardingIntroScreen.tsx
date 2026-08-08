import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { FireIcon, ArrowRightIcon } from 'phosphor-react-native';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { OnboardingDots } from '../../components/ui/OnboardingDots';
import { colors } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { completeOnboarding } from '../../lib/onboarding';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingIntro'>;

export const OnboardingIntroScreen = ({ navigation }: Props) => {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.skipRow}>
        <TouchableOpacity
          onPress={async () => {
            // Leaving onboarding by any door counts as having seen it.
            // This used to jump straight to MainTabs without recording it,
            // so the whole flow replayed on the next launch, forever.
            await completeOnboarding();
            navigation.replace('MainTabs');
          }}
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
          hitSlop={8}
        >
          <Text variant="caption" weight="semiBold" color={theme.textSecondary}>
            Skip
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.heroSection}>
        <View style={styles.iconOuter}>
          <View style={styles.iconInner}>
            <FireIcon size={64} color="#FFFFFF" weight="fill" />
          </View>
        </View>
      </View>

      <View style={styles.contentSection}>
        <Text variant="displayBold" align="center">
          Reach help faster.
        </Text>
        <Text
          variant="bodyLarge"
          color={theme.textSecondary}
          align="center"
          style={styles.description}
        >
          In case of an emergency, get the assistance you need with just a few
          taps on your screen.
        </Text>
      </View>

      <View style={styles.spacer} />

      <View style={styles.footer}>
        <OnboardingDots total={5} step={1} />

        <Button
          title="Next"
          onPress={() => navigation.navigate('HowItWorks')}
          rightIcon={<ArrowRightIcon size={20} color="#FFFFFF" />}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  skipRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 8,
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
    paddingBottom: 32,
  },
  iconOuter: {
    width: 192,
    height: 192,
    borderRadius: 96,
    backgroundColor: `${colors.brandPrimary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInner: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brandPrimary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  contentSection: {
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  description: {
    marginTop: 16,
  },
  spacer: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: 32,
    paddingBottom: 48,
    gap: 32,
    alignItems: 'center',
  },
});
