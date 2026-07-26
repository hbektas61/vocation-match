import type { Hotel } from '../domain/types';

/** Local fixture catalog. Replaced by a hotel provider in the next milestone. */
export const HOTELS: Hotel[] = [
  {
    id: 'hotel-lara-shore',
    name: 'Lara Shore Resort',
    city: 'Antalya',
    country: 'Türkiye',
    latitude: 36.8531,
    longitude: 30.7995,
  },
  {
    id: 'hotel-bosphorus-garden',
    name: 'Bosphorus Garden Hotel',
    city: 'İstanbul',
    country: 'Türkiye',
    latitude: 41.0433,
    longitude: 29.0031,
  },
  {
    id: 'hotel-cesme-breeze',
    name: 'Çeşme Breeze Club',
    city: 'İzmir',
    country: 'Türkiye',
    latitude: 38.3228,
    longitude: 26.3067,
  },
  {
    id: 'hotel-kas-blue',
    name: 'Kaş Blue Bay Suites',
    city: 'Antalya',
    country: 'Türkiye',
    latitude: 36.2007,
    longitude: 29.6394,
  },
  {
    id: 'hotel-cappadocia-stone',
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
