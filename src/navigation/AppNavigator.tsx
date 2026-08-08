import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RootStackParamList } from "./types";
import { TabNavigator } from "./TabNavigator";
import { SplashScreen } from "../screens/onboarding/SplashScreen";
import { OnboardingIntroScreen } from "../screens/onboarding/OnboardingIntroScreen";
import { LocationRequestScreen } from "../screens/onboarding/LocationRequestScreen";
import { LocationDeniedScreen } from "../screens/onboarding/LocationDeniedScreen";
import { SavePlaceScreen } from "../screens/onboarding/SavePlaceScreen";
import { HowItWorksScreen } from "../screens/onboarding/HowItWorksScreen";
import { OnboardingReadyScreen } from "../screens/onboarding/OnboardingReadyScreen";
import { colors } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";

const ONBOARDING_COMPLETE_KEY = "@firereach_onboarding_complete";

const Stack = createNativeStackNavigator<RootStackParamList>();

const LightNavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.light.background,
  },
};

const DarkNavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.dark.background,
  },
};

export const AppNavigator = () => {
  const { isDark } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  useEffect(() => {
    const checkOnboarding = async () => {
      const value = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
      setHasCompletedOnboarding(value === "true");
      setIsLoading(false);
    };
    checkOnboarding();
  }, []);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.brandPrimary,
        }}
      >
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={isDark ? DarkNavTheme : LightNavTheme}>
        <Stack.Navigator
          initialRouteName={hasCompletedOnboarding ? "MainTabs" : "Splash"}
          screenOptions={{ headerShown: false, animation: "fade" }}
        >
          <Stack.Screen name="Splash" component={SplashScreen} />
          <Stack.Screen
            name="OnboardingIntro"
            component={OnboardingIntroScreen}
          />
          <Stack.Screen name="HowItWorks" component={HowItWorksScreen} />
          <Stack.Screen
            name="LocationRequest"
            component={LocationRequestScreen}
          />
          <Stack.Screen
            name="LocationDenied"
            component={LocationDeniedScreen}
          />
          <Stack.Screen name="SavePlace" component={SavePlaceScreen} />
          <Stack.Screen
            name="OnboardingReady"
            component={OnboardingReadyScreen}
          />
          <Stack.Screen name="MainTabs" component={TabNavigator} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
};
