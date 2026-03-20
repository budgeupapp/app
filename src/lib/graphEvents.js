/**
 * Shared graph event generation logic used by both Dashboard and Onboarding.
 */
import { AY_START, AY_END, getGraphStart } from '../components/TermGraph'
import { toLocalDate, MONTH_KEY_TO_DATE, MONTH_SHORT, isInTerm, distributeEvenly, addMonths } from './helpers'
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '../config/categories'
import { FREQ_PER_YEAR, DAY_MAP, ALL_MONTH_KEYS } from './constants'
import { parseMoney } from './moneyUtils'

/**
 * Distribute a yearly total among non-removed, non-overridden dates.
 * Overridden dates use their override value; remaining total is split evenly among flex dates.
 */
export function distributeExcludingRemoved(total, dates, editType, removedSet, overrides = {}) {
    let overriddenTotal = 0
    const overrideMap = {}
    for (const d of dates) {
        const key = `${editType}:${d.date}`
        if (overrides[key] != null && !removedSet.has(key)) {
            const val = parseMoney(overrides[key])
            overrideMap[d.date] = val
            overriddenTotal += val
        }
    }
    const remaining = total - overriddenTotal
    const flexDates = dates.filter(d => !removedSet.has(`${editType}:${d.date}`) && !overrideMap.hasOwnProperty(d.date))
    const flexAmounts = distributeEvenly(Math.max(0, remaining), flexDates.length)
    const originalAmounts = distributeEvenly(total, dates.length)
    let fi = 0
    return dates.map((d, i) => {
        const key = `${editType}:${d.date}`
        if (removedSet.has(key)) return originalAmounts[i]
        if (overrideMap.hasOwnProperty(d.date)) return overrideMap[d.date]
        return flexAmounts[fi++] || 0
    })
}

/**
 * Build graph events from formData.
 *
 * @param {object} formData - The form data containing all income/expense entries
 * @param {object} options
 * @param {boolean} options.filterByGraphStart - Filter events before graph start date (Dashboard only)
 * @param {boolean} options.includeFlexSources - Include flex income/expense sources (Dashboard only)
 * @param {boolean} options.splitOneOffEditType - Use separate editTypes for one-off income/expense (Dashboard only)
 * @param {object[]} options.flexIncomeSources - Flex income source definitions (Dashboard only)
 * @param {object[]} options.flexExpenseSources - Flex expense source definitions (Dashboard only)
 */
export function buildGraphEvents(formData, {
    filterByGraphStart = false,
    includeFlexSources = false,
    splitOneOffEditType = false,
    flexIncomeSources = [],
    flexExpenseSources = [],
} = {}) {
    const events = []
    const terms = formData.termDates?.terms || []
    const removedSet = new Set(formData.removedEvents || [])
    const overridesMap = formData.amountOverrides || {}
    const firstTermStart = AY_START
    const sepStart = new Date('2025-09-01T00:00:00')

    // ── Category events (income + expense) ──
    for (const cat of [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]) {
        const isIncome = INCOME_CATEGORIES.includes(cat)
        const sourceList = isIncome ? formData.incomeSources : formData.expenseSources
        if (!sourceList?.includes(cat.id)) continue

        const entries = formData[cat.formKey] || []
        const multiEntry = entries.filter(e => parseMoney(e.amount) > 0).length > 1
        for (let ei = 0; ei < entries.length; ei++) {
            const entry = entries[ei]
            let amt = parseMoney(entry.amount)
            const amtFreq = entry.frequency || cat.defaultFrequency
            const paidFreq = entry.scheduleFrequency || amtFreq
            const freq = paidFreq === 'one-off' ? amtFreq : paidFreq === 'irregular' ? 'irregular' : paidFreq

            // For irregular entries, sum instalment amounts if top-level amount is 0
            if (amt <= 0 && freq === 'irregular' && entry.instalmentAmounts) {
                amt = Object.values(entry.instalmentAmounts).reduce((s, v) => s + parseMoney(v), 0)
            }
            if (amt <= 0) continue

            const type = isIncome ? 'income' : 'expense'
            const convertedAmt = (freq !== amtFreq && FREQ_PER_YEAR[amtFreq] && FREQ_PER_YEAR[freq])
                ? Math.round(amt * FREQ_PER_YEAR[amtFreq] / FREQ_PER_YEAR[freq] * 100) / 100
                : amt
            const entryLabel = multiEntry ? `${cat.label} ${ei + 1}` : cat.label
            const entryEditType = entry.id ? `${cat.id}:${entry.id}` : cat.id

            if (freq === 'irregular') {
                const months = (entry.months || []).slice().sort((a, b) => ALL_MONTH_KEYS.indexOf(a) - ALL_MONTH_KEYS.indexOf(b))
                if (months.length === 0) continue
                const dateObjs = months.map(m => ({ date: entry.dates?.[m] || MONTH_KEY_TO_DATE[m] }))
                const amounts = distributeExcludingRemoved(amt, dateObjs, entryEditType, removedSet, overridesMap)
                for (let mi = 0; mi < months.length; mi++) {
                    const month = months[mi]
                    const date = entry.dates?.[month] || MONTH_KEY_TO_DATE[month]
                    if (!date) continue
                    const instAmt = parseMoney(entry.instalmentAmounts?.[month])
                    const amount = instAmt > 0 ? instAmt : amounts[mi]
                    if (amount <= 0) continue
                    events.push({ date, amount, type, label: entryLabel, sublabel: `${MONTH_SHORT[month]} ${entryLabel.toLowerCase()}`, editType: entryEditType, editMonth: month })
                }
            } else if (freq === 'one-off') {
                if (entry.nextDate) {
                    events.push({ date: entry.nextDate, amount: amt, type, label: entryLabel, sublabel: 'One-off', editType: entryEditType })
                }
            } else if (freq === 'weekly' || freq === 'fortnightly') {
                const interval = freq === 'weekly' ? 7 : 14
                const targetDay = DAY_MAP[entry.dayOfWeek] ?? 1
                const loopStart = amtFreq === 'yearly' ? sepStart : (entry.nextDate ? new Date(entry.nextDate + 'T00:00:00') : new Date(firstTermStart))
                let d = new Date(loopStart)
                for (let i = 0; i < 7 && d.getDay() !== targetDay; i++) d = new Date(d.getTime() + 86400000)
                const nonTermAmt = entry.variesByTerm
                    ? Math.round(parseMoney(entry.nonTermAmount) * (FREQ_PER_YEAR[amtFreq] || 1) / (FREQ_PER_YEAR[freq] || 1) * 100) / 100
                    : convertedAmt
                const endDate = entry.endDate ? new Date(entry.endDate + 'T00:00:00') : AY_END
                const earliest = amtFreq === 'yearly' ? sepStart : AY_START
                const paymentDates = []
                while (d <= endDate) {
                    if (d >= earliest) {
                        paymentDates.push({ date: toLocalDate(d), sublabel: `${freq === 'weekly' ? 'Weekly' : 'Fortnightly'} ${entryLabel.toLowerCase()}` })
                    }
                    d = new Date(d.getTime() + interval * 86400000)
                }
                if (amtFreq === 'yearly' && paymentDates.length > 0) {
                    const dateObjs = paymentDates.map(p => ({ date: p.date }))
                    const amounts = distributeExcludingRemoved(amt, dateObjs, entryEditType, removedSet, overridesMap)
                    for (let pi = 0; pi < paymentDates.length; pi++) {
                        if (amounts[pi] > 0) events.push({ date: paymentDates[pi].date, amount: amounts[pi], type, label: entryLabel, sublabel: paymentDates[pi].sublabel, editType: entryEditType })
                    }
                } else {
                    for (const pd of paymentDates) {
                        const eventAmt = entry.variesByTerm ? (isInTerm(pd.date, terms) ? convertedAmt : nonTermAmt) : convertedAmt
                        if (eventAmt > 0) events.push({ date: pd.date, amount: eventAmt, type, label: entryLabel, sublabel: pd.sublabel, editType: entryEditType })
                    }
                }
            } else if (freq === 'monthly' || freq === 'quarterly') {
                const monthStep = freq === 'quarterly' ? 3 : 1
                const domRaw = entry.dayOfMonth || '1'
                const isLast = domRaw === 'last'
                const domTarget = isLast ? 31 : parseInt(domRaw) || 1
                const startFrom = entry.nextDate ? new Date(entry.nextDate + 'T00:00:00') : firstTermStart
                const earliest = amtFreq === 'yearly' ? sepStart : (startFrom > AY_START ? startFrom : AY_START)
                const endDate = entry.endDate ? new Date(entry.endDate + 'T00:00:00') : AY_END
                const nonTermAmt = entry.variesByTerm
                    ? Math.round(parseMoney(entry.nonTermAmount) * (FREQ_PER_YEAR[amtFreq] || 1) / (FREQ_PER_YEAR[freq] || 1) * 100) / 100
                    : convertedAmt
                const paymentDates = []
                const loopStart = amtFreq === 'yearly' ? sepStart : AY_START
                let month = loopStart.getMonth()
                let year = loopStart.getFullYear()
                for (let i = 0; i < (freq === 'quarterly' ? 5 : 13); i++) {
                    const lastDay = new Date(year, month + 1, 0).getDate()
                    const day = Math.min(domTarget, lastDay)
                    const d = new Date(year, month, day)
                    if (d >= earliest && d <= endDate) {
                        paymentDates.push({ date: toLocalDate(d), sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} ${entryLabel.toLowerCase()}` })
                    }
                    month += monthStep
                    while (month > 11) { month -= 12; year++ }
                }
                if (amtFreq === 'yearly' && paymentDates.length > 0) {
                    const dateObjs = paymentDates.map(p => ({ date: p.date }))
                    const amounts = distributeExcludingRemoved(amt, dateObjs, entryEditType, removedSet, overridesMap)
                    for (let pi = 0; pi < paymentDates.length; pi++) {
                        if (amounts[pi] > 0) events.push({ date: paymentDates[pi].date, amount: amounts[pi], type, label: entryLabel, sublabel: paymentDates[pi].sublabel, editType: entryEditType })
                    }
                } else {
                    for (const pd of paymentDates) {
                        const eventAmt = entry.variesByTerm ? (isInTerm(pd.date, terms) ? convertedAmt : nonTermAmt) : convertedAmt
                        if (eventAmt > 0) events.push({ date: pd.date, amount: eventAmt, type, label: entryLabel, sublabel: pd.sublabel, editType: entryEditType })
                    }
                }
            } else if (freq === 'yearly') {
                const sf = entry.scheduleFrequency
                if (sf === 'weekly' || sf === 'fortnightly') {
                    const interval = sf === 'weekly' ? 7 : 14
                    const startDate = entry.nextDate ? new Date(entry.nextDate + 'T00:00:00') : new Date(firstTermStart)
                    let d = new Date(startDate)
                    if (!entry.nextDate) {
                        while (d > AY_START) d = new Date(d.getTime() - interval * 86400000)
                        while (d < AY_START) d = new Date(d.getTime() + interval * 86400000)
                    }
                    const endDate = entry.endDate ? new Date(entry.endDate + 'T00:00:00') : AY_END
                    let count = 0
                    let tempD = new Date(d)
                    while (tempD <= endDate) { if (tempD >= AY_START) count++; tempD = new Date(tempD.getTime() + interval * 86400000) }
                    const perPayment = count > 0 ? Math.round(amt * 100 / count) / 100 : amt
                    while (d <= endDate) {
                        if (d >= AY_START) {
                            events.push({ date: toLocalDate(d), amount: perPayment, type, label: entryLabel, sublabel: `${sf === 'weekly' ? 'Weekly' : 'Fortnightly'} ${entryLabel.toLowerCase()}`, editType: entryEditType })
                        }
                        d = new Date(d.getTime() + interval * 86400000)
                    }
                } else if (sf === 'monthly') {
                    const domRaw = entry.dayOfMonth || '1'
                    const isLast = domRaw === 'last'
                    const domTarget = isLast ? 31 : parseInt(domRaw) || 1
                    const startFrom = entry.nextDate ? new Date(entry.nextDate + 'T00:00:00') : firstTermStart
                    const earliest = startFrom > AY_START ? startFrom : AY_START
                    const endDate = entry.endDate ? new Date(entry.endDate + 'T00:00:00') : AY_END
                    const paymentDates = []
                    let m2 = AY_START.getMonth(), y2 = AY_START.getFullYear()
                    for (let i = 0; i < 13; i++) {
                        const lastDay = new Date(y2, m2 + 1, 0).getDate()
                        const day = Math.min(domTarget, lastDay)
                        const dd = new Date(y2, m2, day)
                        if (dd >= earliest && dd <= endDate) {
                            paymentDates.push({ date: toLocalDate(dd), sublabel: `${dd.toLocaleDateString('en-GB', { month: 'long' })} ${entryLabel.toLowerCase()}` })
                        }
                        m2++; if (m2 > 11) { m2 = 0; y2++ }
                    }
                    const dateObjs = paymentDates.map(p => ({ date: p.date }))
                    const amounts = distributeExcludingRemoved(amt, dateObjs, entryEditType, removedSet, overridesMap)
                    for (let pi = 0; pi < paymentDates.length; pi++) {
                        if (amounts[pi] > 0) events.push({ date: paymentDates[pi].date, amount: amounts[pi], type, label: entryLabel, sublabel: paymentDates[pi].sublabel, editType: entryEditType })
                    }
                } else if (sf === 'irregular' || (!sf && entry.months?.length)) {
                    const months = (entry.months || []).slice().sort((a, b) => ALL_MONTH_KEYS.indexOf(a) - ALL_MONTH_KEYS.indexOf(b))
                    if (months.length > 0) {
                        const dateObjs = months.map(m => ({ date: entry.dates?.[m] || MONTH_KEY_TO_DATE[m] }))
                        const amounts = distributeExcludingRemoved(amt, dateObjs, entryEditType, removedSet, overridesMap)
                        for (let mi = 0; mi < months.length; mi++) {
                            const month = months[mi]
                            const date = entry.dates?.[month] || MONTH_KEY_TO_DATE[month]
                            if (!date) continue
                            const instAmt = parseMoney(entry.instalmentAmounts?.[month])
                            const amount = instAmt > 0 ? instAmt : amounts[mi]
                            if (amount <= 0) continue
                            events.push({ date, amount, type, label: entryLabel, sublabel: `${MONTH_SHORT[month]} ${entryLabel.toLowerCase()}`, editType: entryEditType, editMonth: month })
                        }
                    } else {
                        events.push({ date: entry.nextDate || toLocalDate(AY_START), amount: amt, type, label: entryLabel, sublabel: `Yearly ${entryLabel.toLowerCase()}`, editType: entryEditType })
                    }
                } else {
                    events.push({ date: entry.nextDate || toLocalDate(AY_START), amount: amt, type, label: entryLabel, sublabel: `Yearly ${entryLabel.toLowerCase()}`, editType: entryEditType })
                }
            }
        }
    }

    // ── Weekly spend ──
    const weeklyAmt = parseMoney(formData.weeklySpend)
    const weeklyNonTermAmt = formData.weeklySpendVariesByTerm ? parseMoney(formData.weeklySpendNonTerm) : weeklyAmt
    if (weeklyAmt > 0 || weeklyNonTermAmt > 0) {
        let d = new Date(AY_START)
        while (d.getDay() !== 1) d = new Date(d.getTime() + 86400000)
        while (d <= AY_END) {
            const ds = toLocalDate(d)
            const amt = formData.weeklySpendVariesByTerm ? (isInTerm(ds, terms) ? weeklyAmt : weeklyNonTermAmt) : weeklyAmt
            if (amt > 0) events.push({ date: ds, amount: amt, type: 'expense', label: 'Weekly Spend', sublabel: 'Average weekly spending', editType: 'weeklySpend', noDot: true })
            d = new Date(d.getTime() + 7 * 86400000)
        }
    }

    // ── Flex sources (Dashboard only) ──
    if (includeFlexSources) {
        const allFlexSources = [
            ...((formData.flexIncomeSources || []).map(id => ({ id, type: 'income' }))),
            ...((formData.flexExpenseSources || []).map(id => ({ id, type: 'expense' }))),
        ]
        for (const { id: flexId, type: flexType } of allFlexSources) {
            const srcData = formData.flexSourceData?.[flexId]
            if (!srcData) continue
            const amt = parseMoney(srcData.amount)
            if (amt <= 0) continue
            const freq = srcData.frequency || 'monthly'
            const allSrc = flexType === 'income' ? flexIncomeSources : flexExpenseSources
            const srcDef = allSrc.find(s => s.id === flexId)
            const label = srcDef?.label || flexId
            const ayStartStr = toLocalDate(AY_START)
            const ayEndStr = toLocalDate(AY_END)
            const startDate = srcData.startDate || ayStartStr
            const endDate = srcData.endDate || ayEndStr
            const effStart = new Date(Math.max(new Date(startDate + 'T00:00:00'), AY_START))
            const effEnd = new Date(Math.min(endDate ? new Date(endDate + 'T00:00:00') : AY_END, AY_END))

            if (freq === 'one-off') {
                if (startDate) events.push({ date: startDate, amount: amt, type: flexType, label, sublabel: 'One-off', editType: flexId })
            } else if (freq === 'weekly' || freq === 'fortnightly') {
                const step = freq === 'fortnightly' ? 14 : 7
                let d = new Date(effStart)
                while (d <= effEnd) { events.push({ date: toLocalDate(d), amount: amt, type: flexType, label, sublabel: freq === 'fortnightly' ? 'Fortnightly' : 'Weekly', editType: flexId }); d = new Date(d.getTime() + step * 86400000) }
            } else if (freq === 'monthly') {
                let d = new Date(effStart)
                const dom = d.getDate()
                while (d <= effEnd) { events.push({ date: toLocalDate(d), amount: amt, type: flexType, label, sublabel: d.toLocaleDateString('en-GB', { month: 'long' }), editType: flexId }); d = addMonths(d, 1, dom) }
            } else if (freq === 'quarterly') {
                const QD = ['2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01']
                for (let i = 0; i < 4; i++) { const date = QD[i]; if (date >= startDate && date <= (endDate || AY_END)) events.push({ date, amount: amt, type: flexType, label, sublabel: `Q${i + 1}`, editType: flexId }) }
            } else if (freq === 'termly') {
                for (const term of terms) { const date = term.start; if (date && date >= startDate && date <= (endDate || AY_END)) events.push({ date, amount: amt, type: flexType, label, sublabel: term.name, editType: flexId }) }
            } else if (freq === 'yearly') {
                events.push({ date: startDate || AY_START, amount: amt, type: flexType, label, sublabel: 'Yearly', editType: flexId })
            }
        }
    }

    // ── One-off items ──
    for (const item of (formData.oneOffItems || [])) {
        if (item.hidden) continue
        const amt = parseMoney(item.amount)
        const isIn = (item.direction || 'out') === 'in'
        if (amt > 0 && item.date) {
            events.push({
                date: item.date, amount: amt,
                type: isIn ? 'income' : 'expense',
                label: item.name || 'One-off',
                sublabel: isIn ? 'One-off income' : 'One-off expense',
                editType: splitOneOffEditType ? (isIn ? 'oneOffIncome' : 'oneOffExpense') : 'oneOff',
            })
        }
    }

    // ── Filter by graph start date (Dashboard only) ──
    const ayEndStr = toLocalDate(AY_END)
    const filtered = filterByGraphStart
        ? (() => { const graphStartMonth = getGraphStart().slice(0, 7) + '-01'; return events.filter(e => e.date >= graphStartMonth && e.date < ayEndStr) })()
        : events.filter(e => e.date < ayEndStr)

    // ── Apply removed events and amount overrides ──
    const removed = formData.removedEvents || []
    const overrides = formData.amountOverrides || {}
    return filtered.map(e => {
        const isFlex = e.editType?.startsWith('flex_')
        const base = isFlex ? { ...e, flex: true } : e
        if (base.editType === 'oneOffIncome' || base.editType === 'oneOffExpense' || base.editType === 'oneOff') return base
        const overrideKey = `${base.editType}:${base.date}`
        const overrideVal = overrides[overrideKey]
        const withOverride = overrideVal != null
            ? { ...base, amount: parseMoney(overrideVal) || base.amount, hasOverride: true, originalAmount: base.amount }
            : base
        return removed.includes(overrideKey) ? { ...withOverride, removed: true } : withOverride
    })
}
