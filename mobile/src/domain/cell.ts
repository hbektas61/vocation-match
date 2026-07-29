/**
 * The cell grid (D-048), mirrored from `app.cell_of` in SQL.
 *
 * The server owns the truth: a check-in's anchor is computed there, from the
 * reading, and this module exists so the fake backend can behave the same way
 * and so the rule is testable without a database. Any change here is a change
 * to the migration first.
 *
 * A cell is ~200 m square and stable inside itself: the longitude step comes
 * from the cell's *own* centre latitude, so every point in a cell agrees which
 * cell it is. Two people a few metres apart may still land either side of a
 * boundary — which is why a room is matched by distance rather than by cell
 * equality, and a grid edge changes nobody's room.
 */

const LAT_STEP = 0.0018;

export interface Cell {
  /** Positional, and therefore server-side only: never shown to anybody. */
  key: string;
  latitude: number;
  longitude: number;
}

export function cellOf(latitude: number, longitude: number): Cell {
  const latIndex = Math.floor(latitude / LAT_STEP);
  const cellLatitude = (latIndex + 0.5) * LAT_STEP;
  // Clamped so the poles cannot divide by zero.
  const lonStep = LAT_STEP / Math.max(Math.cos((cellLatitude * Math.PI) / 180), 0.1);
  const lonIndex = Math.floor(longitude / lonStep);
  return {
    key: `cell:${latIndex}:${lonIndex}`,
    latitude: cellLatitude,
    longitude: (lonIndex + 0.5) * lonStep,
  };
}
