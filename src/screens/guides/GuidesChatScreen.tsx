import React, { useState, useRef, useEffect } from "react";
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
} from "phosphor-react-native";
import { Text } from "../../components/ui/Text";
import { colors } from "../../theme/colors";
import { useTheme } from "../../theme/ThemeContext";
import { typography } from "../../theme/typography";
import { NATIONAL_EMERGENCY_PHONE } from "../../lib/stationTypes";
import { askAI, askFailureMessage, MAX_QUESTION_CHARACTERS } from "../../lib/aiApi";
import type { AIResponse } from "../../lib/aiApi";
import { AIResponseContent } from "../../components/AIResponseContent";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { GuidesStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<GuidesStackParamList, "GuidesChat">;

// Narrowed to what the app actually produces. "steps" / "fact" / "emergency" /
// "outOfScope" only ever came from the deleted hardcoded mock answers —
// askAI returns plain text, and the offline fallback is a "warning" card.
type MessageType = "text" | "warning";

interface Message {
  id: string;
  role: "user" | "assistant";
  type: MessageType;
  content: string;
  // The structured answer, when one came back from askAI. Its presence is
  // what switches rendering from the plain bubble to a per-kind card.
  payload?: AIResponse;
  // True only for messages that genuinely came back from askAI. Gates the
  // "AI-generated" label and disclaimer block — the static welcome message
  // and the client-side offline fallback are not model output and must not
  // claim to be.
  fromAI?: boolean;
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

  // Guards the post-await state updates in handleSend. Navigating away while
  // a request is in flight must not setState on an unmounted screen — the
  // race is new since handleSend became async.
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const callEmergency = () => {
    Linking.openURL(`tel:${NATIONAL_EMERGENCY_PHONE}`).catch((err) =>
      console.warn("[GuidesChat] dial failed", err)
    );
  };

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
      // Send the conversation so far, so a follow-up ("what if it blisters?")
      // carries the context a bare question would lack. Only real exchanges
      // count: the static welcome and the offline fallback are not model
      // output, so they are not model memory either. `messages` here is the
      // state before this send, so the new question is not double-counted —
      // it goes as `question`, not in history.
      const history = messages
        .filter((m) => m.role === "user" || m.fromAI)
        .map((m) => ({ role: m.role, content: m.content }));
      const payload = await askAI(messageText, undefined, history);
      if (!isMountedRef.current) return;
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now() + 1}`,
          role: "assistant",
          type: "text",
          // content stays the flattened prose for accessibility and any
          // consumer that only reads text; payload drives the rendering.
          content: payload.answer || payload.body,
          payload,
          fromAI: true,
        },
      ]);
    } catch (err) {
      if (!isMountedRef.current) return;
      console.warn("[GuidesChat] ask failed", err);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now() + 1}`,
          role: "assistant",
          type: "warning",
          content: askFailureMessage(err),
        },
      ]);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    }
  };

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

  // "Typing dots" per the UI spec — the last row while a request is in
  // flight, so the screen never looks dead while the user is waiting on a
  // network call they may be relying on during or right after an emergency.
  const renderTypingIndicator = () => (
    <View style={[styles.messageBubble, styles.aiBubble]} testID="guidesChatTypingIndicator">
      <View style={styles.aiAvatar}>
        <BrainIcon size={16} color={colors.brandPrimary} weight="fill" />
      </View>
      <View
        style={[
          styles.bubbleContent,
          styles.aiContent,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={styles.typingDots}>
          <View style={[styles.typingDot, { backgroundColor: theme.textTertiary }]} />
          <View style={[styles.typingDot, { backgroundColor: theme.textTertiary }]} />
          <View style={[styles.typingDot, { backgroundColor: theme.textTertiary }]} />
        </View>
      </View>
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
          {item.payload ? (
            // A structured answer renders as the component its kind calls for.
            <AIResponseContent payload={item.payload} />
          ) : (
            <>
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

              {item.type === "warning" && renderWarningCard(item.content)}
            </>
          )}

          {item.fromAI && (
            <View style={styles.aiDisclaimer}>
              <Text variant="label" color={theme.textTertiary}>
                AI-generated · Not medical advice
              </Text>
              <Text
                variant="label"
                color={theme.textTertiary}
                style={{ marginTop: 2, lineHeight: 15 }}
              >
                This is general guidance only. In an active emergency, call your nearest fire station immediately.
              </Text>
              <TouchableOpacity style={styles.callShortcut} onPress={callEmergency}>
                <PhoneIcon size={12} color={colors.brandPrimary} weight="fill" />
                <Text variant="label" weight="bold" color={colors.brandPrimary}>
                  Call {NATIONAL_EMERGENCY_PHONE}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Not real AI output, so it does not get the AI-generated label —
              but this is exactly the moment someone may need to call for
              help, so the shortcut stays on its own. */}
          {!item.fromAI && item.type === "warning" && (
            <View style={styles.aiDisclaimer}>
              <TouchableOpacity style={styles.callShortcut} onPress={callEmergency}>
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
            <>
              {isLoading && renderTypingIndicator()}
              {showSuggestions && !isLoading ? (
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
              ) : null}
            </>
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
            testID="guidesChatInput"
            style={[styles.textInput, { backgroundColor: theme.surface, color: theme.textPrimary }]}
            placeholder="Ask a fire safety question..."
            placeholderTextColor={theme.textTertiary}
            value={input}
            onChangeText={setInput}
            maxLength={MAX_QUESTION_CHARACTERS}
            onSubmitEditing={() => handleSend()}
            returnKeyType="send"
          />
          <TouchableOpacity
            testID="guidesChatSendButton"
            style={[
              styles.sendButton,
              (!input.trim() || isLoading) && { backgroundColor: theme.surface },
            ]}
            onPress={() => handleSend()}
            disabled={!input.trim() || isLoading}
          >
            <PaperPlaneRightIcon
              size={20}
              color={input.trim() && !isLoading ? "#FFFFFF" : theme.textTertiary}
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
  typingDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
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
