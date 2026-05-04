"use widget";

import {
  VStack,
  HStack,
  Text,
  Image,
  Spacer,
} from "@expo/ui/swift-ui";
import {
  frame,
  foregroundStyle,
  background,
  font,
  padding,
} from "@expo/ui/swift-ui/modifiers";
import type { WidgetEnvironment } from "expo-widgets";

type WidgetProps = {
  stationName: string;
  stationDistance: string;
  emergencyNumber: string;
};

const BRAND_RED = "#CC1B1B";

export default function EmergencyWidget(
  props: WidgetProps,
  environment: WidgetEnvironment
) {
  const {
    stationName = "Accra Central Fire Station",
    stationDistance = "approx. 2.4 km away",
    emergencyNumber = "192",
  } = props;

  const family = environment.widgetFamily;

  // ── systemSmall (2x2) ──
  // Compact red card: branding, station, call strip
  if (family === "systemSmall") {
    return (
      <VStack
        spacing={0}
        modifiers={[
          background(BRAND_RED),
          frame({ maxWidth: Infinity, maxHeight: Infinity }),
        ]}
      >
        {/* Top content */}
        <VStack
          spacing={4}
          alignment="leading"
          modifiers={[
            padding({ top: 14, leading: 14, trailing: 14, bottom: 8 }),
            frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" }),
          ]}
        >
          {/* Brand */}
          <HStack spacing={4} alignment="center">
            <Image
              systemName="flame.fill"
              modifiers={[foregroundStyle("#FFFFFF"), frame({ width: 14, height: 14 })]}
            />
            <Text
              modifiers={[
                font({ size: 9, weight: "bold" }),
                foregroundStyle("#FFFFFF"),
              ]}
            >
              FIREREACH
            </Text>
          </HStack>

          <Spacer />

          {/* Station info */}
          <Text
            modifiers={[
              font({ size: 14, weight: "bold" }),
              foregroundStyle("#FFFFFF"),
            ]}
          >
            {stationName}
          </Text>
          <Text
            modifiers={[
              font({ size: 11, weight: "medium" }),
              foregroundStyle("rgba(255,255,255,0.9)"),
            ]}
          >
            {stationDistance}
          </Text>
        </VStack>

        {/* Call bar */}
        <HStack
          spacing={6}
          alignment="center"
          modifiers={[
            background("#FFFFFF"),
            frame({ maxWidth: Infinity, height: 40 }),
          ]}
        >
          <Image
            systemName="phone.fill"
            modifiers={[foregroundStyle(BRAND_RED), frame({ width: 16, height: 16 })]}
          />
          <Text
            modifiers={[
              font({ size: 13, weight: "bold" }),
              foregroundStyle(BRAND_RED),
            ]}
          >
            CALL
          </Text>
        </HStack>
      </VStack>
    );
  }

  // ── systemMedium (2x1) — matches Stitch design ──
  // Full red bg, station info top, white call bar bottom
  return (
    <VStack
      spacing={0}
      modifiers={[
        background(BRAND_RED),
        frame({ maxWidth: Infinity, maxHeight: Infinity }),
      ]}
    >
      {/* Top content area */}
      <VStack
        spacing={4}
        alignment="leading"
        modifiers={[
          padding({ top: 16, leading: 16, trailing: 16, bottom: 8 }),
          frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" }),
        ]}
      >
        {/* Brand header */}
        <HStack spacing={6} alignment="center">
          <Image
            systemName="flame.fill"
            modifiers={[foregroundStyle("#FFFFFF"), frame({ width: 20, height: 20 })]}
          />
          <Text
            modifiers={[
              font({ size: 11, weight: "bold" }),
              foregroundStyle("#FFFFFF"),
            ]}
          >
            FIREREACH
          </Text>
        </HStack>

        <Spacer />

        {/* Station info */}
        <Text
          modifiers={[
            font({ size: 18, weight: "bold" }),
            foregroundStyle("#FFFFFF"),
          ]}
        >
          {stationName}
        </Text>
        <Text
          modifiers={[
            font({ size: 14, weight: "medium" }),
            foregroundStyle("rgba(255,255,255,0.9)"),
          ]}
        >
          {stationDistance}
        </Text>
      </VStack>

      {/* Full-width white call bar */}
      <HStack
        spacing={8}
        alignment="center"
        modifiers={[
          background("#FFFFFF"),
          frame({ maxWidth: Infinity, height: 56 }),
        ]}
      >
        <Image
          systemName="phone.fill"
          modifiers={[foregroundStyle(BRAND_RED), frame({ width: 24, height: 24 })]}
        />
        <Text
          modifiers={[
            font({ size: 18, weight: "bold" }),
            foregroundStyle(BRAND_RED),
          ]}
        >
          CALL
        </Text>
      </HStack>
    </VStack>
  );
}
