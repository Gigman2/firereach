import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { FireIcon } from 'phosphor-react-native';
import { Text } from '../../components/ui/Text';
import { colors } from '../../theme/colors';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

export const SplashScreen = ({ navigation }: Props) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace('OnboardingIntro');
    }, 2500);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <View style={styles.bgAccentTop} />
      <View style={styles.bgAccentBottom} />

      <View style={styles.logoContainer}>
        <FireIcon size={72} color="#FFFFFF" weight="fill" />
      </View>

      <Text variant="displayBold" color="#FFFFFF" align="center">
        FireReach
      </Text>

      <Text
        variant="bodyLarge"
        color="rgba(255,255,255,0.9)"
        align="center"
        style={styles.tagline}
      >
        Reach help faster.
      </Text>

      <View style={styles.dotsContainer}>
        <View style={[styles.dot, { opacity: 1 }]} />
        <View style={[styles.dot, { opacity: 0.6 }]} />
        <View style={[styles.dot, { opacity: 0.3 }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bgAccentTop: {
    position: 'absolute',
    top: -96,
    left: -96,
    width: 256,
    height: 256,
    borderRadius: 128,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  bgAccentBottom: {
    position: 'absolute',
    bottom: -96,
    right: -96,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  logoContainer: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  fireIcon: {
    fontSize: 64, // font-exempt: emoji glyph
  },
  tagline: {
    marginTop: 8,
  },
  dotsContainer: {
    position: 'absolute',
    bottom: 64,
    flexDirection: 'row',
    gap: 12,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
});
