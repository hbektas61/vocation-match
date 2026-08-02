/**
 * ISO 3166-1 alpha-2 country choices for the destination flow.
 *
 * The codes are app-owned reference data. Display names come from the runtime's
 * locale data, so the same list speaks Turkish and English without a second
 * hand-maintained translation table. A runtime without `Intl.DisplayNames`
 * still works and shows the code rather than blocking the core flow.
 */
import type { Locale } from '../copy';
import { COUNTRY_NAMES } from './countryNames';
import { normalizeQuery } from './searchQuery';

export interface CountryOption {
  code: string;
  name: string;
}

const COUNTRY_CODES = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ ' +
  'BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ ' +
  'DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY ' +
  'HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY ' +
  'MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ ' +
  'NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY ' +
  'QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ ' +
  'TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ ' +
  'VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ');

const POPULAR_CODES = ['TR', 'US', 'GB', 'AE', 'GR', 'ES', 'FR', 'IT', 'DE', 'PT'];

type DisplayNamesLike = {
  of(code: string): string | undefined;
};

type DisplayNamesConstructor = new (
  locales: string[],
  options: { type: 'region' },
) => DisplayNamesLike;

function displayNames(locale: Locale): DisplayNamesLike | null {
  const Constructor = (
    Intl as unknown as { DisplayNames?: DisplayNamesConstructor }
  ).DisplayNames;
  if (!Constructor) return null;
  try {
    return new Constructor([locale === 'tr' ? 'tr-TR' : 'en-US'], { type: 'region' });
  } catch {
    return null;
  }
}

export function countryOptions(locale: Locale): CountryOption[] {
  // The generated table is the source of truth: Hermes has no
  // Intl.DisplayNames, and the runtime fallback showed "TR / TR" on a real
  // phone while every V8 environment looked fine. Intl still gets the last
  // word when it exists, so future locale-data fixes flow in for free.
  const table = COUNTRY_NAMES[locale];
  const names = displayNames(locale);
  return COUNTRY_CODES.map((code) => {
    const fromIntl = names?.of(code);
    return {
      code,
      name: fromIntl && fromIntl !== code ? fromIntl : table[code] ?? code,
    };
  }).sort((a, b) =>
    a.name.localeCompare(b.name, locale === 'tr' ? 'tr-TR' : 'en-US'),
  );
}

export function suggestedCountries(locale: Locale): CountryOption[] {
  const byCode = new Map(countryOptions(locale).map((country) => [country.code, country]));
  return POPULAR_CODES.map((code) => byCode.get(code)).filter(
    (country): country is CountryOption => country !== undefined,
  );
}

export function filterCountries(
  countries: CountryOption[],
  query: string,
  limit = 20,
): CountryOption[] {
  const needle = normalizeQuery(query);
  if (!needle) return countries.slice(0, limit);
  return countries
    .filter((country) =>
      normalizeQuery(`${country.name} ${country.code}`).includes(needle),
    )
    .slice(0, limit);
}
