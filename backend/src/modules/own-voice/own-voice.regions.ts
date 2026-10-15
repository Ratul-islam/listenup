/**
 * Where a voice can be made from a recording. Google doesn't offer voice
 * replication in the UK, the European Economic Area, Switzerland, India, or
 * the US states of Illinois and Texas, so it isn't offered there here either.
 */

// The EEA (the EU's 27, with Iceland, Liechtenstein and Norway), the UK, Switzerland and India
const BLOCKED_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
  'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH', 'IN',
])

// European time zones outside those countries; every other "Europe/…" zone is inside them
const OPEN_EUROPE_ZONES = new Set([
  'Europe/Istanbul', 'Europe/Moscow', 'Europe/Kyiv', 'Europe/Kiev', 'Europe/Minsk', 'Europe/Belgrade', 'Europe/Sarajevo',
  'Europe/Skopje', 'Europe/Tirane', 'Europe/Podgorica', 'Europe/Chisinau', 'Europe/Kaliningrad', 'Europe/Samara',
  'Europe/Volgograd', 'Europe/Saratov', 'Europe/Ulyanovsk', 'Europe/Astrakhan', 'Europe/Kirov', 'Europe/Simferopol',
  'Europe/Zaporozhye', 'Europe/Uzhgorod', 'Europe/Andorra', 'Europe/Monaco', 'Europe/San_Marino', 'Europe/Vatican',
])

// Zones of those countries that aren't under "Europe/…" (and old names some phones still report)
const BLOCKED_ZONES = new Set([
  'Asia/Kolkata', 'Asia/Calcutta', // IN
  'Asia/Nicosia', 'Asia/Famagusta', // CY
  'Atlantic/Reykjavik', 'Iceland', // IS
  'Atlantic/Canary', // ES
  'Atlantic/Madeira', 'Atlantic/Azores', 'Portugal', // PT
  'Arctic/Longyearbyen', // NO
  'GB', 'GB-Eire', 'Eire', 'Poland',
])

const US_ZONE = /^(US\/|America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Juneau|Sitka|Nome|Yakutat|Metlakatla|Menominee|Adak|Indiana\/|Kentucky\/|North_Dakota\/)|Pacific\/Honolulu$)/

const zoneBlocked = (timeZone: string) => BLOCKED_ZONES.has(timeZone) || (timeZone.startsWith('Europe/') && !OPEN_EUROPE_ZONES.has(timeZone))

/**
 * Whether a voice can't be made where this listener is: by their store
 * country, or by their phone's time zone when they have none (a plan set by
 * hand). Unknown means it can.
 */
export const ownVoiceBlockedIn = (country: string | null | undefined, timeZone: string | null | undefined) =>
  country ? BLOCKED_COUNTRIES.has(country.toUpperCase()) : !!timeZone && zoneBlocked(timeZone)

/** In the United States, where the listener also confirms they aren't in Illinois or Texas */
export const inUnitedStates = (country: string | null | undefined, timeZone: string | null | undefined) =>
  country ? country.toUpperCase() === 'US' : !!timeZone && US_ZONE.test(timeZone)
