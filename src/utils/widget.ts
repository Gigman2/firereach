import { createWidget } from "expo-widgets";
import EmergencyWidget from "../../widgets/emergency";

type EmergencyWidgetProps = {
  stationName: string;
  stationDistance: string;
  emergencyNumber: string;
};

const emergencyWidget = createWidget<EmergencyWidgetProps>(
  "emergency",
  EmergencyWidget
);

/**
 * Updates the home screen widget with the nearest station info.
 * Call this when location changes or station data refreshes.
 */
export function updateEmergencyWidget(data: {
  stationName: string;
  stationDistance: string;
  emergencyNumber?: string;
}) {
  emergencyWidget.updateSnapshot({
    stationName: data.stationName,
    stationDistance: data.stationDistance,
    emergencyNumber: data.emergencyNumber ?? "192",
  });
}

/**
 * Reloads all widget timelines (e.g. after app launch).
 */
export function reloadEmergencyWidget() {
  emergencyWidget.reload();
}
