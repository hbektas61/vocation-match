import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Body,
  Button,
  Card,
  ConfirmDialog,
  Field,
  Gap,
  Heading,
  Notice,
  Screen,
  SectionLabel,
  Title,
} from '../components/ui';
import { nowMs } from '../clock';
import { apiErrorMessage, COPY, COPY_FOR, reportReasonLabel } from '../copy';
import { ApiError, getApi, type ReportReason } from '../data';
import type { RootScreenProps } from '../navigation/types';
import { useAppStore } from '../state/AppStore';
import { color, font, fontFamily, leading, MIN_TOUCH, radius, spacing } from '../theme';

const REPORT_REASONS: ReportReason[] = [
  'HARASSMENT',
  'SPAM',
  'FAKE_PROFILE',
  'UNDERAGE',
  'SAFETY',
  'OTHER',
];

/** The radio's outer ring and the dot inside it (176:4591). */
const RADIO = 24;
const RADIO_DOT = 12;

/**
 * One reason, as the contract draws it (176:4588): a floating white row with
 * the reason on the left and a radio on the right.
 *
 * It replaces a stack of six `Button`s, which was wrong in a way that mattered:
 * six buttons say "six things you can do", and the selected one turned solid
 * coral — the same fill the screen's actual submit wears. A radio says "one of
 * these", which is what a report reason is, and it carries the choice in the
 * ring, the fill, the label's weight and `accessibilityState` rather than in a
 * colour alone.
 */
function ReasonRow({
  label,
  selected,
  disabled,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.reason,
        selected && styles.reasonSelected,
        disabled && styles.reasonDisabled,
        pressed && !disabled && styles.reasonPressed,
      ]}
      testID={testID}
    >
      <Text style={[styles.reasonLabel, selected && styles.reasonLabelSelected]}>{label}</Text>
      <View
        style={[styles.radio, selected && styles.radioOn]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
    </Pressable>
  );
}

export function ReportBlockScreen({ navigation, route }: RootScreenProps<'ReportBlock'>) {
  const { dispatch } = useAppStore();
  const name = route.params.displayName ?? COPY.safety.someone;
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);

  const noteBlocked = () => {
    dispatch({
      type: 'USER_BLOCKED',
      blockedUser: { userId: route.params.userId, displayName: name, blockedAt: nowMs() },
    });
  };

  const report = async () => {
    if (!reason || reporting) return;
    setReporting(true);
    setReportError(null);
    try {
      await getApi().reportUser({
        userId: route.params.userId,
        reason,
        details: details.trim() || undefined,
      });
      // The server blocks by default when reporting (D-008).
      noteBlocked();
      setReported(true);
      setDetails('');
      setReason(null);
    } catch (err) {
      setReportError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
    } finally {
      setReporting(false);
    }
  };

  const block = async () => {
    if (blocking) return;
    setBlocking(true);
    setBlockError(null);
    try {
      await getApi().blockUser(route.params.userId);
      noteBlocked();
      navigation.popToTop();
    } catch (err) {
      setBlockError(err instanceof ApiError ? apiErrorMessage(err.code) : COPY.errors.unknown);
      setBlocking(false);
      setConfirmingBlock(false);
    }
  };

  return (
    /* The stack header already carries "Güvenlik" and the way back, which is
       what the contract's header row is (176:4621). A `Title` under it printed
       the word twice — and the one this replaces was the English literal
       "Safety" sitting above a Turkish header. */
    <Screen testID="screen-report-block">
      {/* The question first (176:4584), then what answering it does. */}
      <Title>{COPY_FOR.reportHeading(name)}</Title>
      <Body>{COPY.safety.reportReasonLabel}</Body>

      <View style={styles.reasons} accessibilityRole="radiogroup">
        {REPORT_REASONS.map((candidate) => (
          <ReasonRow
            key={candidate}
            label={reportReasonLabel(candidate)}
            selected={reason === candidate}
            disabled={reporting}
            onPress={() => setReason(candidate)}
            testID={`report-reason-${candidate}`}
          />
        ))}
      </View>

      <SectionLabel>{COPY.safety.reportDetailsLabel}</SectionLabel>
      <Field
        label={COPY.safety.reportDetailsLabel}
        hideLabel
        value={details}
        onChangeText={setDetails}
        placeholder={COPY.safety.reportDetailsPlaceholder}
        multiline
        editable={!reporting}
        testID="report-details"
      />

      {/* 176:4611 draws a brand-wash panel here saying who reads a report.
          `Notice`'s info tone *is* that panel. The sentence is the one the app
          already made — the drawing's own line adds a 24-hour answer we have
          never promised anybody. */}
      <Notice message={COPY.safety.reportIntro} testID="report-intro" />
      {reportError ? <Notice message={reportError} tone="error" testID="report-error" /> : null}
      {reported ? <Notice message={COPY.safety.reportThanks} testID="report-thanks" /> : null}
      <Button
        label={COPY.safety.reportButton}
        onPress={report}
        disabled={!reason || reporting}
        busy={reporting}
        testID="report-submit"
      />

      <Gap size="sm" />
      <Card>
        <Heading>{COPY_FOR.blockHeading(name)}</Heading>
        <Body>{COPY.safety.blockConfirm}</Body>
        {blockError ? <Notice message={blockError} tone="error" testID="block-error" /> : null}
        <Button
          label={COPY.safety.blockButton}
          variant="danger"
          onPress={() => setConfirmingBlock(true)}
          disabled={blocking}
          testID="block-start"
        />
      </Card>

      {/* 177:5283 draws the block confirmation as a blocking moment of its own
          rather than as two more buttons growing under the one just pressed —
          which is the same conclusion the owner reached on 2026-08-03 and the
          reason `ConfirmDialog` exists. The drawing's warning disc and its
          avatar preview are not carried across: the dialog is shared with four
          other confirmations, and a per-caller illustration slot would be new
          surface built for one of them. */}
      <ConfirmDialog
        visible={confirmingBlock}
        title={COPY.safety.blockTitle}
        body={COPY.safety.blockConfirm}
        confirmLabel={COPY_FOR.blockConfirmAction(name)}
        cancelLabel={COPY.common.cancel}
        busy={blocking}
        onConfirm={block}
        onCancel={() => setConfirmingBlock(false)}
        testID="block-dialog"
        confirmTestID="block-confirm"
        cancelTestID="block-cancel"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  reasons: { gap: spacing.snug },
  /** 176:4593: a floating white row, the answer read from its leading edge. */
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.snug,
    minHeight: MIN_TOUCH,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: color.rule,
    backgroundColor: color.surface,
    paddingHorizontal: spacing.wide,
    paddingVertical: spacing.md,
  },
  /** 176:4588: the chosen row thickens its edge and takes the brand wash. */
  reasonSelected: {
    borderWidth: 2.5,
    borderColor: color.accent,
    backgroundColor: color.accentWash,
  },
  reasonDisabled: { opacity: 0.45 },
  reasonPressed: { backgroundColor: color.veil },
  reasonLabel: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: font.body,
    lineHeight: font.body * leading.snug,
    color: color.ink,
  },
  reasonLabelSelected: { fontFamily: fontFamily.bodySemi, color: color.accentDeep },
  radio: {
    width: RADIO,
    height: RADIO,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: color.accent },
  radioDot: {
    width: RADIO_DOT,
    height: RADIO_DOT,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
  },
});
