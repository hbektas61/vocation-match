/**
 * One of the trip tab's two features (D-040, extracted from the retired
 * Rooms screen unchanged in shape): the tracked plate and the state chip on
 * the head row, the drawing beside the claim and its trust sentence, the
 * server's status line under a hairline, and the feature's one action as a
 * full-width button.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Body, Button, Caption, StateChip } from './ui';
import { COPY, roomPlate, roomStatusExplanation, upperCase } from '../copy';
import type { RoomKey, RoomStatus } from '../data';
import { color, font, fontFamily, radius, spacing, glass } from '../theme';

export function VacationFeatureCard({
  room,
  status,
  lead,
  body,
  illustration,
  icon,
  buttonLabel,
  onOpen,
  tag,
  extra,
  testID,
  buttonTestID,
}: {
  room: RoomKey;
  status: RoomStatus | null;
  lead: string;
  body: string;
  illustration: React.ReactNode;
  icon: React.ReactNode;
  buttonLabel: string;
  onOpen: () => void;
  /** A small quiet label on the head row — "Premium", never a price. */
  tag?: string;
  extra?: React.ReactNode;
  testID: string;
  buttonTestID: string;
}) {
  const open = status?.eligible === true;
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.head}>
        <View style={styles.platePill}>
          <Text style={styles.platePillText}>{upperCase(roomPlate(room))}</Text>
        </View>
        <View style={styles.headRight}>
          {tag ? <Text style={styles.tag}>{upperCase(tag)}</Text> : null}
          <StateChip
            open={open}
            label={open ? COPY.rooms.openChip : COPY.rooms.closedChip}
            testID={`${testID}-state`}
          />
        </View>
      </View>
      <View style={styles.bodyRow}>
        <View style={styles.art}>{illustration}</View>
        <View style={styles.words}>
          <Text style={styles.lead}>{lead}</Text>
          <Body>{body}</Body>
        </View>
      </View>
      <View style={styles.hairline} />
      {status ? (
        <View style={styles.statusRow}>
          {icon}
          <View style={styles.statusText}>
            <Caption>{roomStatusExplanation(room, status)}</Caption>
          </View>
        </View>
      ) : null}
      {extra}
      <Button
        label={buttonLabel}
        variant={open ? 'secondary' : 'primary'}
        onPress={onOpen}
        testID={buttonTestID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: glass.fill,
    borderWidth: 1,
    borderColor: glass.edge,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  /* The Figma plate (D-045): a bare tracked label in gold, no pill. */
  platePill: {
    paddingVertical: 2,
  },
  platePillText: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: 1.6,
    color: '#FBBF24',
  },
  tag: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.label,
    letterSpacing: 1.2,
    color: color.inkMuted,
  },
  bodyRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  art: { width: 96 },
  words: { flex: 1, gap: spacing.xs },
  lead: {
    fontFamily: fontFamily.bodySemi,
    fontSize: font.body + 1,
    lineHeight: (font.body + 1) * 1.35,
    color: color.ink,
  },
  hairline: { height: 1, backgroundColor: color.border },
  statusRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  statusText: { flex: 1 },
});
