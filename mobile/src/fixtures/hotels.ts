import type { Hotel } from '../domain/types';

/** Local fixture catalog. Replaced by a hotel provider in the next milestone. */
export const HOTELS: Hotel[] = [
  {
    id: 'hotel-lara-shore',
    kind: 'hotel',
    name: 'Lara Shore Resort',
    city: 'Antalya',
    country: 'Türkiye',
    latitude: 36.8531,
    longitude: 30.7995,
  },
  {
    /** Çevremde fixture (2026-08-03): a non-hotel inside the 500 m sweep of
        the shore point, because hotels no longer appear in that list and a
        "full but wrong" list needs something honest to be full of. */
    id: 'venue-lara-beach-bar',
    kind: 'bar',
    name: 'Sahil Kahve Lara',
    city: 'Antalya',
    country: 'Türkiye',
    latitude: 36.8551,
    longitude: 30.8003,
  },
  {
    /** D-039 fixture: ~600 m from Lara Shore — the same street. */
    id: 'hotel-lara-marina',
    kind: 'bar',
    name: 'Lara Marina Bar',
    city: 'Antalya',
    country: 'Türkiye',
    latitude: 36.858,
    longitude: 30.803,
  },
  {
    /** D-038 fixture: ~2 km from Lara Shore, so the fake has a region. */
    id: 'hotel-lara-dunes',
    kind: 'bar',
    name: 'Lara Dunes Club',
    city: 'Antalya',
    country: 'Türkiye',
    latitude: 36.86,
    longitude: 30.82,
  },
  {
    id: 'hotel-bosphorus-garden',
    kind: 'hotel',
    name: 'Bosphorus Garden Hotel',
    city: 'İstanbul',
    country: 'Türkiye',
    latitude: 41.0433,
    longitude: 29.0031,
  },
  {
    id: 'hotel-cesme-breeze',
    kind: 'hotel',
    name: 'Çeşme Breeze Club',
    city: 'İzmir',
    country: 'Türkiye',
    latitude: 38.3228,
    longitude: 26.3067,
  },
  {
    id: 'hotel-kas-blue',
    kind: 'hotel',
    name: 'Kaş Blue Bay Suites',
    city: 'Antalya',
    country: 'Türkiye',
    latitude: 36.2007,
    longitude: 29.6394,
  },
  {
    id: 'hotel-cappadocia-stone',
    kind: 'hotel',
    name: 'Cappadocia Stone House',
    city: 'Nevşehir',
    country: 'Türkiye',
    latitude: 38.6431,
    longitude: 34.8289,
  },
];

export function searchHotels(query: string): Hotel[] {
  const q = query.trim().toLocaleLowerCase('tr');
  if (!q) return HOTELS;
  return HOTELS.filter(
    (h) =>
      h.name.toLocaleLowerCase('tr').includes(q) || h.city.toLocaleLowerCase('tr').includes(q),
  );
}

export function getHotelById(hotelId: string | null): Hotel | null {
  if (!hotelId) return null;
  return HOTELS.find((h) => h.id === hotelId) ?? null;
}
