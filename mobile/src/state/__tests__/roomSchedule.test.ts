import { earliestRoomExpiry } from '../roomSchedule';

const NOW = 1_000_000;

describe('earliestRoomExpiry', () => {
  it('returns null when no room carries an expiry', () => {
    expect(
      earliestRoomExpiry(
        [
          { room: 'UPCOMING', eligible: true, reason: 'ELIGIBLE', validUntil: null },
          { room: 'HERE_NOW', eligible: false, reason: 'NO_RECENT_CHECK', validUntil: null },
        ],
        NOW,
      ),
    ).toBeNull();
  });

  it('returns the soonest future expiry', () => {
    expect(
      earliestRoomExpiry(
        [
          { room: 'UPCOMING', eligible: true, reason: 'ELIGIBLE', validUntil: null },
          { room: 'HERE_NOW', eligible: true, reason: 'ELIGIBLE', validUntil: NOW + 1_800_000 },
        ],
        NOW,
      ),
    ).toBe(NOW + 1_800_000);
  });

  it('ignores an expiry that has already passed', () => {
    expect(
      earliestRoomExpiry(
        [{ room: 'HERE_NOW', eligible: true, reason: 'ELIGIBLE', validUntil: NOW - 1 }],
        NOW,
      ),
    ).toBeNull();
  });
});
