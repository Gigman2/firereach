import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StationsStackParamList } from "../navigation/types";
import { StationsListScreen } from "./stations/StationsListScreen";
import { StationDetailScreen } from "./stations/StationDetailScreen";
import { ReportStationScreen } from "./stations/ReportStationScreen";

const Stack = createNativeStackNavigator<StationsStackParamList>();

export const StationsScreen = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="StationsList" component={StationsListScreen} />
      <Stack.Screen name="StationDetail" component={StationDetailScreen} />
      <Stack.Screen name="ReportStation" component={ReportStationScreen} />
    </Stack.Navigator>
  );
};
