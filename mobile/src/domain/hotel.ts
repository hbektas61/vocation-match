import type { ActiveHotelState } from './types';

export interface ActivationResult {
  state: ActiveHotelState;
  /** Hotel whose discovery access must be closed immediately (D-004). */
  deactivatedHotelId: string | null;
  changed: boolean;
}

export const NO_ACTIVE_HOTEL: ActiveHotelState = {
  activeHotelId: null,
  activatedAt: null,
};

/**
 * Enforces the primary product constraint: exactly one active hotel (D-003).
 * Activating a new hotel returns the previous hotel id so the caller can
 * revoke every hotel-scoped access (upcoming declaration, here-now session,
 * discovery pool) in the same transition.
 */
export function activateHotel(
  state: ActiveHotelState,
  hotelId: string,
  now: number,
): ActivationResult {
  if (state.activeHotelId === hotelId) {
    return { state, deactivatedHotelId: null, changed: false };
  }
  return {
    state: { activeHotelId: hotelId, activatedAt: now },
    deactivatedHotelId: state.activeHotelId,
    changed: true,
  };
}

export function deactivateHotel(state: ActiveHotelState): ActivationResult {
  if (state.activeHotelId === null) {
    return { state, deactivatedHotelId: null, changed: false };
  }
  return {
    state: NO_ACTIVE_HOTEL,
    deactivatedHotelId: state.activeHotelId,
    changed: true,
  };
}
