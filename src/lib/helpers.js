// Use local date to avoid UTC timezone shift (BST → dates shift back 1 day with toISOString)
export const toLocalDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Default empty "other" instance
export const makeOtherInstance = (prefix) => ({
    id: `${prefix}_${Date.now()}`,
    amount: '', frequency: 'monthly', amountPeriod: 'monthly', label: '',
    nextDate: null, termDates: {}, quarterlyDates: {},
    variesByTerm: false, nonTermAmount: '',
})

export const MONTH_KEY_TO_DATE = {
    september: '2025-09-01', october: '2025-10-01', november: '2025-11-01', december: '2025-12-01',
    january: '2026-01-01', february: '2026-02-01', march: '2026-03-01', april: '2026-04-01',
    may: '2026-05-01', june: '2026-06-01', july: '2026-07-01', august: '2026-08-01',
}

export const MONTH_SHORT = {
    september: 'September', october: 'October', november: 'November', december: 'December',
    january: 'January', february: 'February', march: 'March', april: 'April',
    may: 'May', june: 'June', july: 'July', august: 'August',
}

export function isInTerm(dateStr, terms) {
    if (!terms || terms.length === 0) return true
    const d = new Date(dateStr + 'T00:00:00')
    for (const term of terms) {
        if (!term.start || !term.end) continue
        const start = new Date(term.start + 'T00:00:00')
        const end = new Date(term.end + 'T00:00:00')
        if (d >= start && d <= end) return true
    }
    return false
}

export function distributeEvenly(total, count) {
    if (count <= 0) return []
    const per = Math.round((total / count) * 100) / 100
    const amounts = Array(count).fill(per)
    amounts[count - 1] = Math.round((total - per * (count - 1)) * 100) / 100
    return amounts
}
