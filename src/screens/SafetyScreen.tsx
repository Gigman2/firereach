import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../components/ui/Text';

export const SafetyScreen = () => {
  return (
    <View style={styles.container}>
      <Text variant="heading2">Safety Guides</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
