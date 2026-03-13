import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../components/ui/Text';
import { Button } from '../components/ui/Button';

export const HomeScreen = () => {
  return (
    <View style={styles.container}>
      <Text variant="heading1">FireReach</Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        Emergency Response Assistant
      </Text>
      
      <Button
        title="CALL 192"
        size="large"
        onPress={() => console.log('Emergency Call initiated')}
        style={styles.button}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 48,
  },
  button: {
    width: '100%',
  },
});
