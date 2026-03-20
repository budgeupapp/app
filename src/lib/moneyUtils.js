/**
 * Shared money formatting and parsing utilities.
 */

/** Parse a money string (e.g. "1,234.56" or "$200") into a number. Returns 0 for invalid input. */
export const parseMoney = (value) =>
    parseFloat(String(value || '0').replace(/,/g, '')) || 0

/** Format a number string with thousands separators for display (e.g. "1234" → "1,234") */
export const formatDisplay = (raw) => {
    const str = String(raw || '')
    const parts = str.split('.')
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return parts.join('.')
}

/** Format money input — strips non-numeric chars first, then formats with commas */
export const formatMoney = (raw) => {
    const cleaned = String(raw || '').replace(/[^0-9.]/g, '')
    if (!cleaned) return ''
    const parts = cleaned.split('.')
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return parts.join('.')
}

/** Compact money formatter: £1.2k for 1200, £200 for 200 */
export const fmtCompact = (value, currencySymbol = '£') => {
    if (value >= 1000) {
        const k = value / 1000
        const dec = Math.round(k * 10) % 10
        return `${currencySymbol}${k.toFixed(dec === 0 ? 0 : 1)}k`
    }
    return `${currencySymbol}${Math.round(value).toLocaleString()}`
}
