import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SettingsStackParamList } from "../navigation/types";
import { SettingsHomeScreen } from "./settings/SettingsHomeScreen";
import { SavedPlacesScreen } from "./settings/SavedPlacesScreen";

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export const SettingsScreen = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SettingsHome" component={SettingsHomeScreen} />
      <Stack.Screen name="SavedPlaces" component={SavedPlacesScreen} />
    </Stack.Navigator>
  );
};
