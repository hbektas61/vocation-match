/**
 * Which room this deck is drawing — D-057's one deck, five contexts.
 *
 * Before it, Discovery inferred its room and offered a row of pill buttons
 * only when more than one was open; a room that was *not* open simply was not
 * there, so "why can I not see the people at my hotel" had no answer on the
 * screen that raised the question. This control always says which room you are
 * in and what its clock is doing, and it lists every room the account has —
 * the closed ones disabled, with their reason, rather than hidden.
 *
 * Three things it is deliberately not:
 *
 * - **It is not a membership.** Switching is a viewing choice. It calls no
 *   endpoint of its own, joins nothing and withdraws nothing; the rows it
 *   shows are the eligibility the screen had already fetched.
 * - **It is not a clock the user has to read.** The remaining time is words —
 *   "2 sa 41 dk kaldı" — never a coordinate, never a distance.
 * - **It is not colour-coded.** A live room is a filled dot *and* the word;
 *   the expiring state adds a heavier edge and the minutes, so the warning
 *   survives being seen by someone the pink does not register for.
 */
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { COPY } from '../copy';
import type { RoomKey } from '../data';
import { color, fontFamily, MIN_TOUCH, overlay, radius, spacing } from '../theme';

/** Below this, the control warns that the room is about to close. */
export const EXPIRING_WITHIN_MS = 10 * 60 * 1000;

/** Every room the deck can draw, in the order the sheet lists them. */
export const CONTEXT_ORDER: RoomKey[] = [
  'EVENT_HERE_NOW',
  'EVENT_UPCOMING',
  'HERE_NOW',
  'UPCOMING',
  'NEARBY',
];

/** A room that opens on a proximity check rather than a declaration. */
const LIVE_ROOMS: RoomKey[] = ['HERE_NOW', 'NEARBY', 'EVENT_HERE_NOW'];

export function roomLabel(room: RoomKey): string {
  switch (room) {
    case 'UPCOMING':
      return COPY.upcoming.roomTitle;
    case 'HERE_NOW':
      return COPY.hereNow.roomTitle;
    case 'NEARBY':
      return COPY.checkin.roomTitle;
    case 'EVENT_UPCOMING':
      return COPY.events.joinUpcoming;
    default:
      return COPY.events.joinHereNow;
  }
}

export interface ContextRow {
  room: RoomKey;
  /** The venue, the event, the dates — whatever names this room. Never a place. */
  meta: string;
  eligible: boolean;
  /** Epoch ms the room closes, when it has a clock at all. */
  validUntil: number | null;
  /** Why it is shut. Shown on the row, because hiding it answers nothing. */
  reason: string | null;
}

function isExpiring(row: ContextRow, now: number): boolean {
  return row.eligible && row.validUntil !== null && row.validUntil - now <= EXPIRING_WITHIN_MS;
}

/** The dot: filled for a live room, hollow for a declared one. */
function Dot({ live, on }: { live: boolean; on: boolean }) {
  return <View style={[styles.dot, live && on ? styles.dotLive : styles.dotIdle]} />;
}

export function ContextSelector({
  rows,
  current,
  onChange,
  now,
  testID = 'context-selector',
}: {
  rows: ContextRow[];
  current: RoomKey | null;
  onChange: (room: RoomKey) => void;
  /** Passed in rather than read here, so a test can hold the clock still. */
  now: number;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const active = rows.find((r) => r.room === current) ?? null;
  const anyEligible = rows.some((r) => r.eligible);
  const expiring = active !== null && isExpiring(active, now);

  const closedLabel = active ? roomLabel(active.room) : COPY.tabs.discovery;
  const closedMeta = active ? active.meta : COPY.discovery.contextNoneOpen;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !anyEligible, expanded: open }}
        accessibilityLabel={`${closedLabel}. ${closedMeta}`}
        accessibilityHint={anyEligible ? COPY.discovery.contextHint : undefined}
        disabled={!anyEligible}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.closed,
          !anyEligible && styles.closedOff,
          expiring && styles.closedExpiring,
          pressed && styles.pressed,
        ]}
        testID={testID}
      >
        <Dot live={active !== null && LIVE_ROOMS.includes(active.room)} on={anyEligible} />
        <View style={styles.closedText}>
          <Text style={[styles.closedLabel, !anyEligible && styles.mutedText]} numberOfLines={1}>
            {closedLabel.toLocaleUpperCase('tr-TR')}
          </Text>
          <Text style={styles.closedMeta} numberOfLines={1}>
            {closedMeta}
          </Text>
        </View>
        <Text style={[styles.chevron, !anyEligible && styles.mutedText]}>▾</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        {/* The scrim closes the sheet, which is the gesture people already
            expect; the sheet itself stops the press from passing through. */}
        <Pressable style={styles.scrim} onPress={() => setOpen(false)} testID={`${testID}-scrim`}>
          <Pressable style={styles.sheet} onPress={() => {}} testID={`${testID}-sheet`}>
            <View style={styles.grabber} />
            <Text accessibilityRole="header" style={styles.sheetTitle}>
              {COPY.discovery.contextTitle}
            </Text>
            <Text style={styles.sheetNote}>{COPY.discovery.contextKeepsMembership}</Text>
            <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetListInner}>
              {rows.map((row) => {
                const selected = row.room === current;
                const live = LIVE_ROOMS.includes(row.room);
                return (
                  <Pressable
                    key={row.room}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: !row.eligible }}
                    accessibilityLabel={`${roomLabel(row.room)}. ${row.eligible ? row.meta : row.reason ?? row.meta}`}
                    disabled={!row.eligible}
                    onPress={() => {
                      onChange(row.room);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.row,
                      selected && styles.rowSelected,
                      !row.eligible && styles.rowOff,
                      pressed && row.eligible && styles.pressed,
                    ]}
                    testID={`context-row-${row.room}`}
                  >
                    {selected ? (
                      <Text style={styles.check}>✓</Text>
                    ) : (
                      <Dot live={live} on={row.eligible} />
                    )}
                    <View style={styles.rowText}>
                      <Text
                        style={[styles.rowLabel, !row.eligible && styles.mutedText]}
                        numberOfLines={1}
                      >
                        {roomLabel(row.room).toLocaleUpperCase('tr-TR')}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={2}>
                        {row.eligible ? row.meta : row.reason ?? row.meta}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            {/* The two rules people get wrong about this screen, stated where
                the switching happens rather than in a help page. */}
            <View style={styles.footNote}>
              <Text style={styles.footNoteText}>{COPY.discovery.contextOneLive}</Text>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  /** The Figma control (NAV-02): white, 16 corners, 10/14 padding — a control
      edge (`color.border`) rather than a card's quiet `color.rule`, since
      this row is operable, not just a surface. */
  closed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    minHeight: MIN_TOUCH,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  // No room open: the same flat, neutral disabled fill `Button` uses.
  closedOff: { backgroundColor: color.veil, borderColor: color.rule },
  /** About to close: a heavier brand edge beside the minutes in the meta line. */
  closedExpiring: { borderWidth: 1.5, borderColor: color.accent },
  closedText: { flex: 1, gap: 2 },
  closedLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 10,
    letterSpacing: 0.5,
    color: color.ink,
  },
  closedMeta: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    color: color.inkMuted,
  },
  chevron: { fontFamily: fontFamily.bodySemi, fontSize: 12, color: color.ink },
  mutedText: { color: color.inkMuted },
  pressed: { opacity: 0.82 },

  dot: { width: 10, height: 10, borderRadius: radius.pill },
  dotLive: { backgroundColor: color.accent },
  dotIdle: { borderWidth: 2, borderColor: color.inkMuted },

  scrim: { flex: 1, backgroundColor: overlay.backdrop, justifyContent: 'flex-end' },
  // A white sheet lifted over the cream ground — the same distinction
  // `Screen tone="sheet"` draws everywhere else a modal appears.
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: color.rule,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 28,
    gap: spacing.sm + 3,
    maxHeight: '82%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    // Decoration only, never read as text — the faint tier is exactly the
    // job this token is for.
    backgroundColor: color.inkFaint,
  },
  sheetTitle: {
    fontFamily: fontFamily.displaySemi,
    fontSize: 18,
    color: color.ink,
  },
  sheetNote: { fontFamily: fontFamily.body, fontSize: 12, color: color.inkMuted },
  sheetList: { flexGrow: 0 },
  sheetListInner: { gap: spacing.sm },
  // A row nested inside the white sheet: the recessed `veil` fill a card
  // uses for something sitting on top of another surface, not a card of its
  // own weight.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    minHeight: MIN_TOUCH,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: color.veil,
    borderWidth: 1,
    borderColor: color.rule,
  },
  rowSelected: { backgroundColor: color.accentSoft, borderColor: color.accent },
  rowOff: { opacity: 0.7 },
  rowText: { flex: 1, gap: 2 },
  rowLabel: {
    fontFamily: fontFamily.bodySemi,
    fontSize: 10,
    letterSpacing: 0.5,
    color: color.ink,
  },
  rowMeta: { fontFamily: fontFamily.body, fontSize: 12, color: color.inkMuted },
  // Text, not a fill — the dark sibling is what the brand can carry at this
  // size. Same reasoning as every other small coral glyph in this theme.
  check: { fontFamily: fontFamily.bodySemi, fontSize: 12, color: color.accentDeep, width: 10, textAlign: 'center' },
  footNote: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: color.infoSoft,
  },
  footNoteText: { fontFamily: fontFamily.body, fontSize: 11, color: color.inkMuted },
});
