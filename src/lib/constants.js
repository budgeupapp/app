/**
 * Shared constants used across Dashboard and Onboarding.
 */

export const STORAGE_KEY = 'budgeup_onboarding_state'

/** Frequency-to-annual multiplier. Used for amount conversions and yearly total calculations. */
export const FREQ_PER_YEAR = {
    weekly: 52,
    fortnightly: 26,
    monthly: 12,
    quarterly: 4,
    yearly: 1,
    irregular: 1,
    'one-off': 1,
}

/** Day-of-week name to JS getDay() index */
export const DAY_MAP = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
}

/** All month keys in academic year order */
export const ALL_MONTH_KEYS = [
    'september', 'october', 'november', 'december',
    'january', 'february', 'march', 'april',
    'may', 'june', 'july', 'august',
]
