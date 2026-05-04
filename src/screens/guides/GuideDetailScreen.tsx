import React from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeftIcon,
  PhoneIcon,
  WarningCircleIcon,
  CalendarIcon,
} from "phosphor-react-native";
import { Text } from "../../components/ui/Text";
import { colors } from "../../theme/colors";
import { useTheme } from "../../theme/ThemeContext";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { GuidesStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<GuidesStackParamList, "GuideDetail">;

// Mock data — in production from API/local DB
const GUIDE = {
  title: "Burns Treatment",
  badge: "FIRST AID",
  headerColor: "#D97706",
  reviewed: "Last reviewed: Jan 2026",
  steps: [
    {
      title: "Remove from heat",
      body: "Move the person away from the heat source immediately and extinguish any flames.",
    },
    {
      title: "Cool with water",
      body: "Run cool (not cold) tap water over the burn for at least 10-20 minutes. Do not use ice.",
    },
    {
      title: "No ice/butter",
      body: "Avoid applying ice, butter, ointments, or home remedies which can damage the tissue further.",
    },
    {
      title: "Cover loosely",
      body: "Apply a loose sterile dressing or clean plastic wrap to protect the area from infection.",
    },
    {
      title: "Seek medical attention",
      body: "Call for emergency help if the burn is large, deep, or affects the face, hands, or airways.",
    },
  ],
};

export const GuideDetailScreen = ({ navigation }: Props) => {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Amber Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <ArrowLeftIcon size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text
            variant="heading2"
            color="#FFFFFF"
            style={styles.headerTitle}
            numberOfLines={1}
          >
            {GUIDE.title}
          </Text>
          <View style={styles.headerBadge}>
            <Text variant="label" color="#FFFFFF">
              {GUIDE.badge}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero placeholder */}
        <View style={[styles.heroImage, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={{ fontSize: 48 }}>🩹</Text>
        </View>

        {/* Meta badge */}
        <View
          style={[
            styles.metaBadge,
            {
              backgroundColor: isDark ? "#451A03" : "#FEF3C7",
              borderColor: isDark ? "#78350F" : "#FDE68A",
            },
          ]}
        >
          <CalendarIcon size={14} color={isDark ? "#FDE68A" : "#92400E"} />
          <Text variant="label" color={isDark ? "#FDE68A" : "#92400E"}>
            {GUIDE.reviewed}
          </Text>
        </View>

        {/* Steps */}
        <View style={styles.steps}>
          {GUIDE.steps.map((step, index) => (
            <View
              key={index}
              style={[
                styles.stepCard,
                { backgroundColor: theme.background, borderColor: theme.border },
              ]}
            >
              <View style={styles.stepNumber}>
                <Text variant="bodyMedium" weight="bold" color="#FFFFFF">
                  {index + 1}
                </Text>
              </View>
              <View style={styles.stepContent}>
                <Text variant="bodyLarge" weight="bold">
                  {step.title}
                </Text>
                <Text
                  variant="caption"
                  color={theme.textSecondary}
                  style={styles.stepBody}
                >
                  {step.body}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Emergency Footer */}
      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + 12,
            backgroundColor: theme.emergencyBg,
            borderTopColor: theme.emergencyBorder,
          },
        ]}
      >
        <View style={styles.footerContent}>
          <View style={styles.footerLeft}>
            <View
              style={[
                styles.emergencyIcon,
                { backgroundColor: isDark ? "#7F1D1D" : "#FEE2E2" },
              ]}
            >
              <WarningCircleIcon size={20} color={colors.brandPrimary} weight="fill" />
            </View>
            <Text variant="caption" weight="medium" color={theme.emergencyText} style={styles.footerText}>
              In an active emergency, call your nearest station
            </Text>
          </View>
          <TouchableOpacity
            style={styles.callNowButton}
            activeOpacity={0.85}
            onPress={() => Linking.openURL("tel:112")}
          >
            <PhoneIcon size={16} color="#FFFFFF" weight="fill" />
            <Text variant="caption" weight="bold" color="#FFFFFF">
              Call Now
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    backgroundColor: "#D97706",
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
  },
  headerBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 100,
  },
  scrollContent: {
    padding: 16,
    gap: 20,
    paddingBottom: 32,
  },
  heroImage: {
    height: 192,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  steps: {
    gap: 12,
  },
  stepCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F59E0B",
    alignItems: "center",
    justifyContent: "center",
  },
  stepContent: {
    flex: 1,
  },
  stepBody: {
    marginTop: 4,
    lineHeight: 20,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  footerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  emergencyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  footerText: {
    flex: 1,
    lineHeight: 18,
  },
  callNowButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: colors.brandPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
});
