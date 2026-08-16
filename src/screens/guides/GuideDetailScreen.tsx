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
import { GuideBody } from "../../components/GuideBody";
import { colors } from "../../theme/colors";
import { useTheme } from "../../theme/ThemeContext";
import { dialTargets, NATIONAL_EMERGENCY_PHONE } from "../../lib/stationTypes";
import { badgeText, effectiveState } from "../../lib/safetyContent";
import { useSafetyContent } from "../../hooks/useSafetyContent";
import { useNearestStation } from "../../hooks/useNearestStation";
import { SUBCATEGORY_META } from "./GuidesHubScreen";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { GuidesStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<GuidesStackParamList, "GuideDetail">;

export const GuideDetailScreen = ({ navigation, route }: Props) => {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();

  const items = useSafetyContent();
  const item = items.find((i) => i.slug === route.params.guideId);
  const state = item ? effectiveState(item) : "pending";
  const isReviewed = state === "reviewed";
  const isFirstAid = item?.category === "first_aid";

  /**
   * The same resolution every other screen calls from — one provider mounted
   * in App.tsx — so this footer can never name a different number than the
   * home screen's call button at the same moment.
   *
   * Hooks run before the not-found return below, which is why this sits up
   * here rather than beside the footer that uses it.
   */
  const { nearest } = useNearestStation();

  /**
   * Was: a literal 192 on both the copy and the button. 192 is the only
   * number that connects with no credit, but it is a single national line,
   * and when a station has resolved there is a closer, smaller queue on
   * record — the same chain the home screen dials, in the same order. See
   * dialTargets: 192 never leaves the chain, so the free number is still one
   * tap away in the pill beside the button, and the chain is never empty, so
   * the button is never dead.
   */
  const targets = nearest
    ? dialTargets(nearest)
    : [{ phone: NATIONAL_EMERGENCY_PHONE, tollFree: true }];
  const primary = targets[0];

  /**
   * Shown only when the primary is chargeable — that is the case where a
   * caller with no airtime taps the button and nothing happens, and this is
   * the number that still works for them. When 192 is already the primary
   * there is nothing to fall back to and the pill would just print the same
   * digits twice.
   *
   * Derived from tollFree rather than array position, matching how the home
   * and station screens derive their own cost labels.
   */
  const freeFallback = primary.tollFree
    ? null
    : (targets.find((t) => t.tollFree)?.phone ?? null);

  /**
   * Not "direct line to your station". Every station in a region shares one
   * set of numbers (all 15 Greater Accra stations dial 0302666576), so what
   * answers is a regional command centre that does not know where the caller
   * is — which is exactly why the caller has to say.
   */
  const primaryCaption = primary.tollFree
    ? "Free on any network"
    : "Direct line to your station";

  const dial = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch((err) =>
      console.warn("[GuideDetail] dial failed", err),
    );
  };

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

  /**
   * Category and subcategory as text, above the title.
   *
   * This used to be a full-bleed colour band, one hue per subcategory, with
   * the title reversed out in white. Nine guides meant nine differently
   * coloured screens for content of identical weight, so the colour read as a
   * severity signal it was never assigning — and the band was the reason the
   * title had to fit on one line beside a badge, which is how "Electrical
   * Fire Safety" came to render as "Electrical Fire S..". Saying the same two
   * facts in a line of small caps costs no colour and no truncation.
   */
  const subLabel = SUBCATEGORY_META[item.subcategory]?.label;
  const kicker = [isFirstAid ? "FIRST AID" : "HAZARD", subLabel?.toUpperCase()]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header — the same on every guide, whatever its category */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: theme.background,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeftIcon size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <Text
            variant="label"
            color={theme.textTertiary}
            style={styles.kicker}
            numberOfLines={1}
          >
            {kicker}
          </Text>
        </View>
        {/* Two lines, because the title no longer shares a row with anything */}
        <Text variant="heading2" style={styles.headerTitle} numberOfLines={2}>
          {item.title}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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
            color={
              isReviewed ? (isDark ? "#FDE68A" : "#92400E") : theme.textTertiary
            }
          />
          <Text
            variant="label"
            color={
              isReviewed ? (isDark ? "#FDE68A" : "#92400E") : theme.textTertiary
            }
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
              General first aid guidance. Not a substitute for professional
              medical care.
            </Text>
          </View>
        )}

        {/*
          Rendered for both categories. This screen used to branch
          `isFirstAid ? steps : body`, which meant every first-aid guide's
          body — "This is first aid only, for while you wait for help. Work
          through the steps in order." — was authored, validated, cached and
          clinically reviewed, and then silently dropped on the floor.
        */}
        <GuideBody body={item.body} />

        {isFirstAid && (
          <View style={styles.steps}>
            {item.steps.map((step, index) => (
              <View
                key={index}
                style={[
                  styles.stepCard,
                  {
                    backgroundColor: theme.background,
                    borderColor: theme.border,
                  },
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
        )}
      </ScrollView>

      {/*
        Emergency footer.

        Was a red-tinted block holding a red button, with the number spelled
        out a second time in three lines of wrapped prose beside it. The tint
        and the button were close enough in hue that the one thing to tap did
        not stand out from the thing it sat on, and the prose spent its width
        repeating the digits already printed on the button.

        Now: a plain surface with a hairline rule, so the red is the button
        and nothing else, and the sentence is cut to the label above it. What
        was said in prose ("free on any network") is said by the pill that
        dials it.
      */}
      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + 12,
            backgroundColor: theme.background,
            borderTopColor: theme.border,
          },
        ]}
      >
        <View style={styles.footerLabelRow}>
          <WarningCircleIcon
            size={14}
            color={colors.brandPrimary}
            weight="fill"
          />
          <Text
            variant="label"
            color={theme.textSecondary}
            style={styles.footerLabel}
          >
            IN AN ACTIVE EMERGENCY
          </Text>
        </View>

        <View style={styles.footerActions}>
          <TouchableOpacity
            style={styles.callButton}
            activeOpacity={0.85}
            onPress={() => dial(primary.phone)}
            accessibilityRole="button"
            accessibilityLabel={
              primary.tollFree
                ? `Call ${primary.phone}, free on any network`
                : `Call ${primary.phone}, regional command line`
            }
          >
            <PhoneIcon size={20} color="#FFFFFF" weight="fill" />
            <View style={styles.callButtonText}>
              {/*
                One line, and never an ellipsis through the digits: a
                half-printed phone number is worse than no number at all.
                `adjustsFontSizeToFit` shrinks it instead, which only bites
                on a 320pt handset at a large accessibility text size.
              */}
              <Text
                variant="bodyMedium"
                weight="bold"
                color="#FFFFFF"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                Call {primary.phone}
              </Text>
              <Text
                variant="label"
                color="rgba(255,255,255,0.85)"
                numberOfLines={1}
              >
                {primaryCaption}
              </Text>
            </View>
          </TouchableOpacity>

          {freeFallback && (
            <TouchableOpacity
              style={[
                styles.freeButton,
                { borderColor: theme.emergencyBorder },
              ]}
              activeOpacity={0.7}
              onPress={() => dial(freeFallback)}
              accessibilityRole="button"
              accessibilityLabel={`Call ${freeFallback}, works with no credit`}
            >
              <Text
                variant="bodyMedium"
                weight="bold"
                color={colors.brandPrimary}
              >
                {freeFallback}
              </Text>
              <Text variant="label" color={theme.textTertiary}>
                Free
              </Text>
            </TouchableOpacity>
          )}
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
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    marginLeft: -4,
    padding: 4,
  },
  kicker: {
    flex: 1,
    letterSpacing: 0.8,
  },
  headerTitle: {
    // Clears the back button's 4px of padding so the title's left edge lines
    // up with the arrow glyph rather than with its touch target.
    marginLeft: 4,
  },
  scrollContent: {
    padding: 16,
    gap: 20,
    paddingBottom: 32,
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
    gap: 10,
  },
  footerLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerLabel: {
    letterSpacing: 0.8,
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  callButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 56,
    // 16, not 18: on a 320pt screen this button shares the row with the 192
    // pill, and the longest number in the bundled table ("0302666576") plus
    // its icon has to fit between these two edges.
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.brandPrimary,
    shadowColor: colors.brandPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  callButtonText: {
    flexShrink: 1,
  },
  /**
   * Quiet, but a real target: 192 is the number a caller with no airtime
   * needs, and they are reaching for it after the primary has already failed
   * to connect. Same height as the button beside it.
   */
  freeButton: {
    minWidth: 72,
    minHeight: 56,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
