/**
 * One of the trip tab's two features, in the Figma card shape (10:86, 10:124,
 * 10:131): the tracked gold plate and the bare state word on the head row,
 * the claim and its sentence, and the feature's one action as the warm
 * gradient pill. When the feature is live the lead steps aside and the body
 * line carries the live fact instead — the card says what is true now.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, PremiumBadge, StateChip } from './ui';
import { COPY, roomPlate, upperCase } from '../copy';
import type { RoomKey, RoomStatus } from '../data';
import { color, elevation, fontFamily, radius } from '../theme';

export function VacationFeatureCard({
  room,
  status,
  lead,
  body,
  buttonLabel,
  onOpen,
  note,
  tag,
  counts,
  extra,
  testID,
  buttonTestID,
}: {
  room: RoomKey;
  status: RoomStatus | null;
  lead: string;
  body: string;
  buttonLabel: string;
  onOpen: () => void;
  /**
   * The server's reason the room is what it is (D-002/D-007): the reviewed
   * explanation, under the claim, in a smaller voice. The chip says the
   * state; this says why, and the server is the one saying it.
   */
  note?: string;
  /** A small quiet label on the head row — "Premium", never a price. It takes
   * the state word's seat (10:131), so the two never crowd one corner. */
  tag?: string;
  /** The thresholded headcount line (D-032), when the server sent a number. */
  counts?: React.ReactNode;
  extra?: React.ReactNode;
  testID: string;
  buttonTestID: string;
}) {
  const open = status?.eligible === true;
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.head}>
        <Text style={styles.plate}>{upperCase(roomPlate(room))}</Text>
        {tag ? (
          // The shared premium plate — pale sand with dark gold type — rather
          // than a bespoke label, so a gated feature reads the same way
          // wherever Premium is mentioned.
          <PremiumBadge label={tag} />
        ) : (
          <StateChip
            open={open}
            label={open ? COPY.rooms.openChip : COPY.rooms.closedChip}
            testID={`${testID}-state`}
          />
        )}
      </View>
      {open ? null : <Text style={styles.lead}>{lead}</Text>}
      <Text style={styles.body}>{body}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      {counts}
      <Button label={buttonLabel} onPress={onOpen} testID={buttonTestID} />
      {extra}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
    ...elevation.card,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  /* The Figma plate (10:88): a bare tracked label, no pill. D-058 moved it off
     the metal gold — which was never about premium here, just a stylistic
     accent — onto the brand's text sibling, so the card keeps a spot of
     colour without borrowing a hue that means something else on this screen. */
  plate: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 11,
    letterSpacing: 1.6,
    color: color.accentDeep,
  },
  lead: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 15,
    lineHeight: 15 * 1.35,
    color: color.ink,
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 13 * 1.45,
    color: color.inkMuted,
  },
  note: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 12 * 1.45,
    color: color.inkMuted,
  },
});
