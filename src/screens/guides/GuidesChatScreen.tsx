import React, { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeftIcon,
  PaperPlaneRightIcon,
  BrainIcon,
  WarningIcon,
  PhoneIcon,
  InfoIcon,
  ProhibitIcon,
} from "phosphor-react-native";
import { Text } from "../../components/ui/Text";
import { colors } from "../../theme/colors";
import { useTheme } from "../../theme/ThemeContext";
import { typography } from "../../theme/typography";
import { NATIONAL_EMERGENCY_PHONE } from "../../lib/stationTypes";
import { askAI } from "../../lib/aiApi";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { GuidesStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<GuidesStackParamList, "GuidesChat">;

type MessageType = "text" | "steps" | "warning" | "fact" | "emergency" | "outOfScope";

interface Step {
  title: string;
  body: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  type: MessageType;
  content: string;
  steps?: Step[];
  factLabel?: string;
  factValue?: string;
}

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  type: "text",
  content:
    "Hi! I'm your FireReach safety assistant. Ask me anything about fire prevention, first aid for burns, evacuation procedures, or how to use a fire extinguisher.",
};

const SUGGESTED_QUESTIONS = [
  "How do I treat a minor burn?",
  "Can I use water on an electrical fire?",
  "What's the emergency number in Ghana?",
  "My house is on fire!",
];

export const GuidesChatScreen = ({ navigation }: Props) => {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const handleSend = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      type: "text",
      content: messageText,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const answer = await askAI(messageText);
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now() + 1}`, role: "assistant", type: "text", content: answer },
      ]);
    } catch (err) {
      console.warn("[GuidesChat] ask failed", err);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now() + 1}`,
          role: "assistant",
          type: "warning",
          content:
            "I couldn't reach the safety assistant. The written guides work offline — go back and open any topic.",
        },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const renderSteps = (steps: Step[]) => (
    <View style={rs.stepsContainer}>
      {steps.map((step, i) => (
        <View
          key={i}
          style={[rs.stepRow, { backgroundColor: theme.background, borderColor: theme.border }]}
        >
          <View style={rs.stepBadge}>
            <Text variant="label" color="#FFFFFF">
              {i + 1}
            </Text>
          </View>
          <View style={rs.stepContent}>
            <Text variant="caption" weight="bold">
              {step.title}
            </Text>
            <Text
              variant="caption"
              color={theme.textSecondary}
              style={{ marginTop: 2 }}
            >
              {step.body}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );

  const renderWarningCard = (content: string) => (
    <View
      style={[
        rs.warningCard,
        { backgroundColor: theme.warningBg, borderColor: theme.warningBorder },
      ]}
    >
      <View style={rs.warningHeader}>
        <WarningIcon size={18} color={isDark ? "#FBBF24" : "#B45309"} weight="fill" />
        <Text variant="caption" weight="bold" color={isDark ? "#FBBF24" : "#B45309"}>
          Safety Warning
        </Text>
      </View>
      <Text variant="caption" color={theme.warningText}>
        {content}
      </Text>
    </View>
  );

  const renderFactCard = (label: string, value: string) => (
    <View style={[rs.factCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <View style={rs.factHeader}>
        <InfoIcon size={16} color={colors.brandPrimary} weight="fill" />
        <Text variant="label" color={theme.textTertiary}>
          {label}
        </Text>
      </View>
      <Text variant="displayBold" color={colors.brandPrimary}>
        {value}
      </Text>
      <TouchableOpacity
        style={rs.factCallButton}
        onPress={() => Linking.openURL(`tel:${value}`)}
      >
        <PhoneIcon size={16} color="#FFFFFF" weight="fill" />
        <Text variant="caption" weight="bold" color="#FFFFFF">
          Call {value}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderEmergencyCard = (content: string) => (
    <View style={[rs.emergencyCard, { backgroundColor: theme.emergencyBg }]}>
      <View style={rs.emergencyHeader}>
        <View style={rs.emergencyPulse} />
        <Text variant="caption" weight="bold" color={isDark ? "#FCA5A5" : "#991B1B"}>
          ACTIVE EMERGENCY
        </Text>
      </View>
      <Text variant="caption" color={theme.emergencyText}>
        {content}
      </Text>
      <TouchableOpacity
        style={rs.emergencyCallButton}
        onPress={() =>
          Linking.openURL(`tel:${NATIONAL_EMERGENCY_PHONE}`).catch((err) =>
            console.warn("[GuidesChat] dial failed", err)
          )
        }
      >
        <PhoneIcon size={18} color="#FFFFFF" weight="fill" />
        <Text variant="bodyMedium" weight="bold" color="#FFFFFF">
          Call 192 Now
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderOutOfScopeCard = (content: string) => (
    <View style={[rs.outOfScopeCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={rs.outOfScopeHeader}>
        <ProhibitIcon size={18} color={theme.textTertiary} weight="fill" />
        <Text variant="caption" weight="bold" color={theme.textSecondary}>
          Outside My Expertise
        </Text>
      </View>
      <Text variant="caption" color={theme.textSecondary}>
        {content}
      </Text>
    </View>
  );

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";

    if (isUser) {
      return (
        <View style={[styles.messageBubble, styles.userBubble]}>
          <View style={[styles.bubbleContent, styles.userContent]}>
            <Text variant="bodyMedium" color="#FFFFFF">
              {item.content}
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.messageBubble, styles.aiBubble]}>
        <View style={styles.aiAvatar}>
          <BrainIcon size={16} color={colors.brandPrimary} weight="fill" />
        </View>
        <View style={styles.aiColumn}>
          {/* Text intro (always shown) */}
          {item.type !== "emergency" && item.type !== "outOfScope" && (
            <View
              style={[
                styles.bubbleContent,
                styles.aiContent,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <Text variant="bodyMedium" color={theme.textPrimary}>
                {item.content}
              </Text>
            </View>
          )}

          {/* Rich content */}
          {item.type === "steps" && item.steps && renderSteps(item.steps)}
          {item.type === "warning" && renderWarningCard(item.content)}
          {item.type === "fact" &&
            item.factLabel &&
            item.factValue &&
            renderFactCard(item.factLabel, item.factValue)}
          {item.type === "emergency" && renderEmergencyCard(item.content)}
          {item.type === "outOfScope" && renderOutOfScopeCard(item.content)}

          {item.role === "assistant" && (
            <View style={styles.aiDisclaimer}>
              <Text variant="label" color={theme.textTertiary}>
                AI-generated · Not medical advice
              </Text>
              <Text variant="label" color={theme.textTertiary} style={{ marginTop: 2, lineHeight: 15 }}>
                This is general guidance only. In an active emergency, call your nearest fire station immediately.
              </Text>
              <TouchableOpacity
                style={styles.callShortcut}
                onPress={() =>
                  Linking.openURL(`tel:${NATIONAL_EMERGENCY_PHONE}`).catch((err) =>
                    console.warn("[GuidesChat] dial failed", err)
                  )
                }
              >
                <PhoneIcon size={12} color={colors.brandPrimary} weight="fill" />
                <Text variant="label" weight="bold" color={colors.brandPrimary}>
                  Call {NATIONAL_EMERGENCY_PHONE}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  const showSuggestions = messages.length <= 1;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            borderBottomColor: theme.border,
            backgroundColor: theme.background,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeftIcon size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <BrainIcon size={20} color={colors.brandPrimary} weight="fill" />
          <Text variant="bodyLarge" weight="bold">
            Safety Q&A
          </Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        // Android gets "padding" too. The usual `: undefined` there defers to
        // the manifest's `adjustResize`, which stopped resizing the window
        // once this app went edge-to-edge — so the composer sat behind the
        // keyboard with no way to see what you were typing.
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            showSuggestions ? (
              <View style={styles.suggestions}>
                <Text
                  variant="label"
                  color={theme.textTertiary}
                  style={styles.suggestionsLabel}
                >
                  TRY ASKING
                </Text>
                {SUGGESTED_QUESTIONS.map((q) => (
                  <TouchableOpacity
                    key={q}
                    style={styles.suggestionChip}
                    onPress={() => handleSend(q)}
                  >
                    <Text variant="caption" color={colors.brandPrimary}>
                      {q}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null
          }
        />

        <View
          style={[
            styles.inputBar,
            {
              paddingBottom: insets.bottom + 8,
              borderTopColor: theme.border,
              backgroundColor: theme.background,
            },
          ]}
        >
          <TextInput
            style={[styles.textInput, { backgroundColor: theme.surface, color: theme.textPrimary }]}
            placeholder="Ask a fire safety question..."
            placeholderTextColor={theme.textTertiary}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => handleSend()}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              !input.trim() && { backgroundColor: theme.surface },
            ]}
            onPress={() => handleSend()}
            disabled={!input.trim()}
          >
            <PaperPlaneRightIcon
              size={20}
              color={input.trim() ? "#FFFFFF" : theme.textTertiary}
              weight="fill"
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

// Rich response styles
const rs = StyleSheet.create({
  stepsContainer: {
    gap: 8,
    marginTop: 8,
  },
  stepRow: {
    flexDirection: "row",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepContent: {
    flex: 1,
  },
  warningCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    marginTop: 8,
  },
  warningHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  factCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  factHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  factCallButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  emergencyCard: {
    borderWidth: 2,
    borderColor: colors.brandPrimary,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  emergencyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  emergencyPulse: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brandPrimary,
  },
  outOfScopeCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    marginTop: 8,
    borderStyle: "dashed" as const,
  },
  outOfScopeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  emergencyCallButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.brandPrimary,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: colors.brandPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  messageList: {
    padding: 16,
    gap: 16,
    paddingBottom: 8,
  },
  messageBubble: {
    flexDirection: "row",
    gap: 10,
  },
  userBubble: {
    justifyContent: "flex-end",
  },
  aiBubble: {
    justifyContent: "flex-start",
  },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${colors.brandPrimary}15`,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  aiColumn: {
    flex: 1,
    maxWidth: "85%",
  },
  bubbleContent: {
    borderRadius: 16,
    padding: 14,
  },
  userContent: {
    maxWidth: "80%",
    backgroundColor: colors.brandPrimary,
    borderBottomRightRadius: 4,
  },
  aiContent: {
    borderWidth: 1,
    borderBottomLeftRadius: 4,
  },
  aiDisclaimer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(128,128,128,0.2)",
  },
  callShortcut: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  suggestions: {
    gap: 8,
    marginTop: 8,
    paddingLeft: 42,
  },
  suggestionsLabel: {
    letterSpacing: 1,
    marginBottom: 4,
  },
  suggestionChip: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: `${colors.brandPrimary}40`,
    backgroundColor: `${colors.brandPrimary}08`,
    borderRadius: 100,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  textInput: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    paddingHorizontal: 20,
    fontSize: 16,
    // TextInput does not go through the styled Text component.
    fontFamily: typography.fonts.regular,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
});
