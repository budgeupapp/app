/**
 * Calculate the total amount for a single entry over its date range.
 * Accounts for frequency, term variation, start/end dates, and skipped events.
 * Independent of graph view — uses entry's own dates.
 */
import { toLocalDate, MONTH_KEY_TO_DATE, isInTerm } from './helpers'
import { FREQ_PER_YEAR } from './constants'
import { parseMoney } from './moneyUtils'

/**
 * @param {object} entry - The entry data
 * @param {object} cat - The category config from categories.js
 * @param {object} options
 * @param {Set} options.removedSet - Set of "editType:date" keys for skipped events
 * @param {object[]} options.terms - Term date objects for isInTerm checks
 * @param {boolean} options.useHasMultiple - Use hasMultiple for editType construction (onboarding compat)
 * @param {object[]} options.allEntries - All entries for this category (for hasMultiple check)
 */
export function calcEntryTotal(entry, cat, {
    removedSet = new Set(),
    terms = [],
    useHasMultiple = false,
    allEntries = null,
} = {}) {
    const amt = parseMoney(entry.amount)
    if (amt <= 0) return 0

    const freq = entry.frequency || cat.defaultFrequency
    const paidFreq = entry.scheduleFrequency || freq
    const effectiveFreq = paidFreq === 'one-off' ? freq : paidFreq === 'irregular' ? 'irregular' : paidFreq

    // Build editType matching how events are generated
    let entryEditType
    if (useHasMultiple && allEntries) {
        const hasMultiple = allEntries.filter(e => parseMoney(e.amount) > 0).length > 1
        entryEditType = hasMultiple ? (entry.id ? `${cat.id}:${entry.id}` : cat.id) : cat.id
    } else {
        entryEditType = entry.id ? `${cat.id}:${entry.id}` : cat.id
    }
    const isRemoved = (dateStr) => removedSet.has(`${entryEditType}:${dateStr}`)

    // ── Irregular / per instalment ──
    if (freq === 'irregular' || effectiveFreq === 'irregular') {
        const months = entry.months || []
        let instTotal = 0
        for (const m of months) {
            const date = entry.dates?.[m] || MONTH_KEY_TO_DATE[m]
            if (date && isRemoved(date)) continue
            const v = parseMoney(entry.instalmentAmounts?.[m])
            instTotal += v > 0 ? v : (amt / (months.length || 1))
        }
        return instTotal > 0 ? instTotal : amt
    }

    // ── One-off ──
    if (freq === 'one-off' || effectiveFreq === 'one-off') {
        if (entry.nextDate && isRemoved(entry.nextDate)) return 0
        return amt
    }

    // ── Yearly (any schedule) ──
    if (freq === 'yearly') {
        if (entry.nextDate && isRemoved(entry.nextDate)) return 0
        return amt
    }

    // ── Regular frequencies: count occurrences between start/end dates ──
    const defaultStart = new Date('2025-09-01T00:00:00')
    const defaultEnd = new Date('2026-08-31T00:00:00')
    const start = entry.nextDate ? new Date(entry.nextDate + 'T00:00:00') : defaultStart
    const end = entry.endDate ? new Date(entry.endDate + 'T00:00:00') : defaultEnd
    if (start > end) return 0

    const perOccurrence = (freq === 'yearly' && effectiveFreq !== 'yearly' && FREQ_PER_YEAR[effectiveFreq])
        ? Math.round(amt / FREQ_PER_YEAR[effectiveFreq] * 100) / 100
        : amt

    const nonTermAmt = entry.variesByTerm ? parseMoney(entry.nonTermAmount) : amt
    const nonTermPerOcc = (freq === 'yearly' && effectiveFreq !== 'yearly' && FREQ_PER_YEAR[effectiveFreq])
        ? Math.round(nonTermAmt / FREQ_PER_YEAR[effectiveFreq] * 100) / 100
        : nonTermAmt

    // ── Weekly / Fortnightly ──
    if (effectiveFreq === 'weekly' || effectiveFreq === 'fortnightly') {
        const interval = effectiveFreq === 'weekly' ? 7 : 14
        let total = 0
        let d = new Date(start)
        while (d <= end) {
            const dateStr = toLocalDate(d)
            if (!isRemoved(dateStr)) {
                total += (entry.variesByTerm && !isInTerm(dateStr, terms)) ? nonTermPerOcc : perOccurrence
            }
            d = new Date(d.getTime() + interval * 86400000)
        }
        return total
    }

    // ── Monthly ──
    if (effectiveFreq === 'monthly') {
        let total = 0
        let m = start.getMonth(), y = start.getFullYear()
        for (let i = 0; i < 24; i++) {
            const d = new Date(y, m, Math.min(parseInt(entry.dayOfMonth) || 1, new Date(y, m + 1, 0).getDate()))
            if (d >= start && d <= end) {
                const dateStr = toLocalDate(d)
                if (!isRemoved(dateStr)) {
                    total += (entry.variesByTerm && !isInTerm(dateStr, terms)) ? nonTermPerOcc : perOccurrence
                }
            }
            m++; if (m > 11) { m = 0; y++ }
            if (new Date(y, m, 1) > end) break
        }
        return total
    }

    return amt
}
