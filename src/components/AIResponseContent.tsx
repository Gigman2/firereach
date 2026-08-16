import React from "react";
import { View, StyleSheet, TouchableOpacity, Linking } from "react-native";
import { PhoneIcon, WarningIcon, InfoIcon } from "phosphor-react-native";
import { Text } from "./ui/Text";
import { colors } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { NATIONAL_EMERGENCY_PHONE } from "../lib/stationTypes";
import type { AIResponse, AIStep } from "../lib/aiApi";

/**
 * Renders a structured AI answer as the component its kind calls for. The
 * model supplies structure and prose only; every phone number and call
 * control below dials NATIONAL_EMERGENCY_PHONE, never model text — a
 * hallucinated digit must not be able to reach a dial control.
 *
 * Anything unrecognised degrades to the plain body bubble, the same
 * fail-safe the guide-body parser uses for unvalidated content.
 */

const callEmergency = () => {
  Linking.openURL(`tel:${NATIONAL_EMERGENCY_PHONE}`).catch((err) =>
    console.warn("[AIResponse] dial failed", err)
  );
};

/** The prominent red call control shared by the emergency cards. */
export function CallNowButton({ label }: { label: string }) {
  return (
    <TouchableOpacity
      style={styles.callButton}
      onPress={callEmergency}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <PhoneIcon size={18} color="#FFFFFF" weight="fill" />
      <Text variant="bodyMedium" weight="bold" color="#FFFFFF">
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function BulletList({ items }: { items: AIStep[] }) {
  const { theme } = useTheme();
  return (
    <View style={styles.bulletList}>
      {items.map((it, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text variant="caption" color={theme.textPrimary}>
            {"\u2022"}
          </Text>
          <Text
            variant="caption"
            color={theme.textPrimary}
            style={styles.bulletText}
          >
            {it.body}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The plain prose bubble — the default, and the lead for the card kinds.
 * `items` renders as bullets inside the bubble (the warning answer in the
 * mockups reads lead-then-bullets as one bubble).
 */
function BodyBubble({ text, items }: { text: string; items?: AIStep[] }) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.bubble,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <Text variant="bodyMedium" color={theme.textPrimary}>
        {text}
      </Text>
      {items && items.length > 0 ? (
        <View style={styles.bubbleBullets}>
          <BulletList items={items} />
        </View>
      ) : null}
    </View>
  );
}

/** Active emergency: red-bordered card with heading, lead, bullets, call. */
export function EmergencyCard({ payload }: { payload: AIResponse }) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.emergencyCard,
        {
          backgroundColor: theme.emergencyBg,
          borderColor: theme.emergencyBorder,
        },
      ]}
    >
      <View style={styles.emergencyHeader}>
        <View style={styles.emergencyDot} />
        <Text
          variant="caption"
          weight="bold"
          color={theme.emergencyText}
          style={styles.emergencyTitle}
        >
          {payload.title || "ACTIVE EMERGENCY"}
        </Text>
      </View>
      <Text variant="bodyMedium" weight="semiBold" color={theme.textPrimary}>
        {payload.body}
      </Text>
      {payload.items && payload.items.length > 0 ? (
        <BulletList items={payload.items} />
      ) : null}
      <CallNowButton label={`Call ${NATIONAL_EMERGENCY_PHONE} Now`} />
    </View>
  );
}

/** "What is the emergency number": label, the number large, call control. */
export function EmergencyNumberCard({ payload }: { payload: AIResponse }) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.numberCard,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={styles.numberHeader}>
        <InfoIcon size={14} color={theme.textSecondary} />
        <Text variant="caption" color={theme.textSecondary}>
          {payload.title || "Fire Emergency Number"}
        </Text>
      </View>
      <Text
        variant="displayBold"
        color={colors.brandPrimary}
        style={styles.bigNumber}
      >
        {NATIONAL_EMERGENCY_PHONE}
      </Text>
      <CallNowButton label={`Call ${NATIONAL_EMERGENCY_PHONE}`} />
    </View>
  );
}

/** How-to / first aid: a numbered card per step. */
export function StepsCard({ payload }: { payload: AIResponse }) {
  const { theme } = useTheme();
  if (!payload.items || payload.items.length === 0) return null;
  return (
    <View style={styles.stepsList}>
      {payload.items.map((step, i) => (
        <View
          key={i}
          style={[
            styles.stepCard,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View style={styles.stepNumber}>
            <Text variant="caption" weight="bold" color="#FFFFFF">
              {i + 1}
            </Text>
          </View>
          <View style={styles.stepText}>
            {step.title ? (
              <Text variant="bodyMedium" weight="bold" color={theme.textPrimary}>
                {step.title}
              </Text>
            ) : null}
            <Text variant="caption" color={theme.textSecondary}>
              {step.body}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Amber safety-warning callout for an answer that carries a hazard caveat. */
export function SafetyWarningCard({ text }: { text: string }) {
  const { theme, isDark } = useTheme();
  const accent = isDark ? "#FBBF24" : "#B45309";
  return (
    <View
      style={[
        styles.warningCard,
        { backgroundColor: theme.warningBg, borderColor: theme.warningBorder },
      ]}
    >
      <View style={styles.warningHeader}>
        <WarningIcon size={18} color={accent} weight="fill" />
        <Text variant="caption" weight="bold" color={accent}>
          Safety Warning
        </Text>
      </View>
      <Text variant="caption" color={theme.warningText}>
        {text}
      </Text>
    </View>
  );
}

/**
 * The full structured answer: the lead bubble plus whichever card the kind
 * calls for. Emergency is self-contained (its lead lives inside the card);
 * the others render the body bubble first and the card below it.
 */
export function AIResponseContent({ payload }: { payload: AIResponse }) {
  let content: React.ReactNode;
  switch (payload.kind) {
    case "emergency":
      content = <EmergencyCard payload={payload} />;
      break;
    case "emergency_number":
      content = (
        <>
          <BodyBubble text={payload.body} />
          <EmergencyNumberCard payload={payload} />
        </>
      );
      break;
    case "steps":
      content = (
        <>
          <BodyBubble text={payload.body} />
          <StepsCard payload={payload} />
        </>
      );
      break;
    case "warning":
      content = (
        <>
          <BodyBubble text={payload.body} items={payload.items} />
          {payload.warning ? <SafetyWarningCard text={payload.warning} /> : null}
        </>
      );
      break;
    case "text":
    case "out_of_scope":
    default:
      // Unknown and unrecognised kinds degrade to the plain body bubble,
      // still rendering any list the model included so nothing is dropped.
      content = (
        <BodyBubble text={payload.body || payload.answer} items={payload.items} />
      );
      break;
  }
  return <View style={styles.responseColumn}>{content}</View>;
}

const styles = StyleSheet.create({
  responseColumn: {
    gap: 10,
  },
  bubble: {
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    padding: 14,
  },
  bubbleBullets: {
    marginTop: 8,
  },
  callButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.brandPrimary,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
  },
  emergencyCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  emergencyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  emergencyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brandPrimary,
  },
  emergencyTitle: {
    letterSpacing: 1,
  },
  bulletList: {
    gap: 8,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  bulletText: {
    flex: 1,
    flexShrink: 1,
  },
  numberCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  numberHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  bigNumber: {
    textAlign: "center",
    letterSpacing: 2,
  },
  stepsList: {
    gap: 10,
  },
  stepCard: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    alignItems: "flex-start",
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  stepText: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
  },
  warningCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  warningHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});
