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
import { NATIONAL_EMERGENCY_PHONE } from "../../lib/stationTypes";
import { itemBySlug, badgeText, effectiveState } from "../../lib/safetyContent";
import { SUBCATEGORY_META, NEUTRAL_ACCENT } from "./GuidesHubScreen";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { GuidesStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<GuidesStackParamList, "GuideDetail">;

export const GuideDetailScreen = ({ navigation, route }: Props) => {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();

  const item = itemBySlug(route.params.guideId);
  const state = item ? effectiveState(item) : "pending";
  const isReviewed = state === "reviewed";
  const isFirstAid = item?.category === "first_aid";

  if (!item) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.background,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          },
        ]}
      >
        <Text variant="bodyLarge" weight="bold">
          Guide unavailable
        </Text>
        <Text
          variant="caption"
          color={theme.textSecondary}
          style={{ marginTop: 8, textAlign: "center" }}
        >
          This guide has been withdrawn or is not in this version of the app.
        </Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.goBackButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text variant="caption" weight="bold" color={colors.brandPrimary}>
            Go back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Category colour band, not the emergency red reserved for call/emergency
  // actions. Falls back to a neutral grey if this item's subcategory is
  // somehow missing from SUBCATEGORY_META.
  const headerColor = SUBCATEGORY_META[item.subcategory]?.accent ?? NEUTRAL_ACCENT;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Category-coloured header */}
      <View style={[styles.header, { backgroundColor: headerColor, paddingTop: insets.top + 8 }]}>
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
            {item.title}
          </Text>
          <View style={styles.headerBadge}>
            <Text variant="label" color="#FFFFFF">
              {isFirstAid ? "FIRST AID" : "HAZARD"}
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
          <Text style={{ fontSize: 48 /* font-exempt: emoji glyph */ }}>🩹</Text>
        </View>

        {/* Meta badge */}
        <View
          style={[
            styles.metaBadge,
            isReviewed
              ? {
                  backgroundColor: isDark ? "#451A03" : "#FEF3C7",
                  borderColor: isDark ? "#78350F" : "#FDE68A",
                }
              : { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <CalendarIcon
            size={14}
            color={isReviewed ? (isDark ? "#FDE68A" : "#92400E") : theme.textTertiary}
          />
          <Text
            variant="label"
            color={isReviewed ? (isDark ? "#FDE68A" : "#92400E") : theme.textTertiary}
          >
            {badgeText(item)}
          </Text>
        </View>

        {/* First-aid disclaimer — above step 1, not below the steps */}
        {isFirstAid && (
          <View
            style={[
              styles.disclaimer,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <WarningCircleIcon size={16} color={theme.textSecondary} />
            <Text
              variant="caption"
              color={theme.textSecondary}
              style={{ flex: 1, lineHeight: 18 }}
            >
              General first aid guidance. Not a substitute for professional medical care.
            </Text>
          </View>
        )}

        {/* Steps or body, by category */}
        {isFirstAid ? (
          <View style={styles.steps}>
            {item.steps.map((step, index) => (
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
        ) : (
          <Text variant="bodyMedium" color={theme.textSecondary} style={{ lineHeight: 24 }}>
            {item.body}
          </Text>
        )}
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
              In an active emergency, call 192 — free on any network
            </Text>
          </View>
          <TouchableOpacity
            style={styles.callNowButton}
            activeOpacity={0.85}
            onPress={() =>
              Linking.openURL(`tel:${NATIONAL_EMERGENCY_PHONE}`).catch((err) =>
                console.warn("[GuideDetail] dial failed", err)
              )
            }
          >
            <PhoneIcon size={16} color="#FFFFFF" weight="fill" />
            <Text variant="caption" weight="bold" color="#FFFFFF">
              Call 192
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
  goBackButton: {
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  disclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
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
