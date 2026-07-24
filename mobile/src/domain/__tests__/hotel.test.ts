import { activateHotel, deactivateHotel, NO_ACTIVE_HOTEL } from '../hotel';

describe('activateHotel', () => {
  it('activates a hotel when none is active', () => {
    const result = activateHotel(NO_ACTIVE_HOTEL, 'hotel-a', 1000);
    expect(result.changed).toBe(true);
    expect(result.state).toEqual({ activeHotelId: 'hotel-a', activatedAt: 1000 });
    expect(result.deactivatedHotelId).toBeNull();
  });

  it('enforces exactly one active hotel by returning the deactivated hotel', () => {
    const first = activateHotel(NO_ACTIVE_HOTEL, 'hotel-a', 1000);
    const second = activateHotel(first.state, 'hotel-b', 2000);
    expect(second.changed).toBe(true);
    expect(second.state.activeHotelId).toBe('hotel-b');
    expect(second.deactivatedHotelId).toBe('hotel-a');
  });

  it('re-activating the same hotel is a no-op', () => {
    const first = activateHotel(NO_ACTIVE_HOTEL, 'hotel-a', 1000);
    const again = activateHotel(first.state, 'hotel-a', 2000);
    expect(again.changed).toBe(false);
    expect(again.state).toBe(first.state);
    expect(again.deactivatedHotelId).toBeNull();
  });
});

describe('deactivateHotel', () => {
  it('clears the active hotel and reports it', () => {
    const active = activateHotel(NO_ACTIVE_HOTEL, 'hotel-a', 1000);
    const result = deactivateHotel(active.state);
    expect(result.changed).toBe(true);
    expect(result.state).toEqual(NO_ACTIVE_HOTEL);
    expect(result.deactivatedHotelId).toBe('hotel-a');
  });

  it('is a no-op when nothing is active', () => {
    const result = deactivateHotel(NO_ACTIVE_HOTEL);
    expect(result.changed).toBe(false);
  });
});
