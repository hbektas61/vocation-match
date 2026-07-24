import React, { useState } from 'react';

import { Body, Button, Card, Field, Gap, Heading, Notice, Screen, Title } from '../components/ui';
import { nowMs } from '../clock';
import { COPY } from '../copy';
import { getCandidateById } from '../fixtures/candidates';
import type { RootScreenProps } from '../navigation/types';
import { useAppStore } from '../state/AppStore';

export function ReportBlockScreen({ navigation, route }: RootScreenProps<'ReportBlock'>) {
  const { dispatch } = useAppStore();
  const other = getCandidateById(route.params.userId);
  const name = other?.displayName ?? 'this person';
  const [reason, setReason] = useState('');
  const [reported, setReported] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);

  const report = () => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    dispatch({ type: 'REPORT_USER', userId: route.params.userId, reason: trimmed, now: nowMs() });
    setReason('');
    setReported(true);
  };

  const block = () => {
    dispatch({ type: 'BLOCK_USER', userId: route.params.userId });
    navigation.popToTop();
  };

  return (
    <Screen testID="screen-report-block">
      <Title>Safety</Title>
      <Card>
        <Heading>Report {name}</Heading>
        <Body>Reports are reviewed by our team. {name} is not notified.</Body>
        <Field
          label="What happened?"
          value={reason}
          onChangeText={setReason}
          placeholder="Describe the problem"
          multiline
          testID="report-reason"
        />
        {reported ? <Notice message={COPY.safety.reportThanks} /> : null}
        <Button
          label={COPY.safety.reportButton}
          onPress={report}
          disabled={!reason.trim()}
          testID="report-submit"
        />
      </Card>
      <Card>
        <Heading>Block {name}</Heading>
        <Body>{COPY.safety.blockConfirm}</Body>
        {confirmingBlock ? (
          <>
            <Button label={`Yes, block ${name}`} variant="danger" onPress={block} testID="block-confirm" />
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => setConfirmingBlock(false)}
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
      <Button label="Back" variant="secondary" onPress={() => navigation.goBack()} testID="safety-back" />
    </Screen>
  );
}
