/**
 * The list somebody picks from.
 *
 * Deliberately short, deliberately plain, and deliberately about what a person
 * might actually do near a hotel rather than a personality taxonomy. It is a
 * fixture rather than a table because it is copy: changing it is a wording
 * decision, not a migration.
 */
export const INTEREST_CHOICES = [
  'Swimming',
  'Running',
  'Diving',
  'Food',
  'Coffee',
  'Live music',
  'Reading',
  'Photography',
  'Hiking',
  'Museums',
  'Board games',
  'Nightlife',
  'Tennis',
  'Yoga',
] as const;
