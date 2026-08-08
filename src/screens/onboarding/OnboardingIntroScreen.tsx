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
import * as onboarding from './onboardingStyles';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingIntro'>;

export const OnboardingIntroScreen = ({ navigation }: Props) => {
  const { theme } = useTheme();

  return (
    <View style={[onboarding.screen, { backgroundColor: theme.background }]}>
      <View style={onboarding.fill}>
        <View style={onboarding.headerEnd}>
          <TouchableOpacity
            onPress={async () => {
              // Leaving onboarding by any door counts as having seen it.
              // This used to jump straight to MainTabs without recording it,
              // so the whole flow replayed on the next launch, forever.
              await completeOnboarding();
              // reset, not replace: replace swaps only the focused route, so the
              // steps pushed behind it survive and an edge-swipe from Home
              // re-reveals them.
              navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
            }}
            accessibilityRole='button'
            accessibilityLabel='Skip onboarding'
            hitSlop={8}
          >
            <Text
              variant='caption'
              weight='semiBold'
              color={theme.textSecondary}
            >
              Skip
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.heroSection}>
          <View style={[onboarding.iconCircle(192), styles.iconOuter]}>
            <View style={[onboarding.iconCircle(128), styles.iconInner]}>
              <FireIcon size={64} color='#FFFFFF' weight='fill' />
            </View>
          </View>
        </View>

        <View style={styles.contentSection}>
          <Text variant='displayBold' align='center'>
            Reach help faster.
          </Text>
          <Text
            variant='bodyLarge'
            color={theme.textSecondary}
            align='center'
            style={styles.description}
          >
            In case of an emergency, get the assistance you need with just a few
            taps on your screen.
          </Text>
        </View>

        <View style={onboarding.actions}>
          <Button
            title='Next'
            onPress={() => navigation.navigate('HowItWorks')}
            rightIcon={<ArrowRightIcon size={20} color='#FFFFFF' />}
          />
        </View>
      </View>

      <View style={onboarding.dotsRow}>
        <OnboardingDots total={5} step={1} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
    paddingBottom: 32,
  },
  iconOuter: {
    backgroundColor: `${colors.brandPrimary}15`,
  },
  iconInner: {
    backgroundColor: colors.brandPrimary,
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
});
