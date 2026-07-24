import React, { useState } from 'react';

import { Body, Button, Card, Field, Gap, Heading, Notice, Screen, Title } from '../components/ui';
import { nowMs } from '../clock';
import { apiErrorMessage, COPY, reportReasonLabel } from '../copy';
import { ApiError, getApi, type ReportReason } from '../data';
import type { RootScreenProps } from '../navigation/types';
import { useAppStore } from '../state/AppStore';

const REPORT_REASONS: ReportReason[] = [
  'HARASSMENT',
  'SPAM',
  'FAKE_PROFILE',
  'UNDERAGE',
  'SAFETY',
  'OTHER',
];

export function ReportBlockScreen({ navigation, route }: RootScreenProps<'ReportBlock'>) {
  const { dispatch } = useAppStore();
  const name = route.params.displayName ?? 'this person';
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
    }
  };

  return (
    <Screen testID="screen-report-block">
      <Title>Safety</Title>
      <Card>
        <Heading>Report {name}</Heading>
        <Body>{COPY.safety.reportIntro}</Body>
        <Gap size="xs" />
        <Body>{COPY.safety.reportReasonLabel}</Body>
        {REPORT_REASONS.map((candidate) => (
          <Button
            key={candidate}
            label={reportReasonLabel(candidate)}
            variant={reason === candidate ? 'primary' : 'secondary'}
            onPress={() => setReason(candidate)}
            disabled={reporting}
            testID={`report-reason-${candidate}`}
          />
        ))}
        <Field
          label={COPY.safety.reportDetailsLabel}
          value={details}
          onChangeText={setDetails}
          placeholder={COPY.safety.reportDetailsPlaceholder}
          multiline
          editable={!reporting}
          testID="report-details"
        />
        {reportError ? <Notice message={reportError} tone="error" testID="report-error" /> : null}
        {reported ? <Notice message={COPY.safety.reportThanks} testID="report-thanks" /> : null}
        <Button
          label={COPY.safety.reportButton}
          onPress={report}
          disabled={!reason || reporting}
          testID="report-submit"
        />
      </Card>
      <Card>
        <Heading>Block {name}</Heading>
        <Body>{COPY.safety.blockConfirm}</Body>
        {blockError ? <Notice message={blockError} tone="error" testID="block-error" /> : null}
        {confirmingBlock ? (
          <>
            <Button
              label={`Yes, block ${name}`}
              variant="danger"
              onPress={block}
              disabled={blocking}
              testID="block-confirm"
            />
            <Button
              label={COPY.common.cancel}
              variant="secondary"
              onPress={() => setConfirmingBlock(false)}
              disabled={blocking}
              testID="block-cancel"
            />
          </>
        ) : (
          <Button
            label={COPY.safety.blockButton}
            variant="danger"
            onPress={() => setConfirmingBlock(true)}
            testID="block-start"
          />
        )}
      </Card>
      <Gap size="sm" />
      <Button
        label={COPY.common.back}
        variant="secondary"
        onPress={() => navigation.goBack()}
        testID="safety-back"
      />
    </Screen>
  );
}
