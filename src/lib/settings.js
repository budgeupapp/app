const CURRENCY_KEY = 'budgeup_currency'
const GRAPH_START_KEY = 'budgeup_graph_start'

export const CURRENCIES = [
    { code: 'GBP', symbol: '£', label: 'GBP (£)' },
    { code: 'USD', symbol: '$', label: 'USD ($)' },
    { code: 'EUR', symbol: '€', label: 'EUR (€)' },
    { code: 'CAD', symbol: 'C$', label: 'CAD (C$)' },
    { code: 'AUD', symbol: 'A$', label: 'AUD (A$)' },
    { code: 'NZD', symbol: 'NZ$', label: 'NZD (NZ$)' },
    { code: 'CHF', symbol: 'CHF', label: 'CHF' },
    { code: 'SEK', symbol: 'kr', label: 'SEK (kr)' },
    { code: 'NOK', symbol: 'kr', label: 'NOK (kr)' },
    { code: 'DKK', symbol: 'kr', label: 'DKK (kr)' },
    { code: 'PLN', symbol: 'zł', label: 'PLN (zł)' },
    { code: 'INR', symbol: '₹', label: 'INR (₹)' },
    { code: 'JPY', symbol: '¥', label: 'JPY (¥)' },
    { code: 'CNY', symbol: '¥', label: 'CNY (¥)' },
    { code: 'KRW', symbol: '₩', label: 'KRW (₩)' },
    { code: 'ZAR', symbol: 'R', label: 'ZAR (R)' },
]

export function getCurrency() {
    return localStorage.getItem(CURRENCY_KEY) || 'GBP'
}

export function setCurrency(code) {
    localStorage.setItem(CURRENCY_KEY, code)
}

export function getCurrencySymbol(code) {
    const c = code || getCurrency()
    return CURRENCIES.find(x => x.code === c)?.symbol || '£'
}

// Graph start date as YYYY-MM-DD string (first of chosen month)
export function getGraphStart() {
    return localStorage.getItem(GRAPH_START_KEY) || '2025-09-01'
}

export function setGraphStart(dateStr) {
    localStorage.setItem(GRAPH_START_KEY, dateStr)
}

// Compute academic year range from start date
export function getAcademicYear() {
    const start = getGraphStart()
    const [y, m] = start.split('-').map(Number)
    const ayStart = new Date(y, m - 1, 1)
    const ayEnd = new Date(y + 1, m - 1, 0) // last day of month before start, next year
    // Actually we want 12 months: e.g. Sep 1 2025 → Aug 31 2026
    ayEnd.setTime(new Date(y + 1, m - 1, 0).getTime()) // last day of (m-1)th month next year
    return { ayStart, ayEnd }
}

// Generate 12 month labels from the start
export function getMonthsFromStart() {
    const start = getGraphStart()
    const [y, m] = start.split('-').map(Number)
    const shortNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const months = []
    for (let i = 0; i < 12; i++) {
        const mi = (m - 1 + i) % 12
        const yi = y + Math.floor((m - 1 + i) / 12)
        months.push({ label: shortNames[mi], date: new Date(yi, mi, 1) })
    }
    return months
}
