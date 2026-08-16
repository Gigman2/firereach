import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "./ui/Text";
import { useTheme } from "../theme/ThemeContext";
import { parseGuideBody } from "../lib/guideBody";

type Props = { body: string };

/**
 * A guide's prose, set as structure rather than as one block of text.
 *
 * Everything about how a block looks lives here; everything about what a
 * block *is* lives in parseGuideBody. GuideDetailScreen knows neither, and
 * no longer pours the whole body string into a single <Text>.
 */
export const GuideBody = ({ body }: Props) => {
  const { theme } = useTheme();
  const blocks = useMemo(() => parseGuideBody(body), [body]);

  return (
    <View>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "lead":
            return (
              <Text key={index} variant="bodyLarge" style={styles.lead}>
                {block.text}
              </Text>
            );

          case "paragraph":
            return (
              <Text
                key={index}
                variant="bodyMedium"
                color={theme.textSecondary}
                style={[
                  styles.paragraph,
                  // Prose after a list is a change of subject in every guide
                  // that has it — carbon monoxide, extinguisher caveats,
                  // scope disclaimers — so it gets more air than prose
                  // following prose.
                  blocks[index - 1]?.kind === "bullet" && styles.paragraphAfterList,
                ]}
              >
                {block.text}
              </Text>
            );

          case "heading":
            return (
              <View key={index} style={[styles.heading, index === 0 && styles.headingFirst]}>
                <Text
                  variant="caption"
                  weight="bold"
                  color={block.crisis ? theme.emergencyText : theme.textPrimary}
                  style={styles.headingText}
                >
                  {/*
                    Uppercased here, not in the content: the source text has to
                    stay readable to the clinician reviewing it and in the
                    review packet built from the same strings.
                  */}
                  {block.text.toUpperCase()}
                </Text>
                <View
                  style={[
                    styles.headingRule,
                    {
                      backgroundColor: block.crisis ? theme.emergencyBorder : theme.border,
                    },
                  ]}
                />
              </View>
            );

          case "bullet":
            return (
              <View key={index} style={styles.bullet}>
                {/*
                  A real glyph in its own column. The old rendering printed the
                  source's literal "- " inline, so the second line of a
                  174-character bullet resumed under the dash instead of under
                  the text and there was no left edge to follow.
                */}
                <Text
                  variant="bodyMedium"
                  color={block.crisis ? theme.emergencyText : theme.textTertiary}
                  style={styles.bulletGlyph}
                >
                  •
                </Text>
                <Text variant="bodyMedium" color={theme.textSecondary} style={styles.bulletText}>
                  {block.text}
                </Text>
              </View>
            );
        }
      })}
    </View>
  );
};

/**
 * Spacing is expressed as top margins only, never as a matching pair of
 * bottom margins, so two adjacent blocks can never stack two gaps into one
 * oversized void.
 */
const styles = StyleSheet.create({
  lead: {
    lineHeight: 28,
  },
  paragraph: {
    lineHeight: 24,
    marginTop: 16,
  },
  paragraphAfterList: {
    marginTop: 24,
  },
  heading: {
    marginTop: 28,
    marginBottom: 12,
  },
  /** Nothing above it to separate from. */
  headingFirst: {
    marginTop: 0,
  },
  headingText: {
    letterSpacing: 0.8,
  },
  headingRule: {
    height: StyleSheet.hairlineWidth,
    marginTop: 8,
  },
  bullet: {
    flexDirection: "row",
    marginTop: 10,
  },
  /**
   * Fixed width, and the same lineHeight as the text beside it so the glyph
   * sits on the first line's baseline rather than floating above it.
   */
  bulletGlyph: {
    width: 18,
    lineHeight: 24,
  },
  bulletText: {
    flex: 1,
    lineHeight: 24,
  },
});
