import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { GuidesStackParamList } from "../navigation/types";
import { GuidesHubScreen } from "./guides/GuidesHubScreen";
import { GuideDetailScreen } from "./guides/GuideDetailScreen";
import { GuidesChatScreen } from "./guides/GuidesChatScreen";

const Stack = createNativeStackNavigator<GuidesStackParamList>();

export const SafetyScreen = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="GuidesHub" component={GuidesHubScreen} />
      <Stack.Screen name="GuideDetail" component={GuideDetailScreen} />
      <Stack.Screen name="GuidesChat" component={GuidesChatScreen} />
    </Stack.Navigator>
  );
};
