/**
 * The answers offered for gender and orientation.
 *
 * Fixtures rather than tables because they are copy: changing this list is a
 * wording decision, not a migration. The stored value is free text, so nothing
 * here is an enum the database would have to learn.
 */

/**
 * The two discovery can filter on come first because they are the two the
 * filter knows (D-023); everything behind "More" is stored the same way and
 * treated the same way everywhere except that filter.
 */
export const PRIMARY_GENDERS = ['WOMAN', 'MAN'] as const;

export const MORE_GENDERS = [
  'Non-binary',
  'Genderfluid',
  'Agender',
  'Transgender woman',
  'Transgender man',
  'Prefer to self-describe',
] as const;

/** What a person picked, shown back to them in their own words. */
export const GENDER_LABELS: Record<string, string> = {
  WOMAN: 'Woman',
  MAN: 'Man',
};

export function genderLabel(value: string): string {
  return GENDER_LABELS[value] ?? value;
}

export const ORIENTATIONS = [
  'Straight',
  'Gay',
  'Lesbian',
  'Bisexual',
  'Asexual',
  'Demisexual',
  'Pansexual',
  'Queer',
  'Questioning',
] as const;

/** Matches `profiles_show_me_known`. */
export const SHOW_ME_OPTIONS = [
  { value: 'WOMEN', label: 'Women' },
  { value: 'MEN', label: 'Men' },
  { value: 'EVERYONE', label: 'Everyone' },
] as const;
