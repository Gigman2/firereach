import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  HouseIcon,
  FireIcon,
  BookOpenTextIcon,
  GearSixIcon,
} from "phosphor-react-native";
import { MainTabParamList } from "./types";
import { HomeScreen } from "../screens/HomeScreen";
import { StationsScreen } from "../screens/StationsScreen";
import { SafetyScreen } from "../screens/SafetyScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { colors } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { typography } from "../theme/typography";

const Tab = createBottomTabNavigator<MainTabParamList>();

export const TabNavigator = () => {
  const { theme } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: theme.textTertiary,
        // React Navigation renders these labels itself, so they never pass
        // through the styled Text and would keep inheriting the device font.
        // Family instead of fontWeight, for the faux-bold reason in typography.ts.
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: typography.fonts.semiBold,
        },
        tabBarStyle: {
          backgroundColor: theme.tabBarBg,
          borderTopColor: theme.border,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <HouseIcon
              size={24}
              color={color}
              weight={focused ? "fill" : "regular"}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Stations"
        component={StationsScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <FireIcon
              size={24}
              color={color}
              weight={focused ? "fill" : "regular"}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Guides"
        component={SafetyScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <BookOpenTextIcon
              size={24}
              color={color}
              weight={focused ? "fill" : "regular"}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <GearSixIcon
              size={24}
              color={color}
              weight={focused ? "fill" : "regular"}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
};
