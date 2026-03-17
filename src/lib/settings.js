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
    { code: 'CRC', symbol: '₡', label: 'CRC (₡)' },
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

// Graph start date as YYYY-MM-DD string
export function getGraphStart() {
    return localStorage.getItem(GRAPH_START_KEY) || new Date().toISOString().split('T')[0]
}

export function setGraphStart(dateStr) {
    localStorage.setItem(GRAPH_START_KEY, dateStr)
}

// Compute academic year range from start date — always ends Sep 1
export function getAcademicYear() {
    const start = getGraphStart()
    const [y, m, d] = start.split('-').map(Number)
    const ayStart = new Date(y, m - 1, d)
    // End is always Sep 1: same year if start is Sep+, next year otherwise
    const endYear = m >= 9 ? y + 1 : y
    const ayEnd = new Date(endYear, 8, 1) // Sep 1
    return { ayStart, ayEnd }
}

// Generate month labels from the start through August
export function getMonthsFromStart() {
    const start = getGraphStart()
    const [y, m] = start.split('-').map(Number)
    const endYear = m >= 9 ? y + 1 : y
    const endMonth = 8 // August (1-indexed)
    const shortNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const months = []
    let ci = m, cy = y
    while (cy < endYear || (cy === endYear && ci <= endMonth)) {
        months.push({ label: shortNames[ci - 1], date: new Date(cy, ci - 1, 1) })
        ci++
        if (ci > 12) { ci = 1; cy++ }
    }
    return months
}
