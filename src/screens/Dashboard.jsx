import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ChevronUp, ChevronDown, Check, Clock, Plus, Trash, Eye, EyeOff, AlertTriangle } from 'react-feather'
import { useSurveySequence } from '../lib/useSurveySequence'
import TermGraph, { refreshAY, AY_START, AY_END, datePct, daysBetween, fmt } from '../components/TermGraph'
import { supabase } from '../lib/supabaseClient'
import { fetchUserData, saveCashflowForecast, saveUserFinances, saveTermDates, saveBalanceHistory } from '../lib/api'
import { getCurrencySymbol, getGraphStart, setGraphStart } from '../lib/settings'
import { toLocalDate, makeOtherInstance, MONTH_KEY_TO_DATE, MONTH_SHORT, isInTerm, distributeEvenly } from '../lib/helpers'
import { analytics, DASHBOARD_EVENTS, getBalanceRange } from '../lib/analytics/index.js'
import {
    INITIAL_FORM_DATA,
    DEFAULT_LOAN_MONTHS,
    ALL_MONTH_KEYS,
    MONTH_LABELS,
} from '../config/onboardingConfig'
import MaintenanceLoanStep from './MaintenanceLoanStep'
import BursaryStep from './BursaryStep'
import FamilyFriendsStep from './FamilyFriendsStep'
import WorkIncomeStep from './WorkIncomeStep'
import OtherIncomeStep from './OtherIncomeStep'
import RentStep from './RentStep'
import BillsStep from './BillsStep'
import UniFeesStep from './UniFeesStep'
import SavingsInvestmentsStep from './SavingsInvestmentsStep'
import OtherExpenseStep from './OtherExpenseStep'
import WeeklySpendStep from './WeeklySpendStep'
import OneOffItemsStep from './OneOffItemsStep'

// Icons from onboarding
import incomeLoan from '../assets/income-loan.svg'
import incomeFamily from '../assets/income-family.svg'
import incomeFriends from '../assets/income-friends.svg'
import incomeWork from '../assets/income-work.svg'
import iconOtherIncome from '../assets/icon-other-income.svg'
import expenseRent from '../assets/expense-rent.svg'
import expenseBills from '../assets/expense-bills.svg'
import expenseUnifees from '../assets/expense-unifees.svg'
import expenseSavings from '../assets/expense-savings.svg'
import iconOtherExpense from '../assets/icon-other-expense.svg'

const STORAGE_KEY = 'budgeup_onboarding_state'

/* ---------- SOURCE CONFIGS ---------- */

const FIXED_INCOME_SOURCES = [
    { id: 'maintenance_loan', label: 'Maintenance Loan', icon: incomeLoan, panelId: 'maintenanceLoan', editable: true },
    { id: 'bursary', label: 'Bursary', icon: incomeFamily, panelId: 'bursary' },
    { id: 'family_friends', label: 'Family & Friends', icon: incomeFriends, panelId: 'familyFriends' },
    { id: 'work', label: 'Work', icon: incomeWork, panelId: 'work' },
]

const FIXED_EXPENSE_SOURCES = [
    { id: 'rent', label: 'Rent', icon: expenseRent, panelId: 'rent' },
    { id: 'bills', label: 'Bills & Utilities', icon: expenseBills, panelId: 'bills' },
    { id: 'uni_fees', label: 'University Fees', icon: expenseUnifees, panelId: 'uniFees' },
    { id: 'savings_investments', label: 'Savings & Investments', icon: expenseSavings, panelId: 'savingsInvestments' },
]

/* ---------- GRAPH EVENT HELPERS ---------- */

const MONTH_KEY_TO_DATE_MID = {
    september: '2025-09-15', october: '2025-10-15', november: '2025-11-15', december: '2025-12-15',
    january: '2026-01-15', february: '2026-02-15', march: '2026-03-15', april: '2026-04-15',
    may: '2026-05-15', june: '2026-06-15', july: '2026-07-15', august: '2026-08-15',
}

function generateRentDates(frequency, nextDate, formData = {}) {
    const dates = []
    const ayStart = AY_START
    const ayEnd = AY_END
    if (!frequency) return dates
    if (frequency === 'weekly') {
        let d = nextDate ? new Date(nextDate + 'T00:00:00') : new Date(AY_START)
        while (d > ayStart) d = new Date(d.getTime() - 7 * 24 * 60 * 60 * 1000)
        while (d < ayStart) d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
        while (d <= ayEnd) { dates.push(toLocalDate(d)); d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000) }
        return dates
    }
    if (frequency === 'termly') {
        const terms = formData.termDates?.terms || []
        const overrides = formData.rentTermDates || {}
        for (const term of terms) {
            const date = overrides[term.id] || term.start
            if (!date) continue
            const d = new Date(date + 'T00:00:00')
            if (d >= ayStart && d <= ayEnd) dates.push(date)
        }
        return dates
    }
    if (frequency === 'quarterly' && formData.rentQuarterlyDates) {
        for (const date of Object.values(formData.rentQuarterlyDates)) {
            if (!date) continue
            const d = new Date(date + 'T00:00:00')
            if (d >= ayStart && d <= ayEnd) dates.push(date)
        }
        dates.sort()
        return dates
    }
    let current = nextDate ? new Date(nextDate + 'T00:00:00') : new Date(AY_START)
    const dom = current.getDate()
    const step = frequency === 'quarterly' ? 3 : 1
    // Backtrack to before ayStart, preserving day-of-month
    while (current > ayStart) current = new Date(current.getFullYear(), current.getMonth() - step, dom)
    // Advance to first occurrence on or after ayStart
    while (current < ayStart) current = new Date(current.getFullYear(), current.getMonth() + step, dom)
    while (current <= ayEnd) {
        dates.push(toLocalDate(current))
        current = new Date(current.getFullYear(), current.getMonth() + step, dom)
    }
    return dates
}

// Distribute yearly total only among non-removed dates; removed dates keep original amount for display
function distributeExcludingRemoved(total, dates, editType, removedSet) {
    const activeDates = dates.filter(d => !removedSet.has(`${editType}:${d.date}`))
    const activeAmounts = distributeEvenly(total, activeDates.length)
    const originalAmounts = distributeEvenly(total, dates.length)
    let ai = 0
    return dates.map((d, i) => removedSet.has(`${editType}:${d.date}`) ? originalAmounts[i] : activeAmounts[ai++])
}

function buildGraphEvents(formData, { filterByGraphStart = true } = {}) {
    const events = []
    const terms = formData.termDates?.terms || []
    const removedSet = new Set(formData.removedEvents || [])

    // Maintenance loan
    if (formData.incomeSources?.includes('maintenance_loan')) {
        const months = formData.loanMonths || DEFAULT_LOAN_MONTHS
        const totalAmount = parseFloat(String(formData.loanAmount || '0').replace(/,/g, ''))
        let runningTotal = 0
        for (let mi = 0; mi < months.length; mi++) {
            const month = months[mi]
            const date = formData.loanDates?.[month] || MONTH_KEY_TO_DATE_MID[month]
            if (!date) continue
            const instalmentAmt = parseFloat(String(formData.instalmentAmounts?.[month] || '0').replace(/,/g, ''))
            let amount
            if (instalmentAmt > 0) {
                amount = instalmentAmt
            } else if (totalAmount > 0) {
                // Last instalment gets remainder to avoid rounding errors
                const perMonth = Math.round(totalAmount / months.length)
                amount = mi === months.length - 1 ? totalAmount - runningTotal : perMonth
            } else {
                amount = 0
            }
            if (amount <= 0) continue
            runningTotal += amount
            events.push({ date, amount, type: 'income', label: 'Loan Instalment', sublabel: `${MONTH_SHORT[month]} loan payment`, editType: 'loan', editMonth: month })
        }
    }

    // Bursary
    if (formData.incomeSources?.includes('bursary')) {
        const DEFAULT_BURSARY_MONTHS = ['october', 'february', 'march']
        const DEFAULT_BURSARY_DATES = { october: '2025-10-27', february: '2026-02-09', march: '2026-03-30' }
        const months = formData.bursaryMonths || DEFAULT_BURSARY_MONTHS
        const totalAmount = parseFloat(String(formData.bursaryAmount || '0').replace(/,/g, ''))
        let runningTotal = 0
        for (let mi = 0; mi < months.length; mi++) {
            const month = months[mi]
            const date = formData.bursaryDates?.[month] || DEFAULT_BURSARY_DATES[month] || MONTH_KEY_TO_DATE[month]
            if (!date) continue
            const instalmentAmt = parseFloat(String(formData.bursaryInstalmentAmounts?.[month] || '0').replace(/,/g, ''))
            let amount
            if (instalmentAmt > 0) {
                amount = instalmentAmt
            } else if (totalAmount > 0) {
                const perMonth = Math.round(totalAmount / months.length)
                amount = mi === months.length - 1 ? totalAmount - runningTotal : perMonth
            } else {
                amount = 0
            }
            if (amount <= 0) continue
            runningTotal += amount
            events.push({ date, amount, type: 'income', label: 'Bursary', sublabel: `${MONTH_SHORT[month]} bursary`, editType: 'bursary', editMonth: month })
        }
    }

    // Family/friends
    if (formData.incomeSources?.includes('family_friends')) {
        const famAmtRaw = parseFloat(String(formData.familyAmount || '0').replace(/,/g, ''))
        const freq = formData.familyFrequency || 'monthly'
        const famAmtPeriod = formData.familyAmountPeriod || freq || 'monthly'
        const isYearlyInput = famAmtPeriod === 'yearly'
        const onlyTermTime = isYearlyInput && formData.familyVariesByTerm
        if (famAmtRaw > 0 && freq) {
            const ayStart = AY_START, ayEnd = AY_END
            const YM = { weekly: 52, monthly: 12, quarterly: 4, termly: terms.length || 2, yearly: 1 }
            const yearlyTotal = famAmtRaw * (YM[famAmtPeriod] || 1)
            if (isYearlyInput) {
                // Collect all payment dates first, then distribute yearly total evenly
                const allDates = []
                if (freq === 'weekly') {
                    let d = formData.familyNextDate ? new Date(formData.familyNextDate + 'T00:00:00') : new Date(AY_START)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: 'Weekly support' }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (freq === 'monthly') {
                    let d = formData.familyNextDate ? new Date(formData.familyNextDate + 'T00:00:00') : new Date(AY_START)
                    const dom = d.getDate()
                    while (d > ayStart) d = new Date(d.getFullYear(), d.getMonth() - 1, dom)
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, dom)
                    while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} support` }); d = new Date(d.getFullYear(), d.getMonth() + 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = formData.familyTermDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) allDates.push({ date, sublabel: `${term.name} support` }) }
                } else if (freq === 'quarterly') {
                    const qDates = formData.familyQuarterlyDates || {}
                    const QD = ['2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01']
                    for (let i = 0; i < 4; i++) allDates.push({ date: qDates[i] || QD[i], sublabel: `Q${i + 1} support` })
                } else if (freq === 'yearly') {
                    allDates.push({ date: formData.familyNextDate || '2025-09-01', sublabel: 'Yearly support' })
                }
                const dates = onlyTermTime ? allDates.filter(d => isInTerm(d.date, terms)) : allDates
                if (dates.length > 0) {
                    const amounts = distributeExcludingRemoved(yearlyTotal, dates, 'family', removedSet)
                    for (let i = 0; i < dates.length; i++) {
                        events.push({ date: dates[i].date, amount: amounts[i], type: 'income', label: 'Family/Friends', sublabel: dates[i].sublabel, editType: 'family' })
                    }
                }
            } else {
                // Per-payment amount (amountPeriod === freq, exact — no rounding needed)
                const famNonTermAmt = formData.familyVariesByTerm ? parseFloat(String(formData.familyNonTermAmount || formData.familyAmount || '0').replace(/,/g, '')) : famAmtRaw
                const getFamAmt = (ds) => formData.familyVariesByTerm ? (isInTerm(ds, terms) ? famAmtRaw : famNonTermAmt) : famAmtRaw
                if (freq === 'weekly') {
                    let d = formData.familyNextDate ? new Date(formData.familyNextDate + 'T00:00:00') : new Date(AY_START)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) { const ds = toLocalDate(d); const a = getFamAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'income', label: 'Family/Friends', sublabel: 'Weekly support', editType: 'family' }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (freq === 'monthly') {
                    let d = formData.familyNextDate ? new Date(formData.familyNextDate + 'T00:00:00') : new Date(AY_START)
                    const dom = d.getDate()
                    while (d > ayStart) d = new Date(d.getFullYear(), d.getMonth() - 1, dom)
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, dom)
                    while (d <= ayEnd) { const ds = toLocalDate(d); const a = getFamAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'income', label: 'Family/Friends', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} support`, editType: 'family' }); d = new Date(d.getFullYear(), d.getMonth() + 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = formData.familyTermDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) events.push({ date, amount: famAmtRaw, type: 'income', label: 'Family/Friends', sublabel: `${term.name} support`, editType: 'family' }) }
                } else if (freq === 'quarterly') {
                    const qDates = formData.familyQuarterlyDates || {}
                    const QD = ['2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01']
                    for (let i = 0; i < 4; i++) { const date = qDates[i] || QD[i]; const a = getFamAmt(date); if (a > 0) events.push({ date, amount: a, type: 'income', label: 'Family/Friends', sublabel: `Q${i + 1} support`, editType: 'family' }) }
                }
            }
        }
    }

    // Work
    if (formData.incomeSources?.includes('work')) {
        const workAmt = parseFloat(String(formData.workAmount || '0').replace(/,/g, ''))
        const freq = formData.workFrequency || 'monthly'
        const workAmtPeriod = formData.workAmountPeriod || (formData.workEntryMode === 'yearly' ? 'yearly' : freq)
        const isYearlyWork = workAmtPeriod === 'yearly'
        const onlyTermTimeWork = isYearlyWork && formData.workVariesByTerm
        if (workAmt > 0 && freq) {
            const ayStart = AY_START, ayEnd = AY_END
            const YM = { weekly: 52, monthly: 12, quarterly: 4, termly: terms.length || 2, yearly: 1 }
            const yearlyWork = workAmt * (YM[workAmtPeriod] || 1)
            if (isYearlyWork) {
                const allDates = []
                if (freq === 'weekly') {
                    let d = formData.workNextDate ? new Date(formData.workNextDate + 'T00:00:00') : new Date(AY_START)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: 'Weekly income' }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (freq === 'monthly') {
                    let d = formData.workNextDate ? new Date(formData.workNextDate + 'T00:00:00') : new Date(AY_START)
                    const dom = d.getDate()
                    while (d > ayStart) d = new Date(d.getFullYear(), d.getMonth() - 1, dom)
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, dom)
                    while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} income` }); d = new Date(d.getFullYear(), d.getMonth() + 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = formData.workTermDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) allDates.push({ date, sublabel: `${term.name} income` }) }
                } else if (freq === 'quarterly') {
                    const qDates = formData.workQuarterlyDates || {}
                    const QD = ['2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01']
                    for (let i = 0; i < 4; i++) allDates.push({ date: qDates[i] || QD[i], sublabel: `Q${i + 1} income` })
                } else if (freq === 'yearly') {
                    allDates.push({ date: formData.workNextDate || '2025-09-01', sublabel: 'Yearly income' })
                }
                const dates = onlyTermTimeWork ? allDates.filter(d => isInTerm(d.date, terms)) : allDates
                if (dates.length > 0) {
                    const amounts = distributeExcludingRemoved(yearlyWork, dates, 'work', removedSet)
                    for (let i = 0; i < dates.length; i++) {
                        events.push({ date: dates[i].date, amount: amounts[i], type: 'income', label: 'Work', sublabel: dates[i].sublabel, editType: 'work' })
                    }
                }
            } else {
                const workNonTermAmt = formData.workVariesByTerm ? parseFloat(String(formData.workNonTermAmount || formData.workAmount || '0').replace(/,/g, '')) : workAmt
                const getWorkAmt = (ds) => formData.workVariesByTerm ? (isInTerm(ds, terms) ? workAmt : workNonTermAmt) : workAmt
                if (freq === 'weekly') {
                    let d = formData.workNextDate ? new Date(formData.workNextDate + 'T00:00:00') : new Date(AY_START)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) { const ds = toLocalDate(d); const a = getWorkAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'income', label: 'Work', sublabel: 'Weekly income', editType: 'work' }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (freq === 'monthly') {
                    let d = formData.workNextDate ? new Date(formData.workNextDate + 'T00:00:00') : new Date(AY_START)
                    const dom = d.getDate()
                    while (d > ayStart) d = new Date(d.getFullYear(), d.getMonth() - 1, dom)
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, dom)
                    while (d <= ayEnd) { const ds = toLocalDate(d); const a = getWorkAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'income', label: 'Work', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} income`, editType: 'work' }); d = new Date(d.getFullYear(), d.getMonth() + 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = formData.workTermDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) events.push({ date, amount: workAmt, type: 'income', label: 'Work', sublabel: `${term.name} income`, editType: 'work' }) }
                } else if (freq === 'quarterly') {
                    const qDates = formData.workQuarterlyDates || {}
                    const QD = ['2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01']
                    for (let i = 0; i < 4; i++) { const date = qDates[i] || QD[i]; const a = getWorkAmt(date); if (a > 0) events.push({ date, amount: a, type: 'income', label: 'Work', sublabel: `Q${i + 1} income`, editType: 'work' }) }
                } else if (freq === 'yearly') {
                    if (workAmt > 0) events.push({ date: formData.workNextDate || '2025-09-01', amount: workAmt, type: 'income', label: 'Work', sublabel: 'Yearly income', editType: 'work' })
                }
            }
        }
    }

    // Other income instances
    for (const inst of (formData.otherIncomes || [])) {
        if (!formData.incomeSources?.includes(inst.id)) continue
        const otherAmt = parseFloat(String(inst.amount || '0').replace(/,/g, ''))
        const freq = inst.frequency || 'monthly'
        const lbl = inst.label || 'Other Income'
        const otherAmtPeriod = inst.amountPeriod || freq || 'monthly'
        const isYearlyOther = otherAmtPeriod === 'yearly'
        const onlyTermTimeOther = isYearlyOther && inst.variesByTerm
        if (otherAmt > 0 && freq) {
            const ayStart = AY_START, ayEnd = AY_END
            const YM = { weekly: 52, monthly: 12, quarterly: 4, termly: terms.length || 2, yearly: 1 }
            const yearlyOther = otherAmt * (YM[otherAmtPeriod] || 1)
            if (isYearlyOther) {
                const allDates = []
                if (freq === 'weekly') {
                    let d = inst.nextDate ? new Date(inst.nextDate + 'T00:00:00') : new Date(AY_START)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: 'Weekly' }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (freq === 'monthly') {
                    let d = inst.nextDate ? new Date(inst.nextDate + 'T00:00:00') : new Date(AY_START)
                    const dom = d.getDate()
                    while (d > ayStart) d = new Date(d.getFullYear(), d.getMonth() - 1, dom)
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, dom)
                    while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })}` }); d = new Date(d.getFullYear(), d.getMonth() + 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = inst.termDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) allDates.push({ date, sublabel: `${term.name}` }) }
                } else if (freq === 'quarterly') {
                    const qDates = inst.quarterlyDates || {}
                    const QD = ['2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01']
                    for (let i = 0; i < 4; i++) allDates.push({ date: qDates[i] || QD[i], sublabel: `Q${i + 1}` })
                } else if (freq === 'yearly') {
                    allDates.push({ date: inst.nextDate || '2025-09-01', sublabel: 'Yearly income' })
                }
                const dates = onlyTermTimeOther ? allDates.filter(d => isInTerm(d.date, terms)) : allDates
                if (dates.length > 0) {
                    const amounts = distributeExcludingRemoved(yearlyOther, dates, inst.id, removedSet)
                    for (let i = 0; i < dates.length; i++) {
                        events.push({ date: dates[i].date, amount: amounts[i], type: 'income', label: lbl, sublabel: dates[i].sublabel, editType: inst.id })
                    }
                }
            } else {
                const otherNonTermAmt = inst.variesByTerm ? parseFloat(String(inst.nonTermAmount || inst.amount || '0').replace(/,/g, '')) : otherAmt
                const getOtherAmt = (ds) => inst.variesByTerm ? (isInTerm(ds, terms) ? otherAmt : otherNonTermAmt) : otherAmt
                if (freq === 'weekly') {
                    let d = inst.nextDate ? new Date(inst.nextDate + 'T00:00:00') : new Date(AY_START)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) { const ds = toLocalDate(d); const a = getOtherAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'income', label: lbl, sublabel: 'Weekly', editType: inst.id }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (freq === 'monthly') {
                    let d = inst.nextDate ? new Date(inst.nextDate + 'T00:00:00') : new Date(AY_START)
                    const dom = d.getDate()
                    while (d > ayStart) d = new Date(d.getFullYear(), d.getMonth() - 1, dom)
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, dom)
                    while (d <= ayEnd) { const ds = toLocalDate(d); const a = getOtherAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'income', label: lbl, sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })}`, editType: inst.id }); d = new Date(d.getFullYear(), d.getMonth() + 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = inst.termDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) events.push({ date, amount: otherAmt, type: 'income', label: lbl, sublabel: `${term.name}`, editType: inst.id }) }
                } else if (freq === 'quarterly') {
                    const qDates = inst.quarterlyDates || {}
                    const QD = ['2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01']
                    for (let i = 0; i < 4; i++) { const date = qDates[i] || QD[i]; const a = getOtherAmt(date); if (a > 0) events.push({ date, amount: a, type: 'income', label: lbl, sublabel: `Q${i + 1}`, editType: inst.id }) }
                } else if (freq === 'yearly') {
                    if (otherAmt > 0) events.push({ date: inst.nextDate || '2025-09-01', amount: otherAmt, type: 'income', label: lbl, sublabel: 'Yearly income', editType: inst.id })
                }
            }
        }
    }

    // Rent
    const rentAmt = parseFloat(String(formData.rentAmount || '0').replace(/,/g, ''))
    if (formData.expenseSources?.includes('rent') && rentAmt > 0) {
        const allRentDates = generateRentDates(formData.rentFrequency || 'monthly', formData.rentNextDate, formData)
        const rentDates = allRentDates.filter(d => {
            if (formData.rentStartDate && d < formData.rentStartDate) return false
            if (formData.rentEndDate && d > formData.rentEndDate) return false
            return true
        })
        const rentAmtPeriod = formData.rentAmountPeriod || (formData.rentEntryMode === 'yearly' ? 'yearly' : (formData.rentFrequency || 'monthly'))
        const isYearlyRent = rentAmtPeriod === 'yearly'
        const onlyTermTimeRent = isYearlyRent && formData.rentVariesByTerm
        const YM = { weekly: 52, monthly: 12, quarterly: 4, termly: terms.length || 2, yearly: 1 }
        const yearlyRent = rentAmt * (YM[rentAmtPeriod] || 1)
        if (isYearlyRent) {
            const filteredDates = onlyTermTimeRent ? rentDates.filter(d => isInTerm(d, terms)) : rentDates
            const rentDatesObj = filteredDates.map(d => ({ date: d }))
            const rentAmounts = distributeExcludingRemoved(yearlyRent, rentDatesObj, 'rent', removedSet)
            for (let ri = 0; ri < filteredDates.length; ri++) {
                const date = filteredDates[ri]; const dt = new Date(date + 'T00:00:00')
                events.push({ date, amount: rentAmounts[ri], type: 'expense', label: 'Rent', sublabel: `${dt.toLocaleDateString('en-GB', { month: 'long' })} rent`, editType: 'rent' })
            }
        } else {
            const rentNonTermAmt = formData.rentVariesByTerm ? parseFloat(String(formData.rentNonTermAmount || formData.rentAmount || '0').replace(/,/g, '')) : rentAmt
            const getRentAmt = (ds) => formData.rentVariesByTerm ? (isInTerm(ds, terms) ? rentAmt : rentNonTermAmt) : rentAmt
            for (let ri = 0; ri < rentDates.length; ri++) {
                const date = rentDates[ri]; const a = getRentAmt(date)
                if (a > 0) {
                    const dt = new Date(date + 'T00:00:00')
                    events.push({ date, amount: a, type: 'expense', label: 'Rent', sublabel: `${dt.toLocaleDateString('en-GB', { month: 'long' })} rent`, editType: 'rent' })
                }
            }
        }
    }

    // Bills
    const billsAmt = parseFloat(String(formData.billsAmount || '0').replace(/,/g, ''))
    if (formData.expenseSources?.includes('bills') && billsAmt > 0) {
        const freq = formData.billsFrequency || 'monthly'
        const billsAmtPeriod = formData.billsAmountPeriod || (formData.billsEntryMode === 'yearly' ? 'yearly' : freq)
        const isYearlyBills = billsAmtPeriod === 'yearly'
        const onlyTermTimeBills = isYearlyBills && formData.billsVariesByTerm
        const ayStart = AY_START, ayEnd = AY_END
        const billsInRange = (ds) => {
            if (formData.billsStartDate && ds < formData.billsStartDate) return false
            if (formData.billsEndDate && ds > formData.billsEndDate) return false
            return true
        }
        const YM = { weekly: 52, monthly: 12, quarterly: 4, termly: terms.length || 2, yearly: 1 }
        const yearlyBills = billsAmt * (YM[billsAmtPeriod] || 1)
        if (isYearlyBills) {
            const allDates = []
            if (freq === 'weekly') {
                let d = formData.billsNextDate ? new Date(formData.billsNextDate + 'T00:00:00') : new Date(AY_START)
                while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: 'Weekly bills' }); d = new Date(d.getTime() + 7 * 86400000) }
            } else if (freq === 'monthly') {
                let d = formData.billsNextDate ? new Date(formData.billsNextDate + 'T00:00:00') : new Date(AY_START)
                const dom = d.getDate()
                while (d > ayStart) d = new Date(d.getFullYear(), d.getMonth() - 1, dom)
                while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, dom)
                while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} bills` }); d = new Date(d.getFullYear(), d.getMonth() + 1, dom) }
            } else if (freq === 'termly') {
                const overrides = formData.billsTermDates || {}
                for (const term of terms) { const date = overrides[term.id] || term.start; if (date) allDates.push({ date, sublabel: `${term.name} bills` }) }
            } else if (freq === 'quarterly') {
                const qDates = formData.billsQuarterlyDates || {}
                const QD = ['2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01']
                for (let i = 0; i < 4; i++) allDates.push({ date: qDates[i] || QD[i], sublabel: `Q${i + 1} bills` })
            } else if (freq === 'yearly') {
                allDates.push({ date: formData.billsNextDate || '2025-09-01', sublabel: 'Yearly bills' })
            }
            const filteredBillsDates = (onlyTermTimeBills ? allDates.filter(d => isInTerm(d.date, terms)) : allDates).filter(d => billsInRange(d.date))
            if (filteredBillsDates.length > 0) {
                const amounts = distributeExcludingRemoved(yearlyBills, filteredBillsDates, 'bills', removedSet)
                for (let i = 0; i < filteredBillsDates.length; i++) {
                    events.push({ date: filteredBillsDates[i].date, amount: amounts[i], type: 'expense', label: 'Bills', sublabel: filteredBillsDates[i].sublabel, editType: 'bills' })
                }
            }
        } else {
            const billsNonTermAmt = formData.billsVariesByTerm ? parseFloat(String(formData.billsNonTermAmount || formData.billsAmount || '0').replace(/,/g, '')) : billsAmt
            const getBillsAmt = (ds) => formData.billsVariesByTerm ? (isInTerm(ds, terms) ? billsAmt : billsNonTermAmt) : billsAmt
            if (freq === 'weekly') {
                let d = formData.billsNextDate ? new Date(formData.billsNextDate + 'T00:00:00') : new Date(AY_START)
                while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                while (d <= ayEnd) { const dateString = toLocalDate(d); if (billsInRange(dateString)) { const a = getBillsAmt(dateString); if (a > 0) events.push({ date: dateString, amount: a, type: 'expense', label: 'Bills', sublabel: 'Weekly bills', editType: 'bills' }) }; d = new Date(d.getTime() + 7 * 86400000) }
            } else if (freq === 'monthly') {
                let d = formData.billsNextDate ? new Date(formData.billsNextDate + 'T00:00:00') : new Date(AY_START)
                const dom = d.getDate()
                while (d > ayStart) d = new Date(d.getFullYear(), d.getMonth() - 1, dom)
                while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, dom)
                while (d <= ayEnd) { const dateString = toLocalDate(d); if (billsInRange(dateString)) { const a = getBillsAmt(dateString); if (a > 0) events.push({ date: dateString, amount: a, type: 'expense', label: 'Bills', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} bills`, editType: 'bills' }) }; d = new Date(d.getFullYear(), d.getMonth() + 1, dom) }
            } else if (freq === 'termly') {
                const overrides = formData.billsTermDates || {}
                for (const term of terms) { const date = overrides[term.id] || term.start; if (date && billsInRange(date)) { const a = getBillsAmt(date); if (a > 0) events.push({ date, amount: a, type: 'expense', label: 'Bills', sublabel: `${term.name} bills`, editType: 'bills' }) } }
            } else if (freq === 'quarterly') {
                const qDates = formData.billsQuarterlyDates || {}
                const QD = ['2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01']
                for (let i = 0; i < 4; i++) { const date = qDates[i] || QD[i]; if (billsInRange(date)) { const a = getBillsAmt(date); if (a > 0) events.push({ date, amount: a, type: 'expense', label: 'Bills', sublabel: `Q${i + 1} bills`, editType: 'bills' }) } }
            } else if (freq === 'yearly') {
                const dateString = formData.billsNextDate || '2025-09-01'; if (billsInRange(dateString)) { const a = getBillsAmt(dateString); if (a > 0) events.push({ date: dateString, amount: a, type: 'expense', label: 'Bills', sublabel: 'Yearly bills', editType: 'bills' }) }
            }
        }
    }

    // University fees
    if (formData.expenseSources?.includes('uni_fees')) {
        const uniAmt = parseFloat(String(formData.uniFeesAmount || '0').replace(/,/g, ''))
        if (uniAmt > 0) {
            const uniAmtPeriod = formData.uniFeesAmountPeriod || 'yearly'
            const uniFreq = uniAmtPeriod === 'yearly' ? (formData.uniFeesFrequency || 'monthly') : uniAmtPeriod
            const isYearlyUni = uniAmtPeriod === 'yearly'
            const onlyTermTimeUni = isYearlyUni && formData.uniFeesVariesByTerm
            const ayStart = AY_START, ayEnd = AY_END
            const YM = { weekly: 52, monthly: 12, quarterly: 4, termly: terms.length || 2, yearly: 1 }
            const yearlyUni = uniAmt * (YM[uniAmtPeriod] || 1)
            if (isYearlyUni) {
                const allDates = []
                if (uniFreq === 'weekly') {
                    let d = formData.uniFeesNextDate ? new Date(formData.uniFeesNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: 'Weekly fees' }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (uniFreq === 'yearly') {
                    allDates.push({ date: formData.uniFeesNextDate || '2025-09-01', sublabel: 'Yearly tuition' })
                } else if (uniFreq === 'monthly') {
                    let d = formData.uniFeesNextDate ? new Date(formData.uniFeesNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    const dom = d.getDate()
                    while (d > ayStart) d = new Date(d.getFullYear(), d.getMonth() - 1, dom)
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, dom)
                    while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} fees` }); d = new Date(d.getFullYear(), d.getMonth() + 1, dom) }
                } else if (uniFreq === 'termly') {
                    const overrides = formData.uniFeesTermDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) allDates.push({ date, sublabel: `${term.name} fees` }) }
                } else if (uniFreq === 'quarterly') {
                    const qDates = formData.uniFeesQuarterlyDates || {}
                    const QD = ['2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01']
                    for (let i = 0; i < 4; i++) allDates.push({ date: qDates[i] || QD[i], sublabel: `Q${i + 1} fees` })
                }
                const filteredUniDates = onlyTermTimeUni ? allDates.filter(d => isInTerm(d.date, terms)) : allDates
                if (filteredUniDates.length > 0) {
                    const amounts = distributeExcludingRemoved(yearlyUni, filteredUniDates, 'uniFees', removedSet)
                    for (let i = 0; i < filteredUniDates.length; i++) {
                        events.push({ date: filteredUniDates[i].date, amount: amounts[i], type: 'expense', label: 'University Fees', sublabel: filteredUniDates[i].sublabel, editType: 'uniFees' })
                    }
                }
            } else {
                const uniNonTermAmt = formData.uniFeesVariesByTerm ? parseFloat(String(formData.uniFeesNonTermAmount || formData.uniFeesAmount || '0').replace(/,/g, '')) : uniAmt
                const getUniAmt = (ds) => formData.uniFeesVariesByTerm ? (isInTerm(ds, terms) ? uniAmt : uniNonTermAmt) : uniAmt
                if (uniFreq === 'weekly') {
                    let d = formData.uniFeesNextDate ? new Date(formData.uniFeesNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) { const ds = toLocalDate(d); const a = getUniAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'expense', label: 'University Fees', sublabel: 'Weekly fees', editType: 'uniFees' }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (uniFreq === 'yearly') {
                    const dateString = formData.uniFeesNextDate || '2025-09-01'; const a = getUniAmt(dateString); if (a > 0) events.push({ date: dateString, amount: a, type: 'expense', label: 'University Fees', sublabel: 'Yearly tuition', editType: 'uniFees' })
                } else if (uniFreq === 'monthly') {
                    let d = formData.uniFeesNextDate ? new Date(formData.uniFeesNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    const dom = d.getDate()
                    while (d > ayStart) d = new Date(d.getFullYear(), d.getMonth() - 1, dom)
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, dom)
                    while (d <= ayEnd) {
                        const dateString = toLocalDate(d); const a = getUniAmt(dateString)
                        if (a > 0) events.push({ date: dateString, amount: a, type: 'expense', label: 'University Fees', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} fees`, editType: 'uniFees' })
                        d = new Date(d.getFullYear(), d.getMonth() + 1, dom)
                    }
                } else if (uniFreq === 'termly') {
                    const overrides = formData.uniFeesTermDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) { const a = getUniAmt(date); if (a > 0) events.push({ date, amount: a, type: 'expense', label: 'University Fees', sublabel: `${term.name} fees`, editType: 'uniFees' }) } }
                } else if (uniFreq === 'quarterly') {
                    const qDates = formData.uniFeesQuarterlyDates || {}
                    const QD = ['2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01']
                    for (let i = 0; i < 4; i++) { const date = qDates[i] || QD[i]; const a = getUniAmt(date); if (a > 0) events.push({ date, amount: a, type: 'expense', label: 'University Fees', sublabel: `Q${i + 1} fees`, editType: 'uniFees' }) }
                }
            }
        }
    }

    // Savings & Investments
    if (formData.expenseSources?.includes('savings_investments')) {
        const savAmt = parseFloat(String(formData.savingsInvAmount || '0').replace(/,/g, ''))
        if (savAmt > 0) {
            const freq = formData.savingsInvFrequency || 'monthly'
            const savAmtPeriod = formData.savingsInvAmountPeriod || (formData.savingsInvEntryMode === 'yearly' ? 'yearly' : freq)
            const isYearlySav = savAmtPeriod === 'yearly'
            const onlyTermTimeSav = isYearlySav && formData.savingsInvVariesByTerm
            const ayStart = AY_START, ayEnd = AY_END
            const YM = { weekly: 52, monthly: 12, quarterly: 4, termly: terms.length || 2, yearly: 1 }
            const yearlySav = savAmt * (YM[savAmtPeriod] || 1)
            if (isYearlySav) {
                const allDates = []
                if (freq === 'weekly') {
                    let d = formData.savingsInvNextDate ? new Date(formData.savingsInvNextDate + 'T00:00:00') : new Date(AY_START)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: 'Weekly savings' }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (freq === 'monthly') {
                    let d = formData.savingsInvNextDate ? new Date(formData.savingsInvNextDate + 'T00:00:00') : new Date(AY_START)
                    const dom = d.getDate()
                    while (d > ayStart) d = new Date(d.getFullYear(), d.getMonth() - 1, dom)
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, dom)
                    while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: 'Monthly savings' }); d = new Date(d.getFullYear(), d.getMonth() + 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = formData.savingsInvTermDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) allDates.push({ date, sublabel: `${term.name} savings` }) }
                } else if (freq === 'quarterly') {
                    const qDates = formData.savingsInvQuarterlyDates || {}
                    const QD = ['2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01']
                    for (let i = 0; i < 4; i++) allDates.push({ date: qDates[i] || QD[i], sublabel: `Q${i + 1} savings` })
                } else if (freq === 'yearly') {
                    allDates.push({ date: formData.savingsInvNextDate || '2025-09-01', sublabel: 'Yearly savings' })
                }
                const filteredSavDates = onlyTermTimeSav ? allDates.filter(d => isInTerm(d.date, terms)) : allDates
                if (filteredSavDates.length > 0) {
                    const amounts = distributeExcludingRemoved(yearlySav, filteredSavDates, 'savingsInv', removedSet)
                    for (let i = 0; i < filteredSavDates.length; i++) {
                        events.push({ date: filteredSavDates[i].date, amount: amounts[i], type: 'expense', label: 'Savings', sublabel: filteredSavDates[i].sublabel, editType: 'savingsInv' })
                    }
                }
            } else {
                const savNonTermAmt = formData.savingsInvVariesByTerm ? parseFloat(String(formData.savingsInvNonTermAmount || formData.savingsInvAmount || '0').replace(/,/g, '')) : savAmt
                const getSavAmt = (ds) => formData.savingsInvVariesByTerm ? (isInTerm(ds, terms) ? savAmt : savNonTermAmt) : savAmt
                if (freq === 'weekly') {
                    let d = formData.savingsInvNextDate ? new Date(formData.savingsInvNextDate + 'T00:00:00') : new Date(AY_START)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) { const dateString = toLocalDate(d); const a = getSavAmt(dateString); if (a > 0) events.push({ date: dateString, amount: a, type: 'expense', label: 'Savings', sublabel: 'Weekly savings', editType: 'savingsInv' }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (freq === 'monthly') {
                    let d = formData.savingsInvNextDate ? new Date(formData.savingsInvNextDate + 'T00:00:00') : new Date(AY_START)
                    const dom = d.getDate()
                    while (d > ayStart) d = new Date(d.getFullYear(), d.getMonth() - 1, dom)
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, dom)
                    while (d <= ayEnd) { const dateString = toLocalDate(d); const a = getSavAmt(dateString); if (a > 0) events.push({ date: dateString, amount: a, type: 'expense', label: 'Savings', sublabel: 'Monthly savings', editType: 'savingsInv' }); d = new Date(d.getFullYear(), d.getMonth() + 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = formData.savingsInvTermDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) { const a = getSavAmt(date); if (a > 0) events.push({ date, amount: a, type: 'expense', label: 'Savings', sublabel: `${term.name} savings`, editType: 'savingsInv' }) } }
                } else if (freq === 'quarterly') {
                    const qDates = formData.savingsInvQuarterlyDates || {}
                    const QD = ['2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01']
                    for (let i = 0; i < 4; i++) { const dateString = qDates[i] || QD[i]; const a = getSavAmt(dateString); if (a > 0) events.push({ date: dateString, amount: a, type: 'expense', label: 'Savings', sublabel: `Q${i + 1} savings`, editType: 'savingsInv' }) }
                } else if (freq === 'yearly') {
                    const dateString = formData.savingsInvNextDate || '2025-09-01'; const a = getSavAmt(dateString); if (a > 0) events.push({ date: dateString, amount: a, type: 'expense', label: 'Savings', sublabel: 'Yearly savings', editType: 'savingsInv' })
                }
            }
        }
    }

    // Other expense instances
    for (const inst of (formData.otherExpenses || [])) {
        if (!formData.expenseSources?.includes(inst.id)) continue
        const otherExpAmt = parseFloat(String(inst.amount || '0').replace(/,/g, ''))
        const freq = inst.frequency || 'monthly'
        const lbl = inst.label || 'Other Expense'
        const otherExpAmtPeriod = inst.amountPeriod || freq
        const isYearlyOtherExp = otherExpAmtPeriod === 'yearly'
        const onlyTermTimeOtherExp = isYearlyOtherExp && inst.variesByTerm
        if (otherExpAmt > 0) {
            const ayStart = AY_START, ayEnd = AY_END
            const YM = { weekly: 52, monthly: 12, quarterly: 4, termly: terms.length || 2, yearly: 1 }
            const yearlyOtherExp = otherExpAmt * (YM[otherExpAmtPeriod] || 1)
            if (isYearlyOtherExp) {
                const allDates = []
                if (freq === 'weekly') {
                    let d = inst.nextDate ? new Date(inst.nextDate + 'T00:00:00') : new Date(AY_START)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: 'Weekly' }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (freq === 'monthly') {
                    let d = inst.nextDate ? new Date(inst.nextDate + 'T00:00:00') : new Date(AY_START)
                    const dom = d.getDate()
                    while (d > ayStart) d = new Date(d.getFullYear(), d.getMonth() - 1, dom)
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, dom)
                    while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: d.toLocaleDateString('en-GB', { month: 'long' }) }); d = new Date(d.getFullYear(), d.getMonth() + 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = inst.termDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) allDates.push({ date, sublabel: term.name }) }
                } else if (freq === 'yearly') {
                    allDates.push({ date: inst.nextDate || '2025-09-01', sublabel: 'Yearly expense' })
                }
                const filteredOtherExpDates = onlyTermTimeOtherExp ? allDates.filter(d => isInTerm(d.date, terms)) : allDates
                if (filteredOtherExpDates.length > 0) {
                    const amounts = distributeExcludingRemoved(yearlyOtherExp, filteredOtherExpDates, inst.id, removedSet)
                    for (let i = 0; i < filteredOtherExpDates.length; i++) {
                        events.push({ date: filteredOtherExpDates[i].date, amount: amounts[i], type: 'expense', label: lbl, sublabel: filteredOtherExpDates[i].sublabel, editType: inst.id })
                    }
                }
            } else {
                const otherExpNonTermAmt = inst.variesByTerm ? parseFloat(String(inst.nonTermAmount || inst.amount || '0').replace(/,/g, '')) : otherExpAmt
                const getOtherExpAmt = (ds) => inst.variesByTerm ? (isInTerm(ds, terms) ? otherExpAmt : otherExpNonTermAmt) : otherExpAmt
                if (freq === 'weekly') {
                    let d = inst.nextDate ? new Date(inst.nextDate + 'T00:00:00') : new Date(AY_START)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) { const dateString = toLocalDate(d); const a = getOtherExpAmt(dateString); if (a > 0) events.push({ date: dateString, amount: a, type: 'expense', label: lbl, sublabel: 'Weekly', editType: inst.id }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (freq === 'monthly') {
                    let d = inst.nextDate ? new Date(inst.nextDate + 'T00:00:00') : new Date(AY_START)
                    const dom = d.getDate()
                    while (d > ayStart) d = new Date(d.getFullYear(), d.getMonth() - 1, dom)
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, dom)
                    while (d <= ayEnd) { const dateString = toLocalDate(d); const a = getOtherExpAmt(dateString); if (a > 0) events.push({ date: dateString, amount: a, type: 'expense', label: lbl, sublabel: d.toLocaleDateString('en-GB', { month: 'long' }), editType: inst.id }); d = new Date(d.getFullYear(), d.getMonth() + 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = inst.termDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) { const a = getOtherExpAmt(date); if (a > 0) events.push({ date, amount: a, type: 'expense', label: lbl, sublabel: term.name, editType: inst.id }) } }
                } else if (freq === 'yearly') {
                    const dateString = inst.nextDate || '2025-09-01'; const a = getOtherExpAmt(dateString); if (a > 0) events.push({ date: dateString, amount: a, type: 'expense', label: lbl, sublabel: 'Yearly expense', editType: inst.id })
                }
            }
        }
    }

    // Weekly spend
    const weeklyAmt = parseFloat(String(formData.weeklySpend || '0').replace(/,/g, ''))
    const weeklyNonTermAmt = formData.weeklySpendVariesByTerm ? parseFloat(String(formData.weeklySpendNonTerm || '0').replace(/,/g, '')) : weeklyAmt
    if (weeklyAmt > 0 || weeklyNonTermAmt > 0) {
        const ayStart = AY_START, ayEnd = AY_END
        let d = new Date(ayStart)
        while (d.getDay() !== 1) d = new Date(d.getTime() + 86400000)
        while (d <= ayEnd) {
            const ds = toLocalDate(d)
            const amt = formData.weeklySpendVariesByTerm ? (isInTerm(ds, terms) ? weeklyAmt : weeklyNonTermAmt) : weeklyAmt
            if (amt > 0) events.push({ date: ds, amount: amt, type: 'expense', label: 'Weekly Spend', sublabel: 'Average weekly spending', editType: 'weeklySpend', noDot: true })
            d = new Date(d.getTime() + 7 * 86400000)
        }
    }

    // One-off items (skip hidden)
    for (const item of (formData.oneOffItems || [])) {
        if (item.hidden) continue
        const amt = parseFloat(String(item.amount || '0').replace(/,/g, ''))
        const isIn = (item.direction || 'out') === 'in'
        if (amt > 0 && item.date) events.push({ date: item.date, amount: amt, type: isIn ? 'income' : 'expense', label: item.name || 'One-off', sublabel: isIn ? 'One-off income' : 'One-off expense', editType: isIn ? 'oneOffIncome' : 'oneOffExpense' })
    }

    // Filter out events before graph start month (unless disabled for yearly totals)
    const graphStartMonth = getGraphStart().slice(0, 7) + '-01'
    const filtered = filterByGraphStart
        ? events.filter(e => e.date >= graphStartMonth)
        : events

    const removed = formData.removedEvents || []
    return filtered.map(e => {
        // One-off items are deleted from source array directly, not via removedEvents
        if (e.editType === 'oneOffIncome' || e.editType === 'oneOffExpense') return e
        return removed.includes(`${e.editType}:${e.date}`) ? { ...e, removed: true } : e
    })
}

/* ---------- YEARLY TOTAL HELPER ---------- */

function calcYearlyTotal(events, type) {
    return events.filter(e => e.type === type && !e.removed && !e.noDot).reduce((sum, e) => sum + e.amount, 0)
}

/* ---------- MONEY FORMAT ---------- */

function fmtAmount(val) {
    const sym = getCurrencySymbol()
    if (val >= 1000) { const k = val / 1000; const dec = Math.round(k * 10) % 10; return `${sym}${k.toFixed(dec === 0 ? 0 : 1)}k` }
    return `${sym}${Math.round(val).toLocaleString()}`
}

function formatDisplay(raw) {
    if (!raw) return ''
    const [whole, ...rest] = raw.split('.')
    const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return rest.length ? `${formatted}.${rest.join('.')}` : formatted
}

/* ---------- ICONS ---------- */

function ArrowUpCircle({ color = '#147b75' }) {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2" />
            <path d="M12 16V8M12 8L8 12M12 8L16 12" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

function ArrowDownCircle({ color = '#e06470' }) {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2" />
            <path d="M12 8V16M12 16L16 12M12 16L8 12" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

function RefreshIcon({ size = 12 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <path d="M1 4v6h6M23 20v-6h-6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

/* ---------- TOGGLE SWITCH ---------- */

function ToggleSwitch({ on, onChange, size = 'normal', activeColor = '#147b75' }) {
    const w = size === 'tiny' ? 24 : size === 'small' ? 36 : 44
    const h = size === 'tiny' ? 12 : size === 'small' ? 20 : 24
    const thumb = size === 'tiny' ? 9 : size === 'small' ? 16 : 20
    return (
        <button
            onClick={(e) => { e.stopPropagation(); onChange(!on) }}
            style={{
                width: w, height: h, borderRadius: h / 2,
                background: on ? activeColor : '#e0e0e0',
                border: 'none', cursor: 'pointer', padding: 0,
                position: 'relative', flexShrink: 0,
                transition: 'background 0.2s ease',
            }}
        >
            <div style={{
                width: thumb, height: thumb, borderRadius: thumb / 2,
                background: '#fff',
                position: 'absolute', top: (h - thumb) / 2,
                left: on ? w - thumb - 2 : 2,
                transition: 'left 0.2s ease',
            }} />
        </button>
    )
}

/* ---------- BALANCE PILL (inline editor) ---------- */

function BalancePill({ value, onSave, scrollContainerRef }) {
    const [expanded, setExpanded] = useState(false)
    const [raw, setRaw] = useState('')
    const [isNegative, setIsNegative] = useState(false)
    const inputRef = useRef(null)
    const containerRef = useRef(null)
    const sym = getCurrencySymbol()
    const balanceNum = parseFloat(String(value || '0').replace(/,/g, '')) || 0
    const hasBalance = value != null && value !== '' && value !== '0' && balanceNum !== 0

    const [pillRect, setPillRect] = useState(null)
    const handleOpen = () => {
        const n = parseFloat(String(value || '').replace(/,/g, ''))
        setIsNegative(n < 0)
        setRaw(isNaN(n) ? '' : new Intl.NumberFormat('en-GB').format(Math.abs(n)))
        // Capture pill position before expanding so we can render fixed overlay
        const rect = containerRef.current?.getBoundingClientRect()
        if (rect) setPillRect({ top: rect.top, left: rect.left })
        setExpanded(true)
    }

    const handleConfirm = () => {
        const n = parseFloat(String(raw || '0').replace(/,/g, ''))
        onSave(String(isNegative ? -Math.abs(n) : Math.abs(n)))
        setExpanded(false)
    }

    const handleChange = (e) => {
        let val = e.target.value.replace(/[^0-9.]/g, '')
        const parts = val.split('.')
        if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('')
        if (parts.length === 2 && parts[1].length > 2) {
            val = parts[0] + '.' + parts[1].slice(0, 2)
        }
        const [int, dec] = val.split('.')
        const formattedInt = int
            ? new Intl.NumberFormat('en-GB').format(Number(int))
            : ''
        setRaw(dec !== undefined ? `${formattedInt}.${dec}` : formattedInt)
    }

    const handleStep = (dir) => {
        const n = parseFloat(String(raw).replace(/,/g, '')) || 0
        const stepped = Math.max(0, Math.round((n + dir * 10) * 100) / 100)
        setRaw(new Intl.NumberFormat('en-GB').format(stepped))
    }

    useEffect(() => {
        if (!expanded) return
        const onPointerDown = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setExpanded(false)
            }
        }
        document.addEventListener('pointerdown', onPointerDown)
        return () => document.removeEventListener('pointerdown', onPointerDown)
    }, [expanded])

    const H = 39 // matches right column: 18 + 3 gap + 18
    const W = 160
    const ease = 'cubic-bezier(0.4, 0, 0.2, 1)'
    const dur = '0.2s'

    return (
        <div ref={containerRef} onTouchEnd={e => e.stopPropagation()} style={{ flexShrink: 0, height: H, position: 'relative', width: W }}>
            {/* Default view pill */}
            <button
                onClick={!expanded ? handleOpen : undefined}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: H,
                    borderRadius: 14,
                    border: 'none',
                    background: 'linear-gradient(135deg,#EC8C17,#F5A64A)',
                    padding: '0 14px 0 16px',
                    cursor: 'pointer',

                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,

                    whiteSpace: 'nowrap',
                    lineHeight: 0,

                    boxShadow: '0 3px 6px rgba(236,140,23,0.3)',

                    opacity: expanded ? 0 : 1,
                    transform: expanded ? 'scale(0.94)' : 'scale(1)',
                    transition: `opacity ${dur} ${ease}, transform ${dur} ${ease}`,
                    pointerEvents: expanded ? 'none' : 'auto',
                }}
            >
                <span
                    style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: '#fff',
                        fontFamily: 'Nunito, sans-serif',
                        lineHeight: '14px',
                        display: 'block'
                    }}
                >
                    {balanceNum < 0 ? '\u2212' : ''}
                    {sym}
                    {Math.abs(balanceNum).toLocaleString('en-GB', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    })}
                </span>

                <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                        flexShrink: 0,
                        display: 'block',
                        transform: 'translateZ(0)'
                    }}
                >
                    <path d="M23 4v5h-5" />
                    <path d="M1 20v-5h5" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 9" />
                    <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 15" />
                    <line x1="12" y1="9" x2="12" y2="15" strokeWidth="2" />
                    <line x1="9" y1="12" x2="15" y2="12" strokeWidth="2" />
                </svg>
            </button>
            {/* Edit view — rendered as fixed overlay to avoid iOS scroll glitch */}
            {expanded && pillRect && (
                <>
                    <div onClick={() => setExpanded(false)} style={{ position: 'fixed', inset: 0, zIndex: 1099 }} />
                    <div style={{
                        position: 'fixed',
                        top: pillRect.top,
                        left: pillRect.left,
                        width: W, height: H,
                        overflow: 'hidden', boxSizing: 'border-box',
                        display: 'flex', alignItems: 'center',
                        background: '#f0f0f0', borderRadius: 14,
                        zIndex: 1100,
                        animation: `balanceEditIn ${dur} ${ease}`,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px 0 6px' }}>
                            <button
                                onClick={() => setIsNegative(n => !n)}
                                style={{
                                    width: 20, height: 20, borderRadius: 5,
                                    cursor: 'pointer', background: '#e2e2e2',
                                    border: 'none', position: 'relative'
                                }}
                            >
                                {isNegative ? (
                                    <svg width="10" height="2" viewBox="0 0 10 2" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                                        <rect width="10" height="2" rx="1" fill="#e06470" />
                                    </svg>
                                ) : (
                                    <svg width="10" height="10" viewBox="0 0 10 10" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                                        <rect x="4" width="2" height="10" rx="1" fill="#147B75" />
                                        <rect y="4" width="10" height="2" rx="1" fill="#147B75" />
                                    </svg>
                                )}
                            </button>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#666', fontFamily: 'Nunito, sans-serif' }}>{sym}</span>
                            <input
                                ref={(el) => {
                                    inputRef.current = el
                                    if (el) {
                                        const sc = scrollContainerRef?.current
                                        const scrollBefore = sc ? sc.scrollTop : 0
                                        el.focus({ preventScroll: true })
                                        if (sc) {
                                            const pin = () => { sc.scrollTop = scrollBefore }
                                            pin()
                                            requestAnimationFrame(pin)
                                            setTimeout(pin, 50)
                                            setTimeout(pin, 150)
                                            setTimeout(pin, 300)
                                        }
                                    }
                                }}
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                step="any"
                                value={raw}
                                onChange={handleChange}
                                onKeyDown={e => e.key === 'Enter' && handleConfirm()}
                                style={{
                                    width: 55, border: 'none', background: 'transparent',
                                    fontSize: 16, fontWeight: 700,
                                    color: '#1a1a1a', fontFamily: 'Nunito, sans-serif', outline: 'none', padding: 0,
                                    MozAppearance: 'textfield', WebkitAppearance: 'none',
                                }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', paddingRight: 2 }}>
                            <button onClick={() => handleStep(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: 24, height: 16, position: 'relative' }}>
                                <ChevronUp size={12} strokeWidth={2} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'block' }} />
                            </button>
                            <button onClick={() => handleStep(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: 24, height: 16, position: 'relative' }}>
                                <ChevronDown size={12} strokeWidth={2} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'block' }} />
                            </button>
                        </div>
                        <button
                            onClick={handleConfirm}
                            style={{
                                background: '#EC8C17', border: 'none', cursor: 'pointer',
                                borderRadius: 8, width: 26, height: 26,
                                flexShrink: 0, position: 'relative'
                            }}
                        >
                            <Check size={14} strokeWidth={2.5} color="#fff" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'block' }} />
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}

/* ---------- INCOME/EXPENSE ROW ---------- */

function SourceRow({ source, active, yearlyAmount, removedCount, onRestoreRemoved, isExpense, expanded, onToggle, onExpandToggle, onDelete, scrollContainerRef, isTabSwitchingRef, formData, updateField, children }) {
    const isInactive = !active
    const rowRef = useRef(null)
    const innerRef = useRef(null)
    const [measuredHeight, setMeasuredHeight] = useState(0)
    const [settled, setSettled] = useState(!!expanded)
    const mountExpandedRef = useRef(!!expanded)
    const [deleting, setDeleting] = useState(false)
    const [amountFlash, setAmountFlash] = useState(false)
    const prevAmountRef = useRef(yearlyAmount)
    useEffect(() => {
        if (prevAmountRef.current !== yearlyAmount && prevAmountRef.current !== 0) {
            setAmountFlash(true)
            const t = setTimeout(() => setAmountFlash(false), 400)
            prevAmountRef.current = yearlyAmount
            return () => clearTimeout(t)
        }
        prevAmountRef.current = yearlyAmount
    }, [yearlyAmount])

    // Measure actual content height — useLayoutEffect to avoid flash
    useLayoutEffect(() => {
        if (expanded && innerRef.current) {
            setMeasuredHeight(innerRef.current.scrollHeight)
        }
    }, [expanded, children])

    // Mark as settled after expand animation completes, reset on collapse
    // Skip animation if mounted already expanded (e.g. tab switch restore)
    useLayoutEffect(() => {
        if (expanded) {
            if (mountExpandedRef.current) {
                mountExpandedRef.current = false
                setSettled(true)
                return
            }
            const timer = setTimeout(() => setSettled(true), 750)
            return () => clearTimeout(timer)
        } else {
            mountExpandedRef.current = false
            setSettled(false)
        }
    }, [expanded])

    // Keep measured height updated if content resizes while expanded
    useEffect(() => {
        if (!expanded || !innerRef.current) return
        const ro = new ResizeObserver(() => {
            if (innerRef.current) setMeasuredHeight(innerRef.current.scrollHeight)
        })
        ro.observe(innerRef.current)
        return () => ro.disconnect()
    }, [expanded])

    // Smooth scroll restoration when keyboard dismisses (input blur)
    useEffect(() => {
        if (!expanded) return
        const row = rowRef.current
        if (!row) return
        const onFocusOut = (e) => {
            // Only handle when focus leaves to nothing (keyboard dismissing)
            if (e.relatedTarget) return
            const sc = scrollContainerRef?.current
            if (!sc) return
            const scrollBefore = sc.scrollTop
            const prevOverflow = sc.style.overflow
            sc.style.overflow = 'hidden'
            const start = performance.now()
            const pin = () => {
                sc.scrollTop = scrollBefore
                if (performance.now() - start < 400) {
                    requestAnimationFrame(pin)
                } else {
                    sc.style.overflow = prevOverflow
                }
            }
            requestAnimationFrame(pin)
        }
        row.addEventListener('focusout', onFocusOut)
        return () => row.removeEventListener('focusout', onFocusOut)
    }, [expanded, scrollContainerRef])

    useEffect(() => {
        // Skip scroll-into-view during tab switch (scroll position is restored separately)
        if (isTabSwitchingRef?.current) return
        if (!expanded || !rowRef.current || !scrollContainerRef?.current) return
        const container = scrollContainerRef.current
        const row = rowRef.current
        const SHRINK_DIST = 92
        const GAP = 10

        const scrollRowToTop = () => {
            const stickyHeader = container.querySelector('[data-sticky-header]')
            const headerBottom = stickyHeader
                ? stickyHeader.getBoundingClientRect().bottom
                : container.getBoundingClientRect().top
            const rowTop = row.getBoundingClientRect().top
            const diff = rowTop - headerBottom - GAP
            if (Math.abs(diff) > 2) {
                container.scrollTo({
                    top: container.scrollTop + diff,
                    behavior: 'smooth',
                })
            }
        }

        // If graph isn't shrunk yet, shrink it first then scroll row
        if (container.scrollTop < SHRINK_DIST) {
            const DURATION = 400
            let rafId = null
            const startTime = performance.now()
            const startScrollTop = container.scrollTop

            const animate = () => {
                const elapsed = performance.now() - startTime
                const t = Math.min(1, elapsed / DURATION)
                const eased = 1 - Math.pow(1 - t, 2)
                container.scrollTop = startScrollTop + (SHRINK_DIST - startScrollTop) * eased
                if (t < 1) {
                    rafId = requestAnimationFrame(animate)
                } else {
                    requestAnimationFrame(scrollRowToTop)
                }
            }
            rafId = requestAnimationFrame(animate)
            return () => { if (rafId) cancelAnimationFrame(rafId) }
        }

        // Already scrolled past shrink — scroll row to top after layout settles
        const timer = setTimeout(scrollRowToTop, 50)
        return () => clearTimeout(timer)
    }, [expanded])

    return (
        <div ref={rowRef} data-source-row data-source-id={source.id} style={{
            border: deleting ? 'none' : '1px solid #f3f3f3',
            borderRadius: 10,
            background: isInactive ? '#f9f9f9' : '#fff',
            overflow: 'hidden',
            maxHeight: deleting ? 0 : 1000,
            opacity: deleting ? 0 : 1,
            marginBottom: deleting ? -10 : undefined,
            transition: deleting ? 'max-height 0.35s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.2s ease, margin-bottom 0.35s ease' : undefined,
        }}>
            {/* Tappable row */}
            <div
                onClick={onExpandToggle}
                style={{
                    display: 'flex', alignItems: 'center',
                    padding: '10px 14px',
                    gap: 12,
                    cursor: 'pointer',
                }}
            >
                {/* Icon */}
                <div style={{
                    width: 36, height: 36,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, opacity: isInactive ? 0.4 : 0.8,
                }}>
                    <img src={source.icon} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                </div>

                {/* Label + amount */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                        fontSize: 14, fontWeight: 600,
                        fontFamily: 'Nunito, sans-serif',
                        color: isInactive ? '#838383' : '#000',
                        margin: 0,
                    }}>{source.label}</p>
                    <p style={{
                        fontSize: 11, fontWeight: 600,
                        fontFamily: 'Nunito, sans-serif',
                        color: isInactive ? '#bbb' : isExpense ? 'rgba(224,100,112,0.8)' : 'rgba(20,123,117,0.7)',
                        margin: 0,
                    }}>
                        {`${getCurrencySymbol()}${yearlyAmount.toLocaleString()}/yr`}
                    </p>
                    {removedCount > 0 && expanded && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onRestoreRemoved?.() }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                background: 'none', border: 'none', padding: 0,
                                cursor: 'pointer', marginTop: 2,
                            }}
                        >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#e07b3c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.12-9.36L1 10" />
                            </svg>
                            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#e07b3c' }}>
                                {removedCount} payment{removedCount !== 1 ? 's' : ''} deleted — tap to restore
                            </span>
                        </button>
                    )}
                </div>

                {/* Eye toggle (hide/show on graph) + Chevron */}
                <button
                    onClick={(e) => { e.stopPropagation(); onToggle() }}
                    style={{
                        background: 'none', border: 'none', padding: 4,
                        cursor: 'pointer', display: 'flex', alignItems: 'center',
                        flexShrink: 0,
                    }}
                >
                    {active
                        ? <Eye size={16} strokeWidth={1.8} color={isExpense ? '#e06470' : '#147b75'} />
                        : <EyeOff size={16} strokeWidth={1.8} color="#ccc" />
                    }
                </button>
                <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke={isInactive ? '#bbb' : '#999'}
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{
                        flexShrink: 0,
                        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                >
                    <path d="M6 9l6 6 6-6" />
                </svg>
            </div>

            {/* Expanded section — animated height */}
            <div data-expand-content style={{
                maxHeight: expanded ? (measuredHeight + 50) || 800 : 0,
                opacity: settled ? 1 : expanded ? 1 : 0,
                overflow: 'hidden',
                transition: settled ? 'none' : `max-height ${expanded ? '0.7s' : '0.4s'} cubic-bezier(0.22, 0.61, 0.36, 1), opacity ${expanded ? '0.3s' : '0.2s'} ease`,
            }}>
                <div ref={innerRef}>
                    {children && (
                        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8, background: '#fafafa' }}>
                            {children}
                        </div>
                    )}
                    {onDelete && (
                        <div style={{ padding: '4px 10px 10px', textAlign: 'center', background: '#fafafa' }}>
                            <span
                                onClick={(e) => {
                                    e.stopPropagation()
                                    if (deleting) return
                                    setDeleting(true)
                                    setTimeout(() => onDelete(), 350)
                                }}
                                style={{
                                    fontSize: 10, fontWeight: 600,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: '#e06470', cursor: 'pointer',
                                }}
                            >
                                Delete {source.label.toLowerCase()}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

/* ---------- COMPACT MAINTENANCE LOAN EDITOR ---------- */

function CompactMaintenanceLoan({ formData, updateField }) {
    return (
        <div style={{ background: '#fafafa' }}>
            <MaintenanceLoanStep
                compact
                loanAmount={formData.loanAmount}
                updateLoanAmount={(val) => updateField('loanAmount', val)}
                loanMonths={formData.loanMonths}
                updateLoanMonths={(val) => updateField('loanMonths', val)}
                loanKnowDates={formData.loanKnowDates}
                updateLoanKnowDates={(val) => updateField('loanKnowDates', val)}
                loanDates={formData.loanDates}
                updateLoanDates={(val) => updateField('loanDates', val)}
                instalmentAmounts={formData.instalmentAmounts}
                updateInstalmentAmounts={(val) => updateField('instalmentAmounts', val)}
            />
        </div>
    )
}

/* ---------- MIGRATE LEGACY OTHER FIELDS TO ARRAYS ---------- */

function migrateOtherFields(data) {
    const d = { ...data }
    // Migrate legacy flat other_income fields to otherIncomes array
    if (!d.otherIncomes || d.otherIncomes.length === 0) {
        if (d.otherIncomeAmount || (d.incomeSources || []).includes('other_income')) {
            const inst = {
                id: 'oi_legacy',
                amount: d.otherIncomeAmount || '',
                frequency: d.otherIncomeFrequency || 'monthly',
                amountPeriod: d.otherIncomeAmountPeriod || d.otherIncomeFrequency || 'monthly',
                label: d.otherIncomeLabel || '',
                nextDate: d.otherIncomeNextDate || null,
                termDates: d.otherIncomeTermDates || {},
                quarterlyDates: d.otherIncomeQuarterlyDates || {},
                variesByTerm: d.otherIncomeVariesByTerm || false,
                nonTermAmount: d.otherIncomeNonTermAmount || '',
            }
            d.otherIncomes = [inst]
            // Replace 'other_income' with instance id in sources
            if (d.incomeSources?.includes('other_income')) {
                d.incomeSources = d.incomeSources.map(s => s === 'other_income' ? inst.id : s)
            }
        } else {
            d.otherIncomes = []
        }
    }
    // Migrate legacy flat other_expense fields to otherExpenses array
    if (!d.otherExpenses || d.otherExpenses.length === 0) {
        if (d.otherExpenseAmount || (d.expenseSources || []).includes('other_expense')) {
            const inst = {
                id: 'oe_legacy',
                amount: d.otherExpenseAmount || '',
                frequency: d.otherExpenseFrequency || 'monthly',
                amountPeriod: d.otherExpenseAmountPeriod || d.otherExpenseFrequency || 'monthly',
                label: d.otherExpenseLabel || '',
                nextDate: d.otherExpenseNextDate || null,
                termDates: d.otherExpenseTermDates || {},
                quarterlyDates: d.otherExpenseQuarterlyDates || {},
                variesByTerm: d.otherExpenseVariesByTerm || false,
                nonTermAmount: d.otherExpenseNonTermAmount || '',
            }
            d.otherExpenses = [inst]
            // Replace 'other_expense' with instance id in sources
            if (d.expenseSources?.includes('other_expense')) {
                d.expenseSources = d.expenseSources.map(s => s === 'other_expense' ? inst.id : s)
            }
        } else {
            d.otherExpenses = []
        }
    }
    return d
}

/* ---------- MAIN DASHBOARD ---------- */

export default function Dashboard() {
    const navigate = useNavigate()
    useSurveySequence()

    const [formData, setFormData] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY)
            if (saved) {
                const parsed = JSON.parse(saved)
                return migrateOtherFields({ ...INITIAL_FORM_DATA, ...parsed.formData })
            }
        } catch { /* ignore */ }
        return migrateOtherFields({ ...INITIAL_FORM_DATA })
    })

    const [graphKey, setGraphKey] = useState(0)
    const [hiddenSources, setHiddenSources] = useState(() => {
        try {
            const saved = localStorage.getItem('budgeup_hidden_sources')
            return saved ? new Set(JSON.parse(saved)) : new Set()
        } catch { return new Set() }
    })
    const [showBalanceHistory, setShowBalanceHistory] = useState(() => localStorage.getItem('budgeup_show_balance_history') !== 'false')
    const [showIncome, setShowIncome] = useState(() => localStorage.getItem('budgeup_show_income') === 'true')
    const [showExpenses, setShowExpenses] = useState(() => localStorage.getItem('budgeup_show_expenses') === 'true')
    const [showOverdraft, setShowOverdraft] = useState(() => localStorage.getItem('budgeup_show_overdraft') !== 'false')
    const [expandedSources, setExpandedSources] = useState(new Set())
    const [visibleExpandedSource, setVisibleExpandedSource] = useState(null)
    const [balanceToast, setBalanceToast] = useState(null)
    const balanceToastTimer = useRef(null)
    const [showInitialBalancePopup, setShowInitialBalancePopup] = useState(false)
    const [balanceBannerDismissing, setBalanceBannerDismissing] = useState(false)
    const [initialBalanceRaw, setInitialBalanceRaw] = useState('')
    const [initialBalanceNegative, setInitialBalanceNegative] = useState(false)
    const pendingExpandRef = useRef(null)

    // Toggle expanded source — multiple can be open at once
    const handleExpandToggle = useCallback((sourceId) => {
        if (pendingExpandRef.current) {
            clearTimeout(pendingExpandRef.current)
            pendingExpandRef.current = null
        }

        setExpandedSources(prev => {
            const next = new Set(prev)
            if (next.has(sourceId)) {
                next.delete(sourceId)
                // If collapsing the currently visible source, clear it
                setVisibleExpandedSource(v => v === sourceId ? null : v)
            } else {
                next.add(sourceId)
                // Set newly expanded as visible source for immediate graph highlight
                setVisibleExpandedSource(sourceId)
            }
            return next
        })
    }, [])
    const [activeTab, setActiveTabRaw] = useState(() => sessionStorage.getItem('budgeup_active_tab') || 'goals')
    const setActiveTab = (tab) => { sessionStorage.setItem('budgeup_active_tab', tab); setActiveTabRaw(tab) }
    const [goalsShowMore, setGoalsShowMore] = useState(false)
    const goalsMoreRef = useRef(null)
    const goalsTransCardRef = useRef(null)
    const tabScrollRef = useRef({})
    const tabExpandedRef = useRef({})
    const handleTabChange = (tab) => {
        if (tab !== activeTab) {
            analytics.track(DASHBOARD_EVENTS.TAB_SWITCHED, { tab })
        }
        const el = scrollRef.current
        if (!el) return
        const isCollapsed = el.scrollTop >= SHRINK_DIST

        // Tapping the already-active tab: toggle expanded/collapsed
        if (tab === activeTab) {
            if (isCollapsed) {
                el.style.overflowY = 'auto'
                setExpandedSources(new Set())
                tabExpandedRef.current[tab] = null
                animateScroll(el, 0)
            } else {
                animateScroll(el, SHRINK_DIST)
            }
            return
        }

        // Switching to different tab — save scroll position and expanded state
        tabExpandedRef.current[activeTab] = expandedSources
        tabScrollRef.current[activeTab] = el.scrollTop

        // Match current collapsed/expanded state when switching tabs
        const targetScroll = isCollapsed ? SHRINK_DIST : 0
        // Suppress snap/scroll handlers during tab switch
        isTabSwitchingRef.current = true
        isAnimatingRef.current = true
        if (snapTimerRef.current) clearTimeout(snapTimerRef.current)

        // Force graph to correct size immediately via DOM (survives React re-render)
        const targetCollapsed = targetScroll >= SHRINK_DIST
        if (graphContainerRef.current) {
            graphContainerRef.current.style.height = targetCollapsed ? `${MIN_H}px` : `${MAX_H}px`
        }
        if (contentWrapRef.current) {
            contentWrapRef.current.style.transform = targetCollapsed ? `translate3d(0,${SHRINK_DIST}px,0)` : 'translate3d(0,0,0)'
        }

        // Hide scroll container to prevent flash during tab switch
        el.style.visibility = 'hidden'

        // Clear cached DOM nodes before switching
        cachedNodesRef.current = null

        // Flush state updates synchronously so DOM is ready before next paint
        flushSync(() => {
            setActiveTab(tab)
            setExpandedSources(tabExpandedRef.current[tab] || new Set())
            setGoalsShowMore(false)
        })

        // Clear again after render so applyScrollStyles queries fresh DOM
        cachedNodesRef.current = null

        // Apply scroll immediately after synchronous render
        el.scrollTop = targetScroll
        applyScrollStyles(targetScroll)

        // Show on next frame once everything is in place
        requestAnimationFrame(() => {
            el.scrollTop = targetScroll
            applyScrollStyles(targetScroll)
            el.style.visibility = ''
            requestAnimationFrame(() => {
                el.scrollTop = targetScroll
                applyScrollStyles(targetScroll)
                setTimeout(() => {
                    el.scrollTop = targetScroll
                    applyScrollStyles(targetScroll)
                    isTabSwitchingRef.current = false
                    isAnimatingRef.current = false
                    if (snapTimerRef.current) { clearTimeout(snapTimerRef.current); snapTimerRef.current = null }
                }, 100)
            })
        })
    }
    const [editingEvent, setEditingEvent] = useState(null)
    const [editAmount, setEditAmount] = useState('')
    const [editingOverdraft, setEditingOverdraft] = useState(null)
    const [editOverdraftAmount, setEditOverdraftAmount] = useState('')
    const [balanceHistory, setBalanceHistory] = useState([])
    const originSetRef = useRef(false)
    const [dbLoaded, setDbLoaded] = useState(false)
    const saveTimerRef = useRef(null)
    const userIdRef = useRef(null)

    // Refresh graph start date on mount (picks up changes from Settings)
    useEffect(() => {
        refreshAY()
    }, [])

    // Re-sync from Supabase when tab becomes visible again
    useEffect(() => {
        const sync = async () => {
            if (document.hidden) return
            // Skip sync if there's a pending save (local data is ahead of server)
            if (saveTimerRef.current) return
            const userId = userIdRef.current
            if (!userId) return
            try {
                const result = await fetchUserData(userId)
                if (result.formData) {
                    const merged = migrateOtherFields({ ...INITIAL_FORM_DATA, ...result.formData })
                    // Prefer localStorage term dates (Settings saves there immediately, Supabase may lag)
                    try {
                        const saved = localStorage.getItem(STORAGE_KEY)
                        const parsed = saved ? JSON.parse(saved) : {}
                        if (parsed.formData?.termDates?.terms?.length) {
                            merged.termDates = parsed.formData.termDates
                        }
                        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, formData: merged }))
                    } catch { /* ignore */ }
                    setFormData(prev => {
                        if (JSON.stringify(prev) === JSON.stringify(merged)) return prev
                        return merged
                    })
                }
                if (result.balanceHistory) setBalanceHistory(result.balanceHistory)
                const bal = result.formData?.balance
                if (bal && bal !== '' && bal !== '0' && Number(bal) !== 0) {
                    originSetRef.current = true
                }
            } catch { /* ignore sync errors */ }
        }
        document.addEventListener('visibilitychange', sync)
        return () => {
            document.removeEventListener('visibilitychange', sync)
        }
    }, [])

    // Load data from Supabase on mount
    useEffect(() => {
        let cancelled = false
            ; (async () => {
                try {
                    const { data: { user } } = await supabase.auth.getUser()
                    if (!user || cancelled) return
                    userIdRef.current = user.id

                    const result = await fetchUserData(user.id)

                    // Sync graph start from database (source of truth), fallback to user's join date
                    if (result.profile?.graph_start) {
                        setGraphStart(result.profile.graph_start)
                        if (!localStorage.getItem('budgeup_graph_start_mode')) {
                            localStorage.setItem('budgeup_graph_start_mode', 'joined')
                        }
                        refreshAY()
                    } else if (!localStorage.getItem('budgeup_graph_start') && user.created_at) {
                        const d = new Date(user.created_at)
                        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                        setGraphStart(dateStr)
                        if (!localStorage.getItem('budgeup_graph_start_mode')) {
                            localStorage.setItem('budgeup_graph_start_mode', 'joined')
                        }
                        refreshAY()
                    }
                    if (cancelled) return
                    if (result.formData) {
                        // Supabase is the source of truth — prefer it over localStorage
                        const merged = migrateOtherFields({ ...INITIAL_FORM_DATA, ...result.formData })
                        // Prefer localStorage term dates (Settings saves there immediately, Supabase may lag)
                        try {
                            const saved = localStorage.getItem(STORAGE_KEY)
                            const parsed = saved ? JSON.parse(saved) : {}
                            if (parsed.formData?.termDates?.terms?.length) {
                                merged.termDates = parsed.formData.termDates
                            }
                            localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, formData: merged }))
                        } catch { /* ignore */ }
                        setFormData(merged)
                    }
                    if (result.balanceHistory) setBalanceHistory(result.balanceHistory)
                    // Mark origin as set if balance already exists
                    const bal = result.formData?.balance
                    if (bal && bal !== '' && bal !== '0' && Number(bal) !== 0) {
                        originSetRef.current = true
                    } else {
                        // No balance set — show mandatory popup
                        setShowInitialBalancePopup(true)
                    }
                    setDbLoaded(true)
                } catch (err) {
                    console.error('Failed to load from Supabase:', err)
                    setDbLoaded(true) // still mark loaded so localStorage data is used
                }
            })()
        return () => { cancelled = true }
    }, [])

    // Debounce save to Supabase when formData changes (after initial DB load)
    useEffect(() => {
        if (!dbLoaded || !userIdRef.current) return
        // Don't save if one-off items have amount but no name
        const invalidOneOff = (formData.oneOffItems || []).some(i => i.amount && !i.name?.trim())
        if (invalidOneOff) return
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(async () => {
            try {
                const userId = userIdRef.current
                await Promise.all([
                    saveCashflowForecast(userId, formData),
                    saveUserFinances(userId, {
                        university: formData.university,
                        overdraft: formData.overdraft,
                        savings: formData.savings,
                        weeklySpend: formData.weeklySpend,
                        weeklySpendNonTerm: formData.weeklySpendNonTerm,
                        weeklySpendVariesByTerm: formData.weeklySpendVariesByTerm,
                    }),
                    saveTermDates(userId, formData.termDates),
                ])
            } catch (err) {
                console.error('Failed to save to Supabase:', err)
            }
        }, 2000) // 2s debounce
        return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
    }, [formData, dbLoaded])

    // Shrink graph on scroll: 200 → 108 (direct DOM for smooth perf)
    const scrollRef = useRef(null)
    const graphContainerRef = useRef(null)
    const contentWrapRef = useRef(null)
    const stickyHeaderRef = useRef(null)
    const rafRef = useRef(null)
    const MAX_H = 206
    const MIN_H = 122
    const SHRINK_DIST = MAX_H - MIN_H

    // Keep graphHeight in state for TermGraph prop (initial only matters)
    // Initialize from saved scroll position so graph doesn't flash expanded then collapse
    const [graphHeight, setGraphHeight] = useState(() => {
        const saved = sessionStorage.getItem('budgeup_scroll_dashboard_' + (sessionStorage.getItem('budgeup_active_tab') || 'goals'))
        if (saved) {
            const pos = parseInt(saved, 10)
            if (pos > 0) {
                const t = Math.min(1, pos / (MAX_H - MIN_H))
                const ct = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
                return MAX_H - ct * (MAX_H - MIN_H)
            }
        }
        return MAX_H
    })
    const cardDetailsRef = useRef(null)
    const footerRef = useRef(null)

    // Cache DOM node references to avoid querySelectorAll on every scroll frame
    const cachedNodesRef = useRef(null)
    const getCachedNodes = useCallback(() => {
        if (cachedNodesRef.current) return cachedNodesRef.current
        if (!cardDetailsRef.current) return null
        cachedNodesRef.current = {
            details: cardDetailsRef.current.querySelectorAll('[data-card-detail]'),
            cards: cardDetailsRef.current.querySelectorAll('[data-card]'),
            headers: cardDetailsRef.current.querySelectorAll('[data-card-header]'),
        }
        return cachedNodesRef.current
    }, [])

    // Invalidate cached nodes when tab changes (cards re-render)
    useEffect(() => { cachedNodesRef.current = null }, [activeTab])

    const snapTimerRef = useRef(null)
    const isSnappingRef = useRef(false)
    const isTabSwitchingRef = useRef(false)
    const animFrameRef = useRef(null)
    const touchOnGraphRef = useRef(false)

    const ease = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
    const easeOut = (t) => 1 - Math.pow(1 - t, 3)

    const applyScrollStyles = useCallback((s) => {
        const t = Math.min(1, s / SHRINK_DIST)
        const ct = ease(t)
        const h = MAX_H - ct * (MAX_H - MIN_H)
        const offset = Math.min(s, SHRINK_DIST)

        if (graphContainerRef.current) {
            graphContainerRef.current.style.height = `${h}px`
        }
        // Use translate3d for GPU compositing — keeps content perfectly stable
        if (contentWrapRef.current) {
            contentWrapRef.current.style.transform = `translate3d(0,${offset}px,0)`
        }
        const nodes = getCachedNodes()
        if (nodes) {
            const detailScale = 1 - ct
            const detailOpacity = `${detailScale}`
            nodes.details.forEach(child => {
                child.style.transform = `scaleY(${detailScale})`
                child.style.opacity = detailOpacity
                child.style.overflow = 'hidden'
                child.style.transformOrigin = 'top'
                child.style.maxHeight = `${detailScale * 60}px`
            })
            const pad = `${10 - ct * 4}px ${12 - ct * 2}px`
            const borderR = `${10 - ct * 2}px`
            nodes.cards.forEach(card => {
                card.style.padding = pad
                card.style.borderRadius = borderR
            })
            const mb = `${detailScale * 6}px`
            nodes.headers.forEach(header => {
                header.style.marginBottom = mb
            })
        }
        if (footerRef.current) {
            const ft = ease(Math.min(1, t / 0.35))
            const footerScale = 1 - ft
            if (footerScale >= 0.999) {
                // Remove transform entirely so position:fixed children (BalancePill overlay) work correctly
                footerRef.current.style.transform = ''
                footerRef.current.style.transformOrigin = ''
                footerRef.current.style.maxHeight = ''
                footerRef.current.style.opacity = ''
                footerRef.current.style.overflow = ''
            } else {
                footerRef.current.style.transform = `scaleY(${footerScale})`
                footerRef.current.style.transformOrigin = 'top'
                footerRef.current.style.maxHeight = `${footerScale * 60}px`
                footerRef.current.style.opacity = `${footerScale}`
                footerRef.current.style.overflow = 'hidden'
            }
        }
        if (stickyHeaderRef.current) {
            const shadowOpacity = Math.min(0.08, t * 0.08)
            stickyHeaderRef.current.style.boxShadow = t > 0.05 ? `0 2px 8px rgba(0,0,0,${shadowOpacity})` : 'none'
            stickyHeaderRef.current.style.paddingBottom = `${10 - ct * 6}px`
        }
        if (cardDetailsRef.current) {
            cardDetailsRef.current.style.gap = `${10 - ct * 4}px`
            cardDetailsRef.current.style.paddingTop = `${25 - ct * 15}px`
        }
    }, [getCachedNodes])

    const animateScroll = useCallback((el, target, durationOverride, onComplete) => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
        const start = el.scrollTop
        const diff = target - start
        const dist = Math.abs(diff)
        if (dist < 1) { isAnimatingRef.current = false; onComplete?.(); return }
        // Duration proportional to distance: 120-220ms
        const duration = durationOverride ?? Math.max(120, Math.min(220, dist * 2.5))
        isAnimatingRef.current = true
        isSnappingRef.current = true
        const startTime = performance.now()
        const step = (now) => {
            const t = Math.min(1, (now - startTime) / duration)
            if (t >= 1) {
                // Final frame: use exact integer target to avoid sub-pixel snap
                el.scrollTop = target
                applyScrollStyles(target)
                animFrameRef.current = null
                isAnimatingRef.current = false
                isSnappingRef.current = false
                onComplete?.()
                return
            }
            const val = start + diff * easeOut(t)
            el.scrollTop = val
            applyScrollStyles(val)
            animFrameRef.current = requestAnimationFrame(step)
        }
        animFrameRef.current = requestAnimationFrame(step)
    }, [applyScrollStyles])

    const isAnimatingRef = useRef(false)

    const handleScroll = useCallback(() => {
        if (isAnimatingRef.current) return
        const el = scrollRef.current
        if (!el) return
        applyScrollStyles(el.scrollTop)
        sessionStorage.setItem('budgeup_scroll_dashboard_' + activeTab, String(el.scrollTop))

        // Detect which expanded source row is currently in view
        if (expandedSources.size > 0) {
            const rows = el.querySelectorAll('[data-source-row]')
            const stickyHeader = el.querySelector('[data-sticky-header]')
            const headerBottom = stickyHeader ? stickyHeader.getBoundingClientRect().bottom : el.getBoundingClientRect().top
            const containerBottom = el.getBoundingClientRect().bottom
            let best = null
            for (const row of rows) {
                const sourceId = row.dataset.sourceId
                if (!expandedSources.has(sourceId)) continue
                const rect = row.getBoundingClientRect()
                // Row is in view if any part of it is visible between header and container bottom
                if (rect.bottom > headerBottom && rect.top < containerBottom) {
                    best = sourceId
                    break
                }
            }
            setVisibleExpandedSource(best)
        } else {
            setVisibleExpandedSource(null)
        }
    }, [applyScrollStyles, activeTab, expandedSources])

    // Apply saved scroll position immediately on mount to prevent graph flash
    useLayoutEffect(() => {
        const saved = sessionStorage.getItem('budgeup_scroll_dashboard_' + activeTab)
        if (saved && scrollRef.current) {
            const pos = parseInt(saved, 10)
            if (pos > 0) {
                scrollRef.current.scrollTop = pos
                applyScrollStyles(pos)
            }
        }
    }, [])

    // Re-apply scroll position after data loads (content may have changed)
    useLayoutEffect(() => {
        if (!dbLoaded) return
        const saved = sessionStorage.getItem('budgeup_scroll_dashboard_' + activeTab)
        if (saved && scrollRef.current) {
            const pos = parseInt(saved, 10)
            if (pos > 0) {
                scrollRef.current.scrollTop = pos
                applyScrollStyles(pos)
            }
        }
    }, [dbLoaded])

    // Prevent scroll when swiping on graph (sticky header area)
    useEffect(() => {
        const header = stickyHeaderRef.current
        if (!header) return
        let touching = false
        const onTouchStart = () => { touching = true }
        const onTouchMove = (e) => {
            if (touching) {
                e.preventDefault()
            }
        }
        const onTouchEnd = () => { touching = false }
        header.addEventListener('touchstart', onTouchStart, { passive: true })
        header.addEventListener('touchmove', onTouchMove, { passive: false })
        header.addEventListener('touchend', onTouchEnd, { passive: true })
        return () => {
            header.removeEventListener('touchstart', onTouchStart)
            header.removeEventListener('touchmove', onTouchMove)
            header.removeEventListener('touchend', onTouchEnd)
        }
    }, [])

    // Snap graph to expanded or collapsed when scroll stops in the shrink zone
    useEffect(() => {
        const el = scrollRef.current
        if (!el) return
        let isTouching = false
        const snap = () => {
            if (isTouching || isSnappingRef.current || isAnimatingRef.current || isTabSwitchingRef.current) return
            const s = el.scrollTop
            if (s > 3 && s < SHRINK_DIST - 3) {
                // Expand if dragged past 40% of shrink distance
                const snapTo = s < SHRINK_DIST * 0.4 ? 0 : SHRINK_DIST
                animateScroll(el, snapTo)
            }
        }
        let wasAtShrink = false
        const onTouchStart = (e) => {
            isTouching = true
            wasAtShrink = el.scrollTop >= SHRINK_DIST - 3
            // Detect if touch started on graph (sticky header area)
            const header = stickyHeaderRef.current
            touchOnGraphRef.current = header && header.contains(e.target)
            // Cancel any pending snap
            if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
            isAnimatingRef.current = false
            isSnappingRef.current = false
        }
        let lastScrollTop = 0
        let lastScrollTime = 0
        const onTouchMove = () => {
            lastScrollTop = el.scrollTop
            lastScrollTime = performance.now()
        }
        const onTouchEnd = () => {
            isTouching = false
            touchOnGraphRef.current = false
            const s = el.scrollTop
            // If clearly stopped (no momentum), snap immediately
            if (s > 3 && s < SHRINK_DIST - 3) {
                // Check if there's likely momentum — if last scroll was very recent, wait for it
                const timeSinceScroll = performance.now() - lastScrollTime
                if (timeSinceScroll > 50) {
                    // No momentum, snap now
                    const snapTo = s < SHRINK_DIST * 0.4 ? 0 : SHRINK_DIST
                    animateScroll(el, snapTo)
                    return
                }
            }
            // Wait for momentum to settle, then snap
            if (snapTimerRef.current) clearTimeout(snapTimerRef.current)
            snapTimerRef.current = setTimeout(snap, 120)
        }
        const onScroll = () => {
            if (isTouching || isSnappingRef.current || isAnimatingRef.current || isTabSwitchingRef.current) return
            // If momentum carries from shrunk into shrink zone, snap to nearest
            if (wasAtShrink && el.scrollTop < SHRINK_DIST && el.scrollTop > 3) {
                const snapTo = el.scrollTop < SHRINK_DIST * 0.4 ? 0 : SHRINK_DIST
                animateScroll(el, snapTo)
                return
            }
            if (snapTimerRef.current) clearTimeout(snapTimerRef.current)
            snapTimerRef.current = setTimeout(snap, 100)
        }
        el.addEventListener('touchstart', onTouchStart, { passive: true })
        el.addEventListener('touchmove', onTouchMove, { passive: true })
        el.addEventListener('touchend', onTouchEnd, { passive: true })
        el.addEventListener('scroll', onScroll, { passive: true })
        return () => {
            el.removeEventListener('touchstart', onTouchStart)
            el.removeEventListener('touchmove', onTouchMove)
            el.removeEventListener('touchend', onTouchEnd)
            el.removeEventListener('scroll', onScroll)
            if (snapTimerRef.current) clearTimeout(snapTimerRef.current)
        }
    }, [])

    // Tap Home while already on Home → scroll to top to expand graph
    useEffect(() => {
        const handler = () => {
            const el = scrollRef.current
            if (!el) return
            if (el.scrollTop > 0) {
                animateScroll(el, 0, 300)
            }
        }
        window.addEventListener('nav-tap-again', handler)
        return () => window.removeEventListener('nav-tap-again', handler)
    }, [animateScroll])

    const freqView = 'Yearly'

    // Persist formData changes back to localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY)
            const parsed = saved ? JSON.parse(saved) : {}
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, formData }))
        } catch { /* ignore */ }
    }, [formData])

    const updateField = useCallback((key, value) => {
        setFormData(prev => ({ ...prev, [key]: value }))
    }, [])

    const terms = formData.termDates?.terms || []
    const originBalance = parseFloat(String(formData.balance || '0').replace(/,/g, ''))
    const overdraftNum = formData.overdraft ? parseFloat(String(formData.overdraft || '0').replace(/,/g, '')) : undefined

    // Projection balance (green line): anchored at formData.balance (set once on first recording)
    const projectionBalance = originBalance

    // Actual balance: latest balance_history entry, or formData.balance if no history
    const balanceNum = (() => {
        if (balanceHistory.length > 0) {
            return balanceHistory[0].balance
        }
        return originBalance
    })()

    // Build dynamic source lists from other instances
    const otherIncomes = formData.otherIncomes || []
    const otherExpenses = formData.otherExpenses || []
    const INCOME_SOURCES = [
        ...FIXED_INCOME_SOURCES,
        ...otherIncomes.map(inst => ({
            id: inst.id, label: inst.label || 'Other Regular Income', icon: iconOtherIncome,
            panelId: 'otherIncome', isOtherIncome: true,
        })),
    ]
    const EXPENSE_SOURCES = [
        ...FIXED_EXPENSE_SOURCES,
        ...otherExpenses.map(inst => ({
            id: inst.id, label: inst.label || 'Other Regular Expense', icon: iconOtherExpense,
            panelId: 'otherExpense', isOtherExpense: true,
        })),
    ]

    const events = buildGraphEvents(formData)
    // Build all events (ignoring source toggles) for computing yearly amounts when sources are off
    const allSourceIds = [...INCOME_SOURCES.map(s => s.id), ...EXPENSE_SOURCES.map(s => s.id)]
    const allEvents = buildGraphEvents({ ...formData, incomeSources: allSourceIds, expenseSources: allSourceIds }, { filterByGraphStart: false })

    // Calculate totals (fixed only — exclude one-off items)
    const fixedEvents = events.filter(e => e.editType !== 'oneOffIncome' && e.editType !== 'oneOffExpense')
    const yearlyIncome = calcYearlyTotal(fixedEvents, 'income')
    const yearlyExpense = calcYearlyTotal(fixedEvents, 'expense')
    const weeklySpendTotal = events.filter(e => e.editType === 'weeklySpend' && !e.removed).reduce((s, e) => s + e.amount, 0)
    const fixedNet = yearlyIncome - yearlyExpense

    // Count active sources
    const activeIncomeCount = (formData.incomeSources || []).length
    const activeExpenseCount = (formData.expenseSources || []).length

    // Frequency multipliers for display
    const freqMultiplier = { Weekly: 1 / 52, Monthly: 1 / 12, Termly: 1 / (terms.length || 2), Yearly: 1 }
    const displayNet = Math.round(fixedNet * freqMultiplier[freqView])
    const freqSuffix = { Weekly: '/wk', Monthly: '/mo', Termly: '/term', Yearly: '/yr' }

    // On-track: compare actual balance vs green line at today
    // Green line is anchored at projectionBalance at today (past events are walked backwards from it)
    // So green line value at today = projectionBalance, actual = balanceNum
    const projBal = parseFloat(String(projectionBalance || '0').replace(/,/g, '')) || 0
    const goalsData = (() => {
        const diff = balanceNum - projBal
        return { diff: Math.round(diff), isAhead: diff > 0, isOnTrack: Math.abs(diff) < 10 }
    })()

    // Calculate per-source yearly amounts
    const getSourceYearly = (editTypes) => {
        return allEvents.filter(e => editTypes.includes(e.editType) && !e.removed && !e.noDot).reduce((s, e) => s + e.amount, 0)
    }

    const getSourceRemovedCount = (editTypes) => {
        return allEvents.filter(e => editTypes.includes(e.editType) && e.removed && !e.noDot).length
    }

    const restoreSourceEvents = (editTypes) => {
        const removed = formData.removedEvents || []
        const keep = removed.filter(key => !editTypes.some(et => key.startsWith(et + ':')))
        updateField('removedEvents', keep)
    }

    // Check if a source has any data configured
    const sourceHasData = (sourceId) => {
        // Check other income/expense instances
        const otherInst = otherIncomes.find(i => i.id === sourceId) || otherExpenses.find(i => i.id === sourceId)
        if (otherInst) {
            return parseFloat(String(otherInst.amount || '0').replace(/,/g, '')) > 0
        }
        const amountFields = {
            maintenance_loan: 'loanAmount',
            bursary: 'bursaryAmount',
            family_friends: 'familyAmount',
            work: 'workAmount',
            rent: 'rentAmount',
            bills: 'billsAmount',
            uni_fees: 'uniFeesAmount',
            savings_investments: 'savingsInvAmount',
        }
        const field = amountFields[sourceId]
        if (!field) return false
        const val = parseFloat(String(formData[field] || '0').replace(/,/g, ''))
        return val > 0
    }

    // Determine which sources should be visible (have data OR are in active list)
    const isSourceVisible = (sourceId, sourcesList) => {
        return (sourcesList || []).includes(sourceId)
    }

    // Helper to update a field within an other income/expense instance
    const updateOtherInstance = (instId, field, value) => {
        setFormData(prev => {
            const isIncome = (prev.otherIncomes || []).some(i => i.id === instId)
            const key = isIncome ? 'otherIncomes' : 'otherExpenses'
            return {
                ...prev,
                [key]: (prev[key] || []).map(i => i.id === instId ? { ...i, [field]: value } : i),
            }
        })
    }

    const deleteSource = (sourceId, isExpense) => {
        analytics.track(DASHBOARD_EVENTS.SOURCE_REMOVED, {
            source_id: sourceId,
            source_type: isExpense ? 'expense' : 'income',
        })
        // Check if this is an other income/expense instance
        const isOtherIncome = otherIncomes.some(i => i.id === sourceId)
        const isOtherExpense = otherExpenses.some(i => i.id === sourceId)

        // Also remove from hiddenSources if present
        setHiddenSources(prev => {
            if (!prev.has(sourceId)) return prev
            const next = new Set(prev)
            next.delete(sourceId)
            localStorage.setItem('budgeup_hidden_sources', JSON.stringify([...next]))
            return next
        })

        // Remove from active list
        if (isExpense) {
            const sources = formData.expenseSources || []
            updateField('expenseSources', sources.filter(s => s !== sourceId))
        } else {
            const sources = formData.incomeSources || []
            updateField('incomeSources', sources.filter(s => s !== sourceId))
        }

        // For other instances, remove from the array
        if (isOtherIncome) {
            setFormData(prev => ({ ...prev, otherIncomes: (prev.otherIncomes || []).filter(i => i.id !== sourceId) }))
        } else if (isOtherExpense) {
            setFormData(prev => ({ ...prev, otherExpenses: (prev.otherExpenses || []).filter(i => i.id !== sourceId) }))
        } else {
            // Clear form data for fixed sources
            const clearFields = {
                maintenance_loan: { loanAmount: '', loanMonths: [...DEFAULT_LOAN_MONTHS], loanKnowDates: false, loanDates: {}, instalmentAmounts: {} },
                bursary: { bursaryAmount: '', bursaryMonths: undefined, bursaryDates: [...INITIAL_FORM_DATA.bursaryDates], bursaryInstalmentAmounts: {} },
                family_friends: { familyAmount: '', familyFrequency: 'monthly', familyNextDate: '', familyTermDates: {}, familyQuarterlyDates: {}, familyVariesByTerm: false, familyNonTermAmount: '', familyAmountPeriod: 'monthly' },
                work: { workAmount: '', workFrequency: 'monthly', workNextDate: '', workTermDates: {}, workQuarterlyDates: {}, workVariesByTerm: false, workNonTermAmount: '', workAmountPeriod: 'monthly', workEntryMode: 'yearly' },
                rent: { rentAmount: '', rentFrequency: 'monthly', rentNextDate: '', rentStartDate: '', rentEndDate: '', rentTermDates: {}, rentQuarterlyDates: {}, rentAmountPeriod: 'monthly', rentVariesByTerm: false, rentNonTermAmount: '', rentEntryMode: 'per_payment' },
                bills: { billsAmount: '', billsFrequency: 'monthly', billsNextDate: '', billsStartDate: '', billsEndDate: '', billsTermDates: {}, billsQuarterlyDates: {}, billsAmountPeriod: 'monthly', billsVariesByTerm: false, billsNonTermAmount: '', billsEntryMode: 'yearly' },
                uni_fees: { uniFeesAmount: '9250', uniFeesFrequency: 'yearly', uniFeesNextDate: '', uniFeesTermDates: {}, uniFeesQuarterlyDates: {}, uniFeesAmountPeriod: 'yearly', uniFeesVariesByTerm: false, uniFeesNonTermAmount: '', uniFeesEntryMode: 'yearly' },
                savings_investments: { savingsInvAmount: '', savingsInvFrequency: 'monthly', savingsInvNextDate: '', savingsInvTermDates: {}, savingsInvQuarterlyDates: {}, savingsInvAmountPeriod: 'monthly', savingsInvVariesByTerm: false, savingsInvNonTermAmount: '', savingsInvEntryMode: 'per_payment' },
            }
            const fields = clearFields[sourceId]
            if (fields) {
                for (const [key, val] of Object.entries(fields)) {
                    updateField(key, val)
                }
            }
        }
        if (expandedSources.has(sourceId)) {
            setExpandedSources(prev => { const n = new Set(prev); n.delete(sourceId); return n })
        }
        // After delete animation, scroll to the previous source row
        const container = scrollRef.current
        if (container) {
            const rows = Array.from(container.querySelectorAll('[data-source-row]'))
            const idx = rows.findIndex(r => r.dataset.sourceId === sourceId)
            const prevRow = idx > 0 ? rows[idx - 1] : null
            if (prevRow) {
                setTimeout(() => {
                    const stickyHeader = container.querySelector('[data-sticky-header]')
                    const headerH = stickyHeader ? stickyHeader.offsetHeight : 0
                    const containerTop = container.getBoundingClientRect().top + headerH
                    const rowTop = prevRow.getBoundingClientRect().top
                    const diff = rowTop - containerTop - 8
                    if (Math.abs(diff) > 2) {
                        container.scrollTo({ top: container.scrollTop + diff, behavior: 'smooth' })
                    }
                }, 400)
            }
        }
    }

    const [addingSourceType, setAddingSourceType] = useState(null) // 'income' | 'expense' | null
    const [pickerClosing, setPickerClosing] = useState(false)
    const addPickerScrollPos = useRef(null)

    const closeAddPicker = () => {
        // Animate dropdown out, then scroll back, then clean up markers
        setPickerClosing(true)
        const savedPos = addPickerScrollPos.current
        addPickerScrollPos.current = null
        const clearMarkers = () => {
            setExpandedSources(prev => {
                const next = new Set(prev)
                next.delete('__add_income__')
                next.delete('__add_expense__')
                return next
            })
        }
        setTimeout(() => {
            setAddingSourceType(null)
            setPickerClosing(false)
            // Scroll back first (spacer still present), then remove markers after
            if (savedPos != null && scrollRef.current) {
                requestAnimationFrame(() => {
                    const el = scrollRef.current
                    if (!el) return
                    const dist = Math.abs(el.scrollTop - savedPos)
                    animateScroll(el, savedPos, Math.max(350, Math.min(600, dist)), clearMarkers)
                })
            } else {
                clearMarkers()
            }
        }, 200)
    }

    const addSource = (sourceId, isExpense) => {
        analytics.track(DASHBOARD_EVENTS.SOURCE_ADDED, {
            source_id: sourceId,
            source_type: isExpense ? 'expense' : 'income',
        })
        addPickerScrollPos.current = null
        // Remove dropdown and expand source in same render to avoid layout jump
        setPickerClosing(false)
        setAddingSourceType(null)
        // "other_income" and "other_expense" create new instances
        if (sourceId === 'other_income') {
            const inst = makeOtherInstance('oi')
            setFormData(prev => ({
                ...prev,
                otherIncomes: [...(prev.otherIncomes || []), inst],
                incomeSources: [...(prev.incomeSources || []), inst.id],
            }))
            setExpandedSources(prev => new Set(prev).add(inst.id))
            return
        }
        if (sourceId === 'other_expense') {
            const inst = makeOtherInstance('oe')
            setFormData(prev => ({
                ...prev,
                otherExpenses: [...(prev.otherExpenses || []), inst],
                expenseSources: [...(prev.expenseSources || []), inst.id],
            }))
            setExpandedSources(prev => new Set(prev).add(inst.id))
            return
        }
        if (isExpense) {
            const sources = formData.expenseSources || []
            if (!sources.includes(sourceId)) {
                updateField('expenseSources', [...sources, sourceId])
            }
        } else {
            const sources = formData.incomeSources || []
            if (!sources.includes(sourceId)) {
                updateField('incomeSources', [...sources, sourceId])
            }
        }
        setExpandedSources(prev => new Set(prev).add(sourceId))
    }

    const toggleSourceVisibility = (id) => {
        setHiddenSources(prev => {
            const next = new Set(prev)
            const wasHidden = next.has(id)
            if (wasHidden) {
                next.delete(id)
            } else {
                next.add(id)
            }
            analytics.track(DASHBOARD_EVENTS.SOURCE_VISIBILITY_TOGGLED, {
                source_id: id,
                action: wasHidden ? 'shown' : 'hidden',
            })
            localStorage.setItem('budgeup_hidden_sources', JSON.stringify([...next]))
            return next
        })
    }

    // Map source ids to editTypes for yearly calc
    const incomeEditTypeMap = {
        maintenance_loan: ['loan'],
        bursary: ['bursary'],
        family_friends: ['family'],
        work: ['work'],
    }
    // Add dynamic other income entries (editType = instance id)
    for (const inst of otherIncomes) {
        incomeEditTypeMap[inst.id] = [inst.id]
    }
    const expenseEditTypeMap = {
        rent: ['rent'],
        bills: ['bills'],
        uni_fees: ['uniFees'],
        savings_investments: ['savingsInv'],
    }
    // Add dynamic other expense entries
    for (const inst of otherExpenses) {
        expenseEditTypeMap[inst.id] = [inst.id]
    }

    // Map expandedSources to currentEventType for dot highlighting
    // Only show dots when the expanded dropdown is actually visible in the scroll viewport
    const sourceToEditType = { ...incomeEditTypeMap, ...expenseEditTypeMap }
    const activeSource = visibleExpandedSource && expandedSources.has(visibleExpandedSource)
        ? visibleExpandedSource : null
    const currentEventType = activeSource && sourceToEditType[activeSource]
        ? sourceToEditType[activeSource][0]
        : null

    // Compute editTypes for upcoming transactions shown in goals "show more"
    const goalsVisibleEditTypes = (() => {
        if (!goalsShowMore || activeTab !== 'goals') return new Set()
        const now = new Date(); now.setHours(0, 0, 0, 0)
        const todayStr = toLocalDate(now)
        const lookAhead = new Date(now); lookAhead.setDate(lookAhead.getDate() + 90)
        const lookAheadStr = toLocalDate(lookAhead)
        const upcoming = events.filter(e => !e.removed && e.date > todayStr && e.date <= lookAheadStr && e.editType !== 'weeklySpend')
        const sorted = upcoming.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10)
        return new Set(sorted.map(e => e.editType))
    })()

    const handleEventClick = useCallback((evt, e) => {
        analytics.track(DASHBOARD_EVENTS.GRAPH_EVENT_CLICKED, {
            event_type: evt.type,
            edit_type: evt.editType,
        })
        const rect = e.currentTarget.getBoundingClientRect()
        setEditingEvent({ ...evt, clickX: rect.left + rect.width / 2, clickY: rect.top + rect.height / 2 })
        setEditAmount(String(evt.amount))
    }, [])

    const handleOverdraftClick = useCallback(({ clickX, clickY }) => {
        setEditingOverdraft({ clickX, clickY })
        setEditOverdraftAmount(String(overdraftNum || ''))
    }, [overdraftNum])

    return (
        <div style={{
            display: 'flex', flexDirection: 'column',
            height: '100%', background: '#fff',
            fontFamily: 'Nunito, sans-serif',
        }}>
            {/* Scrollable content */}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                style={{
                    flex: 1, overflowY: showInitialBalancePopup ? 'hidden' : 'auto', overflowX: 'hidden',
                    WebkitOverflowScrolling: 'touch',
                    overscrollBehavior: 'none',
                    paddingBottom: 'calc(260px + env(safe-area-inset-bottom))',
                }}
            >
                {/* Graph + tabs — sticky, shrinks on scroll */}
                <div data-sticky-header ref={stickyHeaderRef} style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', paddingTop: 16, paddingBottom: 10 }}>
                    {/* Balance entry banner — shown when no balance in user_profiles */}
                    {showInitialBalancePopup && (
                        <div style={{
                            margin: '0 16px 12px', padding: balanceBannerDismissing ? 0 : '14px 16px 16px',
                            background: '#fdf0f1', border: '1px solid #e06470',
                            borderRadius: 12,
                            animation: balanceBannerDismissing ? 'none' : 'fadeIn 0.3s ease',
                            maxHeight: balanceBannerDismissing ? 0 : 300,
                            opacity: balanceBannerDismissing ? 0 : 1,
                            overflow: 'hidden',
                            transition: 'max-height 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease, padding 0.35s cubic-bezier(0.4,0,0.2,1), margin 0.35s cubic-bezier(0.4,0,0.2,1)',
                            marginBottom: balanceBannerDismissing ? 0 : 12,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                                <AlertTriangle size={16} color="#e06470" strokeWidth={2.5} style={{ flexShrink: 0 }} />
                                <p style={{
                                    fontSize: 15, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
                                    color: '#c0392b', margin: 0,
                                }}>Enter your bank balance</p>
                            </div>
                            <p style={{
                                fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                                color: '#b03a2e', margin: '0 0 3px', lineHeight: 1.4,
                            }}>You need to enter your current bank balance before you can use the app.</p>
                            <p style={{
                                fontSize: 10, fontWeight: 500, fontFamily: 'Nunito, sans-serif',
                                color: '#c0928f', margin: '0 0 12px',
                            }}>Add up all your accounts — a rough estimate is fine. Don't include savings or overdraft.</p>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <button
                                    onClick={() => setInitialBalanceNegative(v => !v)}
                                    style={{
                                        background: initialBalanceNegative ? '#e06470' : '#147b75',
                                        color: '#fff',
                                        border: 'none', borderRadius: 8,
                                        width: 32, height: 40,
                                        fontSize: 18, fontWeight: 700,
                                        cursor: 'pointer', flexShrink: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontFamily: 'Nunito, sans-serif',
                                    }}
                                >
                                    {initialBalanceNegative ? '−' : '+'}
                                </button>
                                <div style={{
                                    display: 'flex', alignItems: 'center', flex: 1,
                                    background: '#fff', borderRadius: 8, border: '1px solid #e0c0c0',
                                    padding: '0 12px', height: 40, gap: 4,
                                }}>
                                    <span style={{
                                        fontSize: 15, fontWeight: 700, color: '#cba0a0', fontFamily: 'Nunito, sans-serif',
                                    }}>{getCurrencySymbol()}</span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="0.00"
                                        value={initialBalanceRaw}
                                        onChange={(e) => {
                                            let val = e.target.value.replace(/[^0-9.]/g, '')
                                            const parts = val.split('.')
                                            if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('')
                                            if (parts.length === 2 && parts[1].length > 2) val = parts[0] + '.' + parts[1].slice(0, 2)
                                            const [int, dec] = val.split('.')
                                            const formattedInt = int ? new Intl.NumberFormat('en-GB').format(Number(int)) : ''
                                            setInitialBalanceRaw(dec !== undefined ? `${formattedInt}.${dec}` : formattedInt)
                                        }}
                                        ref={(el) => {
                                            if (el) el.focus({ preventScroll: true })
                                        }}
                                        style={{
                                            flex: 1, border: 'none', background: 'transparent',
                                            fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                                            color: '#000', outline: 'none', padding: 0,
                                        }}
                                    />
                                </div>
                                <button
                                    onClick={async () => {
                                        const abs = parseFloat(String(initialBalanceRaw || '0').replace(/,/g, '')) || 0
                                        if (abs === 0) return
                                        const n = initialBalanceNegative ? -abs : abs
                                        const val = String(n)
                                        const today = toLocalDate(new Date())
                                        originSetRef.current = true
                                        updateField('balance', val)
                                        if (userIdRef.current) {
                                            saveUserFinances(userIdRef.current, {
                                                balance: val,
                                                university: formData.university,
                                                overdraft: formData.overdraft,
                                                savings: formData.savings,
                                                weeklySpend: formData.weeklySpend,
                                                weeklySpendNonTerm: formData.weeklySpendNonTerm,
                                                weeklySpendVariesByTerm: formData.weeklySpendVariesByTerm,
                                            })
                                            saveBalanceHistory(userIdRef.current, n)
                                        }
                                        analytics.track(DASHBOARD_EVENTS.BALANCE_RECORDED, {
                                            balance_range: getBalanceRange(n),
                                            is_first_recording: true,
                                            entry_method: 'initial_popup',
                                        })
                                        localStorage.setItem('budgeup_balance_last_date', today)
                                        setBalanceHistory(prev => {
                                            const entry = { balance: n, recorded_date: today, source: 'manual' }
                                            return [entry, ...prev]
                                        })
                                        // Animate shrink then remove
                                        setBalanceBannerDismissing(true)
                                        setTimeout(() => setShowInitialBalancePopup(false), 380)
                                    }}
                                    style={{
                                        height: 40, padding: '0 18px', border: 'none', borderRadius: 8,
                                        background: (parseFloat(String(initialBalanceRaw || '0').replace(/,/g, '')) || 0) === 0
                                            ? '#ddd' : '#e06470',
                                        cursor: (parseFloat(String(initialBalanceRaw || '0').replace(/,/g, '')) || 0) === 0
                                            ? 'not-allowed' : 'pointer',
                                        fontSize: 13, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
                                        color: '#fff', flexShrink: 0,
                                        boxShadow: (parseFloat(String(initialBalanceRaw || '0').replace(/,/g, '')) || 0) === 0
                                            ? 'none' : '0 2px 6px rgba(224,100,112,0.35)',
                                    }}
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    )}

                    <div style={{ position: 'relative', opacity: showInitialBalancePopup ? 0.35 : 1, pointerEvents: showInitialBalancePopup ? 'none' : 'auto' }}>
                        {!dbLoaded && (
                            <div style={{
                                position: 'absolute', inset: 0, zIndex: 20,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'rgba(255,255,255,0.6)',
                                borderRadius: 8,
                            }}>
                                <div style={{
                                    width: 20, height: 20, borderRadius: '50%',
                                    border: '2.5px solid #f0f0f0', borderTopColor: '#EC8C17',
                                    animation: 'spin 0.8s linear infinite',
                                }} />
                            </div>
                        )}
                        <TermGraph
                            key={graphKey}
                            graphHeight={graphHeight}
                            graphHeightRef={graphContainerRef}
                            marginTop={0}
                            terms={terms}
                            balance={projectionBalance || undefined}
                            balanceStartDate={getGraphStart()}
                            actualBalance={balanceNum}
                            overdraft={showOverdraft ? overdraftNum : undefined}
                            onOverdraftClick={handleOverdraftClick}
                            events={events}
                            hiddenEventTypes={[
                                ...(!showIncome ? ['loan', 'bursary', 'family', 'work', 'oneOffIncome', ...otherIncomes.map(i => i.id)] : []),
                                ...(!showExpenses ? ['rent', 'bills', 'uniFees', 'savingsInv', 'weeklySpend', 'oneOffExpense', ...otherExpenses.map(i => i.id)] : []),
                                // Per-source eye/hide toggles
                                ...[...hiddenSources].flatMap(id => {
                                    const allMaps = { ...incomeEditTypeMap, ...expenseEditTypeMap }
                                    return allMaps[id] || []
                                }),
                            ].filter(t => {
                                if (t === currentEventType) return false
                                if (activeTab === 'variable' && (t === 'oneOffIncome' || t === 'oneOffExpense')) return false
                                if (goalsVisibleEditTypes.has(t)) return false
                                return true
                            })}
                            balanceHiddenTypes={[...hiddenSources].flatMap(id => {
                                const allMaps = { ...incomeEditTypeMap, ...expenseEditTypeMap }
                                return allMaps[id] || []
                            })}
                            currentEventType={currentEventType}
                            onEventClick={handleEventClick}
                            activeEventDot={editingEvent}
                            balanceHistory={balanceHistory}
                            showBalanceHistory={showBalanceHistory}
                            footer={
                                <div ref={footerRef} style={{ padding: '8px 1px 6px' }}>
                                    {/* Row 1: Balance pill + toggle buttons */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginLeft: 10 }}>
                                        <BalancePill value={balanceNum} onSave={val => {
                                            const oldVal = balanceNum
                                            const newVal = parseFloat(String(val || '0').replace(/,/g, '')) || 0
                                            const today = toLocalDate(new Date())
                                            const lastRecorded = localStorage.getItem('budgeup_balance_last_date')
                                            const isUpdate = lastRecorded === today
                                            if (!originSetRef.current) {
                                                // First recording: set origin balance in user_profiles
                                                originSetRef.current = true
                                                updateField('balance', val)
                                            }
                                            // Always save to balance_history
                                            if (userIdRef.current) {
                                                saveBalanceHistory(userIdRef.current, newVal)
                                            }
                                            analytics.track(DASHBOARD_EVENTS.BALANCE_RECORDED, {
                                                balance_range: getBalanceRange(newVal),
                                                is_first_recording: !originSetRef.current,
                                                is_update: isUpdate,
                                                entry_method: 'balance_pill',
                                            })
                                            localStorage.setItem('budgeup_balance_last_date', today)
                                            // Update local balanceHistory immediately
                                            setBalanceHistory(prev => {
                                                const entry = { balance: newVal, recorded_date: today, source: 'manual' }
                                                const existing = prev.findIndex(e => e.recorded_date === today)
                                                if (existing >= 0) {
                                                    const updated = [...prev]
                                                    updated[existing] = { ...updated[existing], balance: newVal }
                                                    return updated
                                                }
                                                return [entry, ...prev]
                                            })
                                            if (oldVal !== newVal) {
                                                if (balanceToastTimer.current) clearTimeout(balanceToastTimer.current)
                                                setBalanceToast(isUpdate ? 'Updated today\u2019s balance' : 'Recorded balance for today')
                                                balanceToastTimer.current = setTimeout(() => setBalanceToast(null), 2500)
                                            }
                                        }} scrollContainerRef={scrollRef} />
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', width: 'fit-content', marginLeft: 'auto' }}>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button
                                                    onClick={() => setShowExpenses(prev => {
                                                        localStorage.setItem('budgeup_show_expenses', String(!prev))
                                                        return !prev
                                                    })}
                                                    style={{
                                                        background: showExpenses ? 'rgba(224,100,112,0.10)' : '#fafafa',
                                                        border: showExpenses ? '1px solid #e06470' : '1px solid #e6e6e6',
                                                        borderRadius: 16, cursor: 'pointer',
                                                        padding: '4px 7px',
                                                        display: 'flex', alignItems: 'center', gap: 4,
                                                        height: 20, transition: 'all 0.18s ease',
                                                        whiteSpace: 'nowrap',
                                                        boxShadow: showExpenses ? '0 1px 3px rgba(224,100,112,0.15)' : 'none'
                                                    }}
                                                >
                                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: showExpenses ? '#e06470' : '#cfcfcf', flexShrink: 0 }} />
                                                    <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: showExpenses ? '#e06470' : '#8f8f8f' }}>Expenses</span>
                                                </button>
                                                <button
                                                    onClick={() => setShowIncome(prev => {
                                                        localStorage.setItem('budgeup_show_income', String(!prev))
                                                        return !prev
                                                    })}
                                                    style={{
                                                        background: showIncome ? 'rgba(20,123,117,0.10)' : '#fafafa',
                                                        border: showIncome ? '1px solid #147b75' : '1px solid #e6e6e6',
                                                        borderRadius: 16, cursor: 'pointer',
                                                        padding: '4px 7px',
                                                        display: 'flex', alignItems: 'center', gap: 4,
                                                        height: 20, transition: 'all 0.18s ease',
                                                        whiteSpace: 'nowrap',
                                                        boxShadow: showIncome ? '0 1px 3px rgba(20,123,117,0.18)' : 'none'
                                                    }}
                                                >
                                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: showIncome ? '#147b75' : '#cfcfcf', flexShrink: 0 }} />
                                                    <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: showIncome ? '#147b75' : '#8f8f8f' }}>Income</span>
                                                </button>
                                            </div>
                                            <button
                                                onClick={() => setShowBalanceHistory(prev => {
                                                    analytics.track(DASHBOARD_EVENTS.BALANCE_HISTORY_TOGGLED, { visible: !prev })
                                                    localStorage.setItem('budgeup_show_balance_history', String(!prev))
                                                    return !prev
                                                })}
                                                style={{
                                                    background: showBalanceHistory ? 'rgba(236,140,23,0.10)' : '#fafafa',
                                                    border: showBalanceHistory ? '1px solid #EC8C17' : '1px solid #e6e6e6',
                                                    borderRadius: 16, cursor: 'pointer',
                                                    padding: '4px 7px',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                                    height: 20, transition: 'all 0.18s ease',
                                                    whiteSpace: 'nowrap',
                                                    alignSelf: 'stretch',
                                                    boxShadow: showBalanceHistory ? '0 1px 3px rgba(236,140,23,0.18)' : 'none'
                                                }}
                                            >
                                                <Clock size={10} strokeWidth={2.3} color={showBalanceHistory ? '#EC8C17' : '#b5b5b5'} style={{ flexShrink: 0 }} />
                                                <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: showBalanceHistory ? '#EC8C17' : '#8f8f8f' }}>Balance History</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            }
                        />
                    </div>

                    {/* Summary cards */}
                    <div ref={cardDetailsRef} style={{
                        display: 'flex', gap: 10,
                        padding: '25px 16px 0px',
                        opacity: showInitialBalancePopup ? 0.35 : 1,
                        pointerEvents: showInitialBalancePopup ? 'none' : 'auto',
                    }}>
                        {/* Fixed card */}
                        <div data-card onClick={() => handleTabChange('fixed')} style={{
                            flex: 1, borderRadius: 10,
                            cursor: 'pointer',
                            background: activeTab === 'fixed' ? '#fff' : '#f3f3f3',
                            borderTop: activeTab === 'fixed' ? '2px solid #EC8C17' : '1px solid #e0e0e0',
                            borderLeft: activeTab === 'fixed' ? '0.5px solid #EC8C17' : '1px solid #e0e0e0',
                            borderRight: activeTab === 'fixed' ? '0.5px solid #EC8C17' : '1px solid #e0e0e0',
                            borderBottom: activeTab === 'fixed' ? '0.5px solid #EC8C17' : '1px solid #e0e0e0',
                            boxShadow: activeTab === 'fixed' ? '0 4px 10px rgba(236,140,23,0.1)' : 'none',
                            padding: '10px 12px',
                            overflow: 'hidden',
                        }}>
                            <div data-card-header style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                    <rect x="3" y="4" width="18" height="18" rx="2" stroke={activeTab === 'fixed' ? '#000' : '#838383'} strokeWidth="2" />
                                    <path d="M16 2v4M8 2v4M3 10h18" stroke={activeTab === 'fixed' ? '#000' : '#838383'} strokeWidth="2" strokeLinecap="round" />
                                </svg>
                                <span style={{ fontSize: 11, fontWeight: 700, color: activeTab === 'fixed' ? '#000' : '#838383' }}>Regular</span>
                            </div>
                            <div data-card-detail style={{ overflow: 'hidden' }}>
                                <p style={{
                                    fontSize: 18, fontWeight: 700,
                                    color: fixedNet >= 0 ? '#147b75' : '#e06470',
                                    margin: '0 0 2px',
                                }}>
                                    {fixedNet >= 0 ? '+' : '-'}{fmtAmount(Math.abs(displayNet))}{freqSuffix[freqView]}
                                </p>
                                <p style={{
                                    fontSize: 9, fontWeight: 500, color: '#9f9c9c', margin: 0,
                                }}>{activeIncomeCount}{' '}income{' '}&bull;{' '}{activeExpenseCount}{' '}expense</p>
                            </div>
                        </div>

                        {/* Insights card (center) */}
                        <div data-card onClick={() => handleTabChange('goals')} style={{
                            flex: 1, borderRadius: 10,
                            cursor: 'pointer',
                            background: activeTab === 'goals' ? '#fff' : '#f3f3f3',
                            borderTop: activeTab === 'goals' ? '2px solid #EC8C17' : '1px solid #e0e0e0',
                            borderLeft: activeTab === 'goals' ? '0.5px solid #EC8C17' : '1px solid #e0e0e0',
                            borderRight: activeTab === 'goals' ? '0.5px solid #EC8C17' : '1px solid #e0e0e0',
                            borderBottom: activeTab === 'goals' ? '0.5px solid #EC8C17' : '1px solid #e0e0e0',
                            boxShadow: activeTab === 'goals' ? '0 4px 10px rgba(236,140,23,0.1)' : 'none',
                            padding: '10px 12px',
                            overflow: 'hidden',
                        }}>
                            <div data-card-header style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={activeTab === 'goals' ? '#000' : '#838383'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 18h6" />
                                    <path d="M10 22h4" />
                                    <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
                                </svg>
                                <span style={{ fontSize: 11, fontWeight: 700, color: activeTab === 'goals' ? '#000' : '#838383' }}>Insights</span>
                            </div>
                            <div data-card-detail style={{ overflow: 'hidden' }}>
                                <p style={{
                                    fontSize: 18, fontWeight: 700,
                                    color: goalsData.isOnTrack ? '#147b75' : goalsData.isAhead ? '#147b75' : '#e06470',
                                    margin: '0 0 2px',
                                }}>
                                    {!dbLoaded ? '—' : goalsData.isOnTrack ? 'On Track' : `${getCurrencySymbol()}${Math.abs(Math.round(goalsData.diff)).toLocaleString()} ${goalsData.isAhead ? 'ahead' : 'behind'}`}
                                </p>
                                <p style={{
                                    fontSize: 9, fontWeight: 500, color: '#9f9c9c', margin: 0,
                                }}>vs projected balance</p>
                            </div>
                        </div>

                        {/* Variable card */}
                        <div data-card onClick={() => handleTabChange('variable')} style={{
                            flex: 1, borderRadius: 10,
                            cursor: 'pointer',
                            background: activeTab === 'variable' ? '#fff' : '#f3f3f3',
                            borderTop: activeTab === 'variable' ? '2px solid #EC8C17' : '1px solid #e0e0e0',
                            borderLeft: activeTab === 'variable' ? '0.5px solid #EC8C17' : '1px solid #e0e0e0',
                            borderRight: activeTab === 'variable' ? '0.5px solid #EC8C17' : '1px solid #e0e0e0',
                            borderBottom: activeTab === 'variable' ? '0.5px solid #EC8C17' : '1px solid #e0e0e0',
                            boxShadow: activeTab === 'variable' ? '0 4px 10px rgba(236,140,23,0.1)' : 'none',
                            padding: '10px 12px',
                            overflow: 'hidden',
                        }}>
                            <div data-card-header style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                                <svg width="14" height="12" viewBox="0 0 24 20" fill="none">
                                    <path
                                        d="M1 17L5 9L10 13L15 5L23 14"
                                        stroke={activeTab === 'variable' ? '#000' : '#838383'}
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />                                </svg>
                                <span style={{ fontSize: 11, fontWeight: 700, color: activeTab === 'variable' ? '#000' : '#838383' }}>Variable</span>
                            </div>
                            <div data-card-detail style={{ overflow: 'hidden' }}>
                                <p style={{
                                    fontSize: 18, fontWeight: 700, color: parseFloat(formData.weeklySpend || '0') > 0 ? '#e06470' : '#147b75', margin: '0 0 2px',
                                }}>
                                    {parseFloat(formData.weeklySpend || '0') > 0 ? '-' : ''}{getCurrencySymbol()}{Math.round(parseFloat(formData.weeklySpend || '0'))}/wk
                                </p>
                                <p style={{
                                    fontSize: 9, fontWeight: 500, color: '#9f9c9c', margin: 0,
                                }}>
                                    {(() => {
                                        const count = (formData.oneOffItems || []).filter(i => i.name || i.amount).length
                                        return count > 0 ? `${count} one-off` : 'No one-offs'
                                    })()}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content below — held in place during graph shrink */}
                <div ref={contentWrapRef} style={{ willChange: 'transform', contain: 'layout style', minHeight: '60vh', opacity: showInitialBalancePopup ? 0.35 : 1, pointerEvents: showInitialBalancePopup ? 'none' : 'auto' }}>
                    <div>

                        {activeTab === 'fixed' && (<div>
                            {/* Regular Income Section */}
                            <div style={{ padding: '10px 16px 0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                    <ArrowUpCircle />
                                    <span style={{
                                        fontSize: 16, fontWeight: 700, color: '#000',
                                    }}>Regular Income</span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {INCOME_SOURCES.filter(source => isSourceVisible(source.id, formData.incomeSources)).map(source => {
                                        const active = !hiddenSources.has(source.id)
                                        const editTypes = incomeEditTypeMap[source.id] || []
                                        const yearly = getSourceYearly(editTypes)
                                        const removedCount = getSourceRemovedCount(editTypes)
                                        const isExpanded = expandedSources.has(source.id)

                                        return (
                                            <SourceRow
                                                key={source.id}
                                                source={source}
                                                active={active}
                                                yearlyAmount={yearly}
                                                removedCount={removedCount}
                                                onRestoreRemoved={() => restoreSourceEvents(editTypes)}
                                                expanded={isExpanded}
                                                onToggle={() => toggleSourceVisibility(source.id)}
                                                onExpandToggle={() => handleExpandToggle(source.id)}
                                                onDelete={() => deleteSource(source.id, false)}
                                                scrollContainerRef={scrollRef}
                                                isTabSwitchingRef={isTabSwitchingRef}
                                                formData={formData}
                                                updateField={updateField}
                                            >
                                                {source.id === 'maintenance_loan' && (
                                                    <CompactMaintenanceLoan formData={formData} updateField={updateField} />
                                                )}
                                                {source.id === 'bursary' && (
                                                    <BursaryStep compact
                                                        bursaryAmount={formData.bursaryAmount}
                                                        updateBursaryAmount={(val) => updateField('bursaryAmount', val)}
                                                        bursaryMonths={formData.bursaryMonths}
                                                        updateBursaryMonths={(val) => updateField('bursaryMonths', val)}
                                                        bursaryDates={formData.bursaryDates}
                                                        updateBursaryDates={(val) => updateField('bursaryDates', val)}
                                                        bursaryInstalmentAmounts={formData.bursaryInstalmentAmounts}
                                                        updateBursaryInstalmentAmounts={(val) => updateField('bursaryInstalmentAmounts', val)}
                                                    />
                                                )}
                                                {source.id === 'family_friends' && (
                                                    <FamilyFriendsStep compact
                                                        familyAmount={formData.familyAmount}
                                                        updateFamilyAmount={(val) => updateField('familyAmount', val)}
                                                        familyFrequency={formData.familyFrequency}
                                                        updateFamilyFrequency={(val) => updateField('familyFrequency', val)}
                                                        familyNextDate={formData.familyNextDate}
                                                        updateFamilyNextDate={(val) => updateField('familyNextDate', val)}
                                                        terms={formData.termDates?.terms || []}
                                                        familyTermDates={formData.familyTermDates}
                                                        updateFamilyTermDates={(val) => updateField('familyTermDates', val)}
                                                        familyQuarterlyDates={formData.familyQuarterlyDates}
                                                        updateFamilyQuarterlyDates={(val) => updateField('familyQuarterlyDates', val)}
                                                        familyVariesByTerm={formData.familyVariesByTerm}
                                                        updateFamilyVariesByTerm={(val) => updateField('familyVariesByTerm', val)}
                                                        familyNonTermAmount={formData.familyNonTermAmount}
                                                        updateFamilyNonTermAmount={(val) => updateField('familyNonTermAmount', val)}
                                                        familyAmountPeriod={formData.familyAmountPeriod}
                                                        updateFamilyAmountPeriod={(val) => updateField('familyAmountPeriod', val)}
                                                    />
                                                )}
                                                {source.id === 'work' && (
                                                    <WorkIncomeStep compact
                                                        workAmount={formData.workAmount}
                                                        updateWorkAmount={(val) => updateField('workAmount', val)}
                                                        workFrequency={formData.workFrequency}
                                                        updateWorkFrequency={(val) => updateField('workFrequency', val)}
                                                        workVariesByTerm={formData.workVariesByTerm}
                                                        updateWorkVariesByTerm={(val) => updateField('workVariesByTerm', val)}
                                                        workNonTermAmount={formData.workNonTermAmount}
                                                        updateWorkNonTermAmount={(val) => updateField('workNonTermAmount', val)}
                                                        workEntryMode={formData.workEntryMode}
                                                        updateWorkEntryMode={(val) => updateField('workEntryMode', val)}
                                                        workNextDate={formData.workNextDate}
                                                        updateWorkNextDate={(val) => updateField('workNextDate', val)}
                                                        terms={formData.termDates?.terms || []}
                                                        workTermDates={formData.workTermDates}
                                                        updateWorkTermDates={(val) => updateField('workTermDates', val)}
                                                        workQuarterlyDates={formData.workQuarterlyDates}
                                                        updateWorkQuarterlyDates={(val) => updateField('workQuarterlyDates', val)}
                                                        workAmountPeriod={formData.workAmountPeriod}
                                                        updateWorkAmountPeriod={(val) => updateField('workAmountPeriod', val)}
                                                    />
                                                )}
                                                {source.isOtherIncome && (() => {
                                                    const inst = otherIncomes.find(i => i.id === source.id)
                                                    if (!inst) return null
                                                    return (
                                                        <OtherIncomeStep compact
                                                            otherIncomeAmount={inst.amount}
                                                            updateOtherIncomeAmount={(val) => updateOtherInstance(inst.id, 'amount', val)}
                                                            otherIncomeFrequency={inst.frequency}
                                                            updateOtherIncomeFrequency={(val) => updateOtherInstance(inst.id, 'frequency', val)}
                                                            otherIncomeLabel={inst.label}
                                                            updateOtherIncomeLabel={(val) => {
                                                                updateOtherInstance(inst.id, 'label', val)
                                                            }}
                                                            otherIncomeNextDate={inst.nextDate}
                                                            updateOtherIncomeNextDate={(val) => updateOtherInstance(inst.id, 'nextDate', val)}
                                                            terms={formData.termDates?.terms || []}
                                                            otherIncomeTermDates={inst.termDates}
                                                            updateOtherIncomeTermDates={(val) => updateOtherInstance(inst.id, 'termDates', val)}
                                                            otherIncomeVariesByTerm={inst.variesByTerm}
                                                            updateOtherIncomeVariesByTerm={(val) => updateOtherInstance(inst.id, 'variesByTerm', val)}
                                                            otherIncomeNonTermAmount={inst.nonTermAmount}
                                                            updateOtherIncomeNonTermAmount={(val) => updateOtherInstance(inst.id, 'nonTermAmount', val)}
                                                            otherIncomeAmountPeriod={inst.amountPeriod}
                                                            updateOtherIncomeAmountPeriod={(val) => updateOtherInstance(inst.id, 'amountPeriod', val)}
                                                            otherIncomeQuarterlyDates={inst.quarterlyDates}
                                                            updateOtherIncomeQuarterlyDates={(val) => updateOtherInstance(inst.id, 'quarterlyDates', val)}
                                                        />
                                                    )
                                                })()}
                                            </SourceRow>
                                        )
                                    })}

                                    {/* Add income button + picker */}
                                    {(() => {
                                        const hiddenFixed = FIXED_INCOME_SOURCES.filter(s => !isSourceVisible(s.id, formData.incomeSources))
                                        // Always allow adding "Other" (multiple instances)
                                        const pickerOptions = [
                                            ...hiddenFixed,
                                            { id: 'other_income', label: 'Other Regular Income', icon: iconOtherIncome },
                                        ]
                                        return (
                                            <div style={{ position: 'relative' }}>
                                                <button
                                                    onClick={(e) => {
                                                        const opening = addingSourceType !== 'income'
                                                        if (opening) {
                                                            addPickerScrollPos.current = scrollRef.current?.scrollTop ?? null
                                                            setAddingSourceType('income')
                                                            setExpandedSources(prev => new Set(prev).add('__add_income__'))
                                                            const btn = e.currentTarget.parentElement
                                                            const container = scrollRef.current
                                                            if (btn && container) {
                                                                requestAnimationFrame(() => requestAnimationFrame(() => {
                                                                    const stickyHeader = container.querySelector('[data-sticky-header]')
                                                                    const headerH = stickyHeader ? stickyHeader.offsetHeight : 0
                                                                    const containerTop = container.getBoundingClientRect().top + headerH
                                                                    const btnTop = btn.getBoundingClientRect().top
                                                                    const SHRINK = MAX_H - MIN_H
                                                                    const btnOffset = container.scrollTop + (btnTop - containerTop) - 8
                                                                    // If graph will collapse during scroll, content shifts up by SHRINK
                                                                    const graphWillCollapse = container.scrollTop < SHRINK && btnOffset > SHRINK
                                                                    const target = Math.max(SHRINK, graphWillCollapse ? btnOffset - SHRINK : btnOffset)
                                                                    animateScroll(container, target, 400)
                                                                }))
                                                            }
                                                        } else {
                                                            closeAddPicker()
                                                        }
                                                    }}
                                                    style={{
                                                        width: '100%', height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                        border: '1px solid #e0e0e0', borderRadius: 10,
                                                        background: 'none', cursor: 'pointer',
                                                        fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#147b75',
                                                    }}
                                                >
                                                    <span style={{ fontSize: 20, lineHeight: 1, marginTop: -1 }}>+</span>
                                                    Add regular income
                                                </button>
                                                {addingSourceType === 'income' && (<>
                                                    <div onClick={closeAddPicker} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
                                                    <div style={{
                                                        marginTop: 6, borderRadius: 10, border: '1px solid #f0f0f0',
                                                        background: '#fff', overflow: 'hidden',
                                                        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                                                        position: 'relative', zIndex: 51,
                                                        animation: pickerClosing ? 'pickerSlideUp 0.2s ease forwards' : 'pickerSlideDown 0.25s ease',
                                                    }}>
                                                        {pickerOptions.map(source => (
                                                            <button
                                                                key={source.id}
                                                                onClick={() => addSource(source.id, false)}
                                                                style={{
                                                                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                                                    padding: '11px 14px', border: 'none', borderBottom: '1px solid #f5f5f5',
                                                                    background: 'none', cursor: 'pointer', textAlign: 'left',
                                                                }}
                                                            >
                                                                <img src={source.icon} alt="" style={{ width: 24, height: 24, objectFit: 'contain', opacity: 0.7 }} />
                                                                <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#333' }}>
                                                                    {source.label}
                                                                </span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </>)}
                                            </div>
                                        )
                                    })()}
                                </div>
                            </div>

                            {/* Regular Expenses Section */}
                            <div style={{ padding: '40px 16px 0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                    <ArrowDownCircle />
                                    <span style={{
                                        fontSize: 16, fontWeight: 700, color: '#000',
                                    }}>Regular Expenses</span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {EXPENSE_SOURCES.filter(source => isSourceVisible(source.id, formData.expenseSources)).map(source => {
                                        const active = !hiddenSources.has(source.id)
                                        const editTypes = expenseEditTypeMap[source.id] || []
                                        const yearly = getSourceYearly(editTypes)
                                        const removedCount = getSourceRemovedCount(editTypes)

                                        return (
                                            <SourceRow
                                                key={source.id}
                                                source={source}
                                                active={active}
                                                yearlyAmount={yearly}
                                                removedCount={removedCount}
                                                onRestoreRemoved={() => restoreSourceEvents(editTypes)}
                                                isExpense
                                                expanded={expandedSources.has(source.id)}
                                                onToggle={() => toggleSourceVisibility(source.id)}
                                                onExpandToggle={() => handleExpandToggle(source.id)}
                                                onDelete={() => deleteSource(source.id, true)}
                                                scrollContainerRef={scrollRef}
                                                isTabSwitchingRef={isTabSwitchingRef}
                                                formData={formData}
                                                updateField={updateField}
                                            >
                                                {source.id === 'rent' && (
                                                    <RentStep compact
                                                        rentAmount={formData.rentAmount}
                                                        updateRentAmount={(val) => updateField('rentAmount', val)}
                                                        rentFrequency={formData.rentFrequency}
                                                        updateRentFrequency={(val) => updateField('rentFrequency', val)}
                                                        rentNextDate={formData.rentNextDate}
                                                        updateRentNextDate={(val) => updateField('rentNextDate', val)}
                                                        rentEntryMode={formData.rentEntryMode}
                                                        updateRentEntryMode={(val) => updateField('rentEntryMode', val)}
                                                        terms={formData.termDates?.terms || []}
                                                        rentTermDates={formData.rentTermDates}
                                                        updateRentTermDates={(val) => updateField('rentTermDates', val)}
                                                        rentQuarterlyDates={formData.rentQuarterlyDates}
                                                        updateRentQuarterlyDates={(val) => updateField('rentQuarterlyDates', val)}
                                                        rentAmountPeriod={formData.rentAmountPeriod}
                                                        updateRentAmountPeriod={(val) => updateField('rentAmountPeriod', val)}
                                                        rentVariesByTerm={formData.rentVariesByTerm}
                                                        updateRentVariesByTerm={(val) => updateField('rentVariesByTerm', val)}
                                                        rentNonTermAmount={formData.rentNonTermAmount}
                                                        updateRentNonTermAmount={(val) => updateField('rentNonTermAmount', val)}
                                                        rentStartDate={formData.rentStartDate}
                                                        updateRentStartDate={(val) => updateField('rentStartDate', val)}
                                                        rentEndDate={formData.rentEndDate}
                                                        updateRentEndDate={(val) => updateField('rentEndDate', val)}
                                                    />
                                                )}
                                                {source.id === 'bills' && (
                                                    <BillsStep compact
                                                        billsAmount={formData.billsAmount}
                                                        updateBillsAmount={(val) => updateField('billsAmount', val)}
                                                        billsFrequency={formData.billsFrequency}
                                                        updateBillsFrequency={(val) => updateField('billsFrequency', val)}
                                                        billsEntryMode={formData.billsEntryMode}
                                                        updateBillsEntryMode={(val) => updateField('billsEntryMode', val)}
                                                        billsNextDate={formData.billsNextDate}
                                                        updateBillsNextDate={(val) => updateField('billsNextDate', val)}
                                                        terms={formData.termDates?.terms || []}
                                                        billsTermDates={formData.billsTermDates}
                                                        updateBillsTermDates={(val) => updateField('billsTermDates', val)}
                                                        billsAmountPeriod={formData.billsAmountPeriod}
                                                        updateBillsAmountPeriod={(val) => updateField('billsAmountPeriod', val)}
                                                        billsQuarterlyDates={formData.billsQuarterlyDates}
                                                        updateBillsQuarterlyDates={(val) => updateField('billsQuarterlyDates', val)}
                                                        billsVariesByTerm={formData.billsVariesByTerm}
                                                        updateBillsVariesByTerm={(val) => updateField('billsVariesByTerm', val)}
                                                        billsNonTermAmount={formData.billsNonTermAmount}
                                                        updateBillsNonTermAmount={(val) => updateField('billsNonTermAmount', val)}
                                                        billsStartDate={formData.billsStartDate}
                                                        updateBillsStartDate={(val) => updateField('billsStartDate', val)}
                                                        billsEndDate={formData.billsEndDate}
                                                        updateBillsEndDate={(val) => updateField('billsEndDate', val)}
                                                        rentStartDate={formData.rentStartDate}
                                                        rentEndDate={formData.rentEndDate}
                                                    />
                                                )}
                                                {source.id === 'uni_fees' && (
                                                    <UniFeesStep compact
                                                        uniFeesAmount={formData.uniFeesAmount}
                                                        updateUniFeesAmount={(val) => updateField('uniFeesAmount', val)}
                                                        uniFeesFrequency={formData.uniFeesFrequency}
                                                        updateUniFeesFrequency={(val) => updateField('uniFeesFrequency', val)}
                                                        uniFeesEntryMode={formData.uniFeesEntryMode}
                                                        updateUniFeesEntryMode={(val) => updateField('uniFeesEntryMode', val)}
                                                        uniFeesNextDate={formData.uniFeesNextDate}
                                                        updateUniFeesNextDate={(val) => updateField('uniFeesNextDate', val)}
                                                        terms={formData.termDates?.terms || []}
                                                        uniFeesTermDates={formData.uniFeesTermDates || {}}
                                                        updateUniFeesTermDates={(val) => updateField('uniFeesTermDates', val)}
                                                        uniFeesAmountPeriod={formData.uniFeesAmountPeriod}
                                                        updateUniFeesAmountPeriod={(val) => updateField('uniFeesAmountPeriod', val)}
                                                        uniFeesQuarterlyDates={formData.uniFeesQuarterlyDates}
                                                        updateUniFeesQuarterlyDates={(val) => updateField('uniFeesQuarterlyDates', val)}
                                                        uniFeesVariesByTerm={formData.uniFeesVariesByTerm}
                                                        updateUniFeesVariesByTerm={(val) => updateField('uniFeesVariesByTerm', val)}
                                                        uniFeesNonTermAmount={formData.uniFeesNonTermAmount}
                                                        updateUniFeesNonTermAmount={(val) => updateField('uniFeesNonTermAmount', val)}
                                                    />
                                                )}
                                                {source.id === 'savings_investments' && (
                                                    <SavingsInvestmentsStep compact
                                                        savingsInvAmount={formData.savingsInvAmount}
                                                        updateSavingsInvAmount={(val) => updateField('savingsInvAmount', val)}
                                                        savingsInvFrequency={formData.savingsInvFrequency}
                                                        updateSavingsInvFrequency={(val) => updateField('savingsInvFrequency', val)}
                                                        savingsInvNextDate={formData.savingsInvNextDate}
                                                        updateSavingsInvNextDate={(val) => updateField('savingsInvNextDate', val)}
                                                        savingsInvEntryMode={formData.savingsInvEntryMode}
                                                        updateSavingsInvEntryMode={(val) => updateField('savingsInvEntryMode', val)}
                                                        terms={formData.termDates?.terms || []}
                                                        savingsInvTermDates={formData.savingsInvTermDates || {}}
                                                        updateSavingsInvTermDates={(val) => updateField('savingsInvTermDates', val)}
                                                        savingsInvQuarterlyDates={formData.savingsInvQuarterlyDates || {}}
                                                        updateSavingsInvQuarterlyDates={(val) => updateField('savingsInvQuarterlyDates', val)}
                                                        savingsInvAmountPeriod={formData.savingsInvAmountPeriod}
                                                        updateSavingsInvAmountPeriod={(val) => updateField('savingsInvAmountPeriod', val)}
                                                        savingsInvVariesByTerm={formData.savingsInvVariesByTerm}
                                                        updateSavingsInvVariesByTerm={(val) => updateField('savingsInvVariesByTerm', val)}
                                                        savingsInvNonTermAmount={formData.savingsInvNonTermAmount}
                                                        updateSavingsInvNonTermAmount={(val) => updateField('savingsInvNonTermAmount', val)}
                                                    />
                                                )}
                                                {source.isOtherExpense && (() => {
                                                    const inst = otherExpenses.find(i => i.id === source.id)
                                                    if (!inst) return null
                                                    return (
                                                        <OtherExpenseStep compact
                                                            otherExpenseAmount={inst.amount}
                                                            updateOtherExpenseAmount={(val) => updateOtherInstance(inst.id, 'amount', val)}
                                                            otherExpenseFrequency={inst.frequency}
                                                            updateOtherExpenseFrequency={(val) => updateOtherInstance(inst.id, 'frequency', val)}
                                                            otherExpenseLabel={inst.label}
                                                            updateOtherExpenseLabel={(val) => updateOtherInstance(inst.id, 'label', val)}
                                                            otherExpenseNextDate={inst.nextDate}
                                                            updateOtherExpenseNextDate={(val) => updateOtherInstance(inst.id, 'nextDate', val)}
                                                            terms={formData.termDates?.terms || []}
                                                            otherExpenseTermDates={inst.termDates}
                                                            updateOtherExpenseTermDates={(val) => updateOtherInstance(inst.id, 'termDates', val)}
                                                            otherExpenseQuarterlyDates={inst.quarterlyDates}
                                                            updateOtherExpenseQuarterlyDates={(val) => updateOtherInstance(inst.id, 'quarterlyDates', val)}
                                                            otherExpenseVariesByTerm={inst.variesByTerm}
                                                            updateOtherExpenseVariesByTerm={(val) => updateOtherInstance(inst.id, 'variesByTerm', val)}
                                                            otherExpenseNonTermAmount={inst.nonTermAmount}
                                                            updateOtherExpenseNonTermAmount={(val) => updateOtherInstance(inst.id, 'nonTermAmount', val)}
                                                            otherExpenseAmountPeriod={inst.amountPeriod}
                                                            updateOtherExpenseAmountPeriod={(val) => updateOtherInstance(inst.id, 'amountPeriod', val)}
                                                        />
                                                    )
                                                })()}
                                            </SourceRow>
                                        )
                                    })}

                                    {/* Add expense button + picker */}
                                    {(() => {
                                        const hiddenFixed = FIXED_EXPENSE_SOURCES.filter(s => !isSourceVisible(s.id, formData.expenseSources))
                                        const pickerOptions = [
                                            ...hiddenFixed,
                                            { id: 'other_expense', label: 'Other Regular Expense', icon: iconOtherExpense },
                                        ]
                                        return (
                                            <div style={{ position: 'relative' }}>
                                                <button
                                                    onClick={(e) => {
                                                        const opening = addingSourceType !== 'expense'
                                                        if (opening) {
                                                            addPickerScrollPos.current = scrollRef.current?.scrollTop ?? null
                                                            setAddingSourceType('expense')
                                                            setExpandedSources(prev => new Set(prev).add('__add_expense__'))
                                                            const btn = e.currentTarget.parentElement
                                                            const container = scrollRef.current
                                                            if (btn && container) {
                                                                requestAnimationFrame(() => requestAnimationFrame(() => {
                                                                    const stickyHeader = container.querySelector('[data-sticky-header]')
                                                                    const headerH = stickyHeader ? stickyHeader.offsetHeight : 0
                                                                    const containerTop = container.getBoundingClientRect().top + headerH
                                                                    const btnTop = btn.getBoundingClientRect().top
                                                                    const SHRINK = MAX_H - MIN_H
                                                                    const btnOffset = container.scrollTop + (btnTop - containerTop) - 8
                                                                    const graphWillCollapse = container.scrollTop < SHRINK && btnOffset > SHRINK
                                                                    const target = Math.max(SHRINK, graphWillCollapse ? btnOffset - SHRINK : btnOffset)
                                                                    animateScroll(container, target, 400)
                                                                }))
                                                            }
                                                        } else {
                                                            closeAddPicker()
                                                        }
                                                    }}
                                                    style={{
                                                        width: '100%', height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                        border: '1px solid #e0e0e0', borderRadius: 10,
                                                        background: 'none', cursor: 'pointer',
                                                        fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#e06470',
                                                    }}
                                                >
                                                    <span style={{ fontSize: 20, lineHeight: 1, marginTop: -1 }}>+</span>
                                                    Add regular expense
                                                </button>
                                                {addingSourceType === 'expense' && (<>
                                                    <div onClick={closeAddPicker} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
                                                    <div style={{
                                                        marginTop: 6, borderRadius: 10, border: '1px solid #f0f0f0',
                                                        background: '#fff', overflow: 'hidden',
                                                        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                                                        position: 'relative', zIndex: 51,
                                                        animation: pickerClosing ? 'pickerSlideUp 0.2s ease forwards' : 'pickerSlideDown 0.25s ease',
                                                    }}>
                                                        {pickerOptions.map(source => (
                                                            <button
                                                                key={source.id}
                                                                onClick={() => addSource(source.id, true)}
                                                                style={{
                                                                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                                                    padding: '11px 14px', border: 'none', borderBottom: '1px solid #f5f5f5',
                                                                    background: 'none', cursor: 'pointer', textAlign: 'left',
                                                                }}
                                                            >
                                                                <img src={source.icon} alt="" style={{ width: 24, height: 24, objectFit: 'contain', opacity: 0.7 }} />
                                                                <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#333' }}>
                                                                    {source.label}
                                                                </span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </>)}
                                            </div>
                                        )
                                    })()}
                                </div>
                            </div>
                        </div>)}

                        {activeTab === 'goals' && !dbLoaded && (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                                <div style={{
                                    width: 24, height: 24, borderRadius: '50%',
                                    border: '3px solid #f0f0f0', borderTopColor: '#EC8C17',
                                    animation: 'spin 0.8s linear infinite',
                                }} />
                                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                            </div>
                        )}
                        {activeTab === 'goals' && dbLoaded && (() => {
                            const sym = getCurrencySymbol()
                            const today = new Date()
                            today.setHours(0, 0, 0, 0)
                            const todayStr = toLocalDate(today)

                            const sortedEvents = [...events].filter(e => !e.removed).sort((a, b) => a.date.localeCompare(b.date))
                            const futureEvts = sortedEvents.filter(e => e.date >= todayStr)

                            // End-of-year projected balance (from current balance through future events only)
                            let endOfYearBal = projectionBalance
                            for (const evt of futureEvts) {
                                if (evt.editType === 'weeklySpend') endOfYearBal -= evt.amount
                                else endOfYearBal += evt.type === 'income' ? evt.amount : -evt.amount
                            }

                            // End-of-term projected balance
                            const currentTerm = terms.find(t => todayStr >= t.start && todayStr <= t.end)
                            const nextTerm = terms.find(t => t.start > todayStr)
                            const targetTerm = currentTerm || nextTerm
                            let endOfTermBal = null
                            if (targetTerm) {
                                endOfTermBal = projectionBalance
                                const termEndEvts = futureEvts.filter(e => e.date <= targetTerm.end)
                                for (const evt of termEndEvts) {
                                    if (evt.editType === 'weeklySpend') endOfTermBal -= evt.amount
                                    else endOfTermBal += evt.type === 'income' ? evt.amount : -evt.amount
                                }
                            }

                            // Academic year progress based on term days (minus breaks)
                            const countTermDays = (startStr, endStr) => {
                                let total = 0
                                for (const t of terms) {
                                    const tStart = t.start > startStr ? t.start : startStr
                                    const tEnd = t.end < endStr ? t.end : endStr
                                    if (tStart > tEnd) continue
                                    let termDays = daysBetween(tStart, tEnd) + 1
                                    for (const brk of (t.breaks || [])) {
                                        const bStart = brk.start > tStart ? brk.start : tStart
                                        const bEnd = brk.end < tEnd ? brk.end : tEnd
                                        if (bStart <= bEnd) termDays -= daysBetween(bStart, bEnd) + 1
                                    }
                                    total += Math.max(0, termDays)
                                }
                                return total
                            }
                            const lastTerm = terms.length > 0 ? terms[terms.length - 1] : null
                            const firstTerm = terms.length > 0 ? terms[0] : null
                            const ayStartStr = firstTerm ? firstTerm.start : toLocalDate(AY_START)
                            const ayEndStr = lastTerm ? lastTerm.end : toLocalDate(AY_END)
                            const totalTermDays = Math.max(1, countTermDays(ayStartStr, ayEndStr))
                            const termDaysLeft = countTermDays(todayStr, ayEndStr)
                            const termDaysElapsed = totalTermDays - termDaysLeft
                            const yearProgress = Math.min(100, Math.max(0, Math.round((termDaysElapsed / totalTermDays) * 100)))

                            // Upcoming events — always look ahead enough to find events
                            const lookAheadDays = 90
                            const inRange = new Date(today)
                            inRange.setDate(inRange.getDate() + lookAheadDays)
                            const inRangeStr = toLocalDate(inRange)
                            const upcoming = sortedEvents.filter(e => e.date > todayStr && e.date <= inRangeStr && e.editType !== 'weeklySpend')
                            const weeklySpendIn90 = sortedEvents.filter(e => e.date > todayStr && e.date <= inRangeStr && e.editType === 'weeklySpend').reduce((s, e) => s + e.amount, 0)
                            const upcomingIncome = upcoming.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
                            const upcomingExpense = upcoming.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0) + weeklySpendIn90

                            // Upcoming payments and income (sorted by date)
                            const upcomingPayments = upcoming.filter(e => e.type === 'expense').sort((a, b) => a.date.localeCompare(b.date))
                            const upcomingIncomeList = upcoming.filter(e => e.type === 'income').sort((a, b) => a.date.localeCompare(b.date))

                            // Income / expense split for donut
                            const totalIn = yearlyIncome
                            const totalOut = yearlyExpense + weeklySpendTotal
                            const surplus = totalIn - totalOut

                            const cardStyle = {
                                background: '#fff', borderRadius: 14, padding: '16px 18px',
                                marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                                border: '1px solid #f0f0f0',
                            }
                            const cardTitle = {
                                fontSize: 12, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                                color: '#999', textTransform: 'uppercase', letterSpacing: 0.5,
                                margin: '0 0 10px',
                            }
                            const bigNum = {
                                fontSize: 28, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
                                margin: 0, lineHeight: 1.2,
                            }
                            const subText = {
                                fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                                color: '#888', margin: '4px 0 0',
                            }

                            const removeEvent = (evt) => {
                                // One-off items: remove from source array directly (no removedEvents needed)
                                if (evt.editType === 'oneOffIncome' || evt.editType === 'oneOffExpense') {
                                    const dir = evt.editType === 'oneOffIncome' ? 'in' : 'out'
                                    const updated = (formData.oneOffItems || []).filter(item => {
                                        const amt = parseFloat(String(item.amount || '0').replace(/,/g, ''))
                                        return !(item.date === evt.date && (item.direction || 'out') === dir && amt === evt.amount)
                                    })
                                    updateField('oneOffItems', updated.length > 0 ? updated : [{ name: '', amount: '', date: '', direction: 'out' }])
                                } else {
                                    const key = `${evt.editType}:${evt.date}`
                                    updateField('removedEvents', [...(formData.removedEvents || []), key])
                                }
                            }

                            const renderEventRow = (evt, i, list, color) => (
                                <div key={`${evt.editType}-${evt.date}-${i}`} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '8px 0', borderBottom: i < list.length - 1 ? '1px solid #f5f5f5' : 'none',
                                }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#333' }}>
                                            {evt.label}
                                        </p>
                                        <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#aaa' }}>
                                            {fmt(evt.date)}
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <p style={{ margin: 0, fontSize: 16, fontWeight: 800, fontFamily: 'Nunito, sans-serif', color }}>
                                            {evt.type === 'income' ? '+' : '-'}{sym}{Math.round(evt.amount).toLocaleString()}
                                        </p>
                                        <button
                                            onClick={() => removeEvent(evt)}
                                            style={{
                                                width: 24, height: 24, borderRadius: 6, border: 'none',
                                                background: '#f5f5f5', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                padding: 0, flexShrink: 0,
                                            }}
                                        >
                                            <Trash size={12} color="#999" />
                                        </button>
                                    </div>
                                </div>
                            )

                            return (
                                <div style={{ padding: '10px 16px 0' }}>
                                    {/* Zero balance & overdraft breach warnings */}
                                    {(() => {
                                        let bal = projectionBalance
                                        let zeroDate = null
                                        let overdraftDate = null
                                        let lowestBal = bal
                                        const od = overdraftNum || 0
                                        const alreadyZero = bal <= 0
                                        const alreadyOverdraft = od > 0 && bal < -od

                                        for (const evt of futureEvts) {
                                            const prevBal = bal
                                            if (evt.editType === 'weeklySpend') bal -= evt.amount
                                            else bal += evt.type === 'income' ? evt.amount : -evt.amount
                                            if (bal < lowestBal) lowestBal = bal
                                            if (bal <= 0 && !zeroDate) {
                                                // Interpolate actual zero-crossing day for weekly spend
                                                if (evt.editType === 'weeklySpend' && prevBal > 0 && evt.amount > 0) {
                                                    const dailySpend = evt.amount / 7
                                                    const daysToZero = Math.floor(prevBal / dailySpend)
                                                    const evtDate = new Date(evt.date)
                                                    const crossDate = new Date(evtDate.getTime() - (7 - daysToZero) * 86400000)
                                                    zeroDate = toLocalDate(crossDate < new Date(todayStr) ? new Date(todayStr) : crossDate)
                                                } else {
                                                    zeroDate = evt.date
                                                }
                                            }
                                            if (od > 0 && bal < -od && !overdraftDate) {
                                                // Interpolate overdraft breach day for weekly spend
                                                if (evt.editType === 'weeklySpend' && prevBal >= -od && evt.amount > 0) {
                                                    const dailySpend = evt.amount / 7
                                                    const balUntilOd = prevBal + od
                                                    const daysToOd = Math.floor(balUntilOd / dailySpend)
                                                    const evtDate = new Date(evt.date)
                                                    const crossDate = new Date(evtDate.getTime() - (7 - daysToOd) * 86400000)
                                                    overdraftDate = toLocalDate(crossDate < new Date(todayStr) ? new Date(todayStr) : crossDate)
                                                } else {
                                                    overdraftDate = evt.date
                                                }
                                            }
                                        }

                                        if (!alreadyZero && !alreadyOverdraft && !zeroDate && !overdraftDate) return null

                                        const daysUntil = (dateStr) => daysBetween(todayStr, dateStr)

                                        return (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                                {(alreadyZero || zeroDate) && (
                                                    <div style={{ ...cardStyle, background: '#fffaf0', border: '1px solid #f5e6cc' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                                            <div style={{
                                                                width: 28, height: 28, borderRadius: 8,
                                                                background: '#EC8C17', display: 'flex',
                                                                alignItems: 'center', justifyContent: 'center',
                                                            }}>
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                                                    <line x1="12" y1="9" x2="12" y2="13" />
                                                                    <line x1="12" y1="17" x2="12.01" y2="17" />
                                                                </svg>
                                                            </div>
                                                            <p style={{ ...cardTitle, margin: 0, color: '#EC8C17' }}>Zero Balance</p>
                                                        </div>
                                                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#333' }}>
                                                            {alreadyZero
                                                                ? `Your balance is currently at or below ${sym}0`
                                                                : zeroDate === todayStr
                                                                    ? `Projected to hit ${sym}0 today`
                                                                    : `Projected to hit ${sym}0 on ${fmt(zeroDate)}`
                                                            }
                                                        </p>
                                                        {!alreadyZero && zeroDate !== todayStr && (
                                                            <p style={{ ...subText, fontSize: 12, marginTop: 4 }}>
                                                                {daysUntil(zeroDate)} {daysUntil(zeroDate) === 1 ? 'day' : 'days'} from now
                                                            </p>
                                                        )}
                                                        {lowestBal < 0 && (zeroDate === todayStr || alreadyZero) && (
                                                            <p style={{ ...subText, fontSize: 12, marginTop: 4 }}>
                                                                Projected to reach {sym}{Math.abs(Math.round(lowestBal)).toLocaleString()} in the negative
                                                            </p>
                                                        )}
                                                        <button
                                                            onClick={() => navigate('/support')}
                                                            style={{
                                                                marginTop: 10, padding: '8px 14px',
                                                                background: '#EC8C17', color: '#fff',
                                                                border: 'none', borderRadius: 8,
                                                                fontSize: 12, fontWeight: 700,
                                                                fontFamily: 'Nunito, sans-serif',
                                                                cursor: 'pointer',
                                                                boxShadow: '0 2px 6px rgba(236,140,23,0.3)',
                                                            }}
                                                        >
                                                            Get money advice
                                                        </button>
                                                    </div>
                                                )}
                                                {(alreadyOverdraft || overdraftDate) && (
                                                    <div style={{ ...cardStyle, background: '#fdf0f1', border: '1px solid #f5cccc' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                                            <div style={{
                                                                width: 28, height: 28, borderRadius: 8,
                                                                background: '#e06470', display: 'flex',
                                                                alignItems: 'center', justifyContent: 'center',
                                                            }}>
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                    <circle cx="12" cy="12" r="10" />
                                                                    <line x1="15" y1="9" x2="9" y2="15" />
                                                                    <line x1="9" y1="9" x2="15" y2="15" />
                                                                </svg>
                                                            </div>
                                                            <p style={{ ...cardTitle, margin: 0, color: '#e06470' }}>Overdraft Limit</p>
                                                        </div>
                                                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#333' }}>
                                                            {alreadyOverdraft
                                                                ? `You\u2019ve exceeded your ${sym}${Math.round(od).toLocaleString()} overdraft limit`
                                                                : overdraftDate === todayStr
                                                                    ? `Projected to exceed ${sym}${Math.round(od).toLocaleString()} overdraft today`
                                                                    : `Projected to exceed ${sym}${Math.round(od).toLocaleString()} overdraft on ${fmt(overdraftDate)}`
                                                            }
                                                        </p>
                                                        {!alreadyOverdraft && overdraftDate !== todayStr && (
                                                            <p style={{ ...subText, fontSize: 12, marginTop: 4 }}>
                                                                {daysUntil(overdraftDate)} {daysUntil(overdraftDate) === 1 ? 'day' : 'days'} from now
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })()}

                                    {/* Next N Days */}
                                    <div style={cardStyle}>
                                        <p style={cardTitle}>Next {lookAheadDays} Days</p>
                                        <div style={{ display: 'flex', gap: 12 }}>
                                            <div style={{ flex: 1, background: '#f0faf9', borderRadius: 10, padding: '12px 14px' }}>
                                                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#147b75' }}>Coming In</p>
                                                <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 800, fontFamily: 'Nunito, sans-serif', color: '#147b75' }}>
                                                    {sym}{Math.round(upcomingIncome).toLocaleString()}
                                                </p>
                                            </div>
                                            <div style={{ flex: 1, background: '#fdf0f1', borderRadius: 10, padding: '12px 14px' }}>
                                                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#e06470' }}>Going Out</p>
                                                <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 800, fontFamily: 'Nunito, sans-serif', color: '#e06470' }}>
                                                    {sym}{Math.round(upcomingExpense).toLocaleString()}
                                                </p>
                                            </div>
                                        </div>
                                        <p style={{ ...subText, marginTop: 10 }}>
                                            Net: <span style={{ color: upcomingIncome - upcomingExpense >= 0 ? '#147b75' : '#e06470', fontWeight: 700 }}>
                                                {upcomingIncome - upcomingExpense >= 0 ? '+' : '-'}{sym}{Math.abs(Math.round(upcomingIncome - upcomingExpense)).toLocaleString()}
                                            </span>
                                        </p>
                                    </div>

                                    {/* Upcoming Transactions */}
                                    {(upcomingPayments.length > 0 || upcomingIncomeList.length > 0) && (
                                        <div ref={goalsTransCardRef} style={cardStyle}>
                                            <p style={cardTitle}>Upcoming Transactions</p>
                                            {(() => {
                                                const combined = [...upcomingPayments, ...upcomingIncomeList].sort((a, b) => a.date.localeCompare(b.date))
                                                const first3 = combined.slice(0, 3)
                                                const extra = combined.slice(3, 10)
                                                const measuredH = goalsMoreRef.current?.scrollHeight || 0
                                                return (
                                                    <>
                                                        {first3.map((evt, i) => renderEventRow(evt, i, goalsShowMore ? combined.slice(0, 10) : first3, evt.type === 'income' ? '#147b75' : '#e06470'))}
                                                        {extra.length > 0 && (
                                                            <div
                                                                ref={goalsMoreRef}
                                                                style={{
                                                                    maxHeight: goalsShowMore ? measuredH || 600 : 0,
                                                                    opacity: goalsShowMore ? 1 : 0,
                                                                    overflow: 'hidden',
                                                                    transition: 'max-height 0.45s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.3s ease',
                                                                }}
                                                            >
                                                                {extra.map((evt, i) => renderEventRow(evt, i + 3, combined.slice(0, 10), evt.type === 'income' ? '#147b75' : '#e06470'))}
                                                            </div>
                                                        )}
                                                        {extra.length > 0 && (
                                                            <button onClick={() => {
                                                                if (goalsShowMore && goalsTransCardRef.current && scrollRef.current) {
                                                                    const sc = scrollRef.current
                                                                    const stickyHeader = sc.querySelector('[data-sticky-header]')
                                                                    const headerH = stickyHeader ? stickyHeader.getBoundingClientRect().height : 0
                                                                    const cardTop = goalsTransCardRef.current.getBoundingClientRect().top
                                                                    const scTop = sc.getBoundingClientRect().top
                                                                    const offset = cardTop - scTop - headerH + sc.scrollTop - 10
                                                                    setTimeout(() => sc.scrollTo({ top: offset, behavior: 'smooth' }), 50)
                                                                }
                                                                setGoalsShowMore(!goalsShowMore)
                                                            }} style={{
                                                                width: '100%', border: 'none', background: 'none', cursor: 'pointer',
                                                                padding: '10px 0 0', fontSize: 12, fontWeight: 700,
                                                                fontFamily: 'Nunito, sans-serif', color: '#147b75',
                                                            }}>
                                                                {goalsShowMore ? 'Show less' : `Show more (${extra.length} more)`}
                                                            </button>
                                                        )}
                                                    </>
                                                )
                                            })()}
                                        </div>
                                    )}

                                    {/* Income vs Expenses ring */}
                                    <div style={cardStyle}>
                                        <p style={cardTitle}>Yearly Income vs Expenses</p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                                            <div style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
                                                <svg viewBox="0 0 36 36" style={{ width: 80, height: 80, transform: 'rotate(-90deg)' }}>
                                                    <circle cx="18" cy="18" r="14" fill="none" stroke="#f0f0f0" strokeWidth="4" />
                                                    {totalIn + totalOut > 0 && (<>
                                                        <circle cx="18" cy="18" r="14" fill="none" stroke="#147b75"
                                                            strokeWidth="4" strokeLinecap="round"
                                                            strokeDasharray={`${(totalIn / (totalIn + totalOut)) * 88} 88`}
                                                        />
                                                        <circle cx="18" cy="18" r="14" fill="none" stroke="#e06470"
                                                            strokeWidth="4" strokeLinecap="round"
                                                            strokeDasharray={`${(totalOut / (totalIn + totalOut)) * 88} 88`}
                                                            strokeDashoffset={`-${(totalIn / (totalIn + totalOut)) * 88}`}
                                                        />
                                                    </>)}
                                                </svg>
                                                <div style={{
                                                    position: 'absolute', inset: 0, display: 'flex',
                                                    alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    <span style={{
                                                        fontSize: 11, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
                                                        color: surplus >= 0 ? '#147b75' : '#e06470',
                                                    }}>
                                                        {surplus >= 0 ? '+' : '-'}{sym}{Math.abs(Math.round(surplus)).toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                                    <div style={{ width: 10, height: 10, borderRadius: 3, background: '#147b75' }} />
                                                    <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#555' }}>
                                                        Income: {sym}{Math.round(totalIn).toLocaleString()}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <div style={{ width: 10, height: 10, borderRadius: 3, background: '#e06470' }} />
                                                    <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#555' }}>
                                                        Expenses: {sym}{Math.round(totalOut).toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Balance Tracking — actual vs predicted */}
                                    {balanceHistory.length > 1 && (() => {
                                        // For each history entry, calculate what predicted balance was on that date
                                        // predicted(date) = today's balance - sum of events between date and today
                                        const sorted = [...balanceHistory]
                                            .sort((a, b) => a.recorded_date.localeCompare(b.recorded_date))
                                        // Dedupe by date
                                        const byDate = new Map()
                                        for (const bh of sorted) {
                                            byDate.set(bh.recorded_date, bh)
                                        }
                                        const unique = [...byDate.values()]
                                        // Include entries up to and including today
                                        const pastEntries = unique.filter(bh => bh.recorded_date <= todayStr)
                                        if (pastEntries.length === 0) return null

                                        // Green line value at each history date
                                        // Green line is anchored at projBal at today, rewind events to get past values
                                        const allPastEvts = sortedEvents.filter(e => e.date <= todayStr)
                                        const trackingData = pastEntries.map(bh => {
                                            // Events between this date and today — undo them from projBal
                                            const eventsBetween = allPastEvts.filter(e => e.date > bh.recorded_date)
                                            let predicted = projBal
                                            for (const evt of eventsBetween) {
                                                // Reverse: undo income (subtract), undo expense (add)
                                                if (evt.type === 'income') predicted -= evt.amount
                                                else predicted += evt.amount
                                            }
                                            const actual = Number(bh.balance)
                                            const diff = actual - predicted
                                            return {
                                                date: bh.recorded_date,
                                                actual,
                                                predicted: Math.round(predicted),
                                                diff: Math.round(diff),
                                            }
                                        })

                                        // Show last 5 entries
                                        const recent = trackingData.slice(-5)
                                        // Overall trend: compare most recent diff to earliest diff
                                        const latestDiff = recent[recent.length - 1].diff
                                        const earliestDiff = recent[0].diff
                                        const trendImproving = latestDiff > earliestDiff

                                        return (
                                            <div style={cardStyle}>
                                                <p style={cardTitle}>Balance Tracking</p>
                                                <p style={{ ...subText, margin: '0 0 12px', fontSize: 12 }}>
                                                    Actual balance vs predicted
                                                </p>
                                                {recent.map((entry, i) => {
                                                    const dateObj = new Date(entry.date + 'T00:00:00')
                                                    const dateLabel = `${dateObj.getDate()} ${dateObj.toLocaleDateString('en-GB', { month: 'short' })}`
                                                    const isAhead = entry.diff >= 0
                                                    return (
                                                        <div key={entry.date} style={{
                                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                            padding: '7px 0',
                                                            borderBottom: i < recent.length - 1 ? '1px solid #f5f5f5' : 'none',
                                                        }}>
                                                            <div>
                                                                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#333' }}>
                                                                    {dateLabel}
                                                                </p>
                                                                <p style={{ margin: '1px 0 0', fontSize: 11, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#aaa' }}>
                                                                    Actual: {sym}{entry.actual.toLocaleString()} · Predicted: {sym}{entry.predicted.toLocaleString()}
                                                                </p>
                                                            </div>
                                                            <span style={{
                                                                fontSize: 13, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
                                                                color: isAhead ? '#147b75' : '#e06470',
                                                                whiteSpace: 'nowrap',
                                                            }}>
                                                                {isAhead ? '+' : '-'}{sym}{Math.abs(entry.diff).toLocaleString()}
                                                            </span>
                                                        </div>
                                                    )
                                                })}
                                                <div style={{
                                                    marginTop: 10, padding: '8px 12px', borderRadius: 8,
                                                    background: latestDiff >= 0 ? '#f0faf9' : '#fdf0f1',
                                                }}>
                                                    <p style={{
                                                        margin: 0, fontSize: 12, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                                                        color: latestDiff >= 0 ? '#147b75' : '#e06470',
                                                        textAlign: 'center',
                                                    }}>
                                                        Currently {sym}{Math.abs(latestDiff).toLocaleString()} {latestDiff >= 0 ? 'ahead of' : 'behind'} predicted
                                                        {recent.length > 1 && (trendImproving ? ' · Improving' : ' · Declining')}
                                                    </p>
                                                </div>
                                            </div>
                                        )
                                    })()}

                                    {/* Academic Year Progress */}
                                    <div style={cardStyle}>
                                        <p style={cardTitle}>Academic Year Progress</p>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                            <p style={{ ...bigNum, fontSize: 32, color: '#333' }}>{yearProgress}%</p>
                                            <p style={{ ...subText, margin: 0 }}>{termDaysLeft} term days left</p>
                                        </div>
                                        <div style={{
                                            marginTop: 12, height: 8, borderRadius: 4,
                                            background: '#f0f0f0', overflow: 'hidden',
                                        }}>
                                            <div style={{
                                                height: '100%', borderRadius: 4,
                                                width: `${yearProgress}%`,
                                                background: 'linear-gradient(90deg, #147b75, #1ca69e)',
                                                transition: 'width 0.6s ease',
                                            }} />
                                        </div>
                                    </div>

                                    {/* Projected Balances */}
                                    <div style={{ display: 'flex', gap: 12 }}>
                                        {endOfTermBal !== null && targetTerm && (
                                            <div style={{ ...cardStyle, flex: 1 }}>
                                                <p style={cardTitle}>End of {currentTerm ? 'Term' : 'Next Term'}</p>
                                                <p style={{ ...bigNum, fontSize: 22, color: endOfTermBal >= 0 ? '#147b75' : '#e06470' }}>
                                                    {endOfTermBal < 0 ? '-' : ''}{sym}{Math.abs(Math.round(endOfTermBal)).toLocaleString()}
                                                </p>
                                                <p style={{ ...subText, fontSize: 11 }}>
                                                    {currentTerm ? `${daysBetween(todayStr, currentTerm.end)} days left` : fmt(targetTerm.end)}
                                                </p>
                                            </div>
                                        )}
                                        <div style={{ ...cardStyle, flex: 1 }}>
                                            <p style={cardTitle}>End of Year</p>
                                            <p style={{ ...bigNum, fontSize: 22, color: endOfYearBal >= 0 ? '#147b75' : '#e06470' }}>
                                                {endOfYearBal < 0 ? '-' : ''}{sym}{Math.abs(Math.round(endOfYearBal)).toLocaleString()}
                                            </p>
                                            <p style={{ ...subText, fontSize: 11 }}>{termDaysLeft} term days left</p>
                                        </div>
                                    </div>

                                </div>
                            )
                        })()}

                        {activeTab === 'variable' && (
                            <div style={{ padding: '10px 16px 0' }}>
                                <WeeklySpendStep compact
                                    weeklySpend={formData.weeklySpend}
                                    updateWeeklySpend={(val) => updateField('weeklySpend', val)}
                                    weeklySpendNonTerm={formData.weeklySpendNonTerm}
                                    updateWeeklySpendNonTerm={(val) => updateField('weeklySpendNonTerm', val)}
                                    weeklySpendVariesByTerm={formData.weeklySpendVariesByTerm}
                                    updateWeeklySpendVariesByTerm={(val) => updateField('weeklySpendVariesByTerm', val)}
                                />
                                <div style={{ marginTop: 20 }}>
                                    <p style={{
                                        fontSize: 16, fontWeight: 700,
                                        fontFamily: 'Nunito, sans-serif',
                                        color: '#000', margin: '0 0 12px',
                                    }}>One-off Items</p>
                                    <OneOffItemsStep compact
                                        items={formData.oneOffItems || [{ name: '', amount: '', date: '', direction: 'out' }]}
                                        updateItems={(val) => updateField('oneOffItems', val)}
                                        minDate={getGraphStart()}
                                    />
                                </div>
                            </div>
                        )}

                        {expandedSources.size > 0 && <div style={{ height: 150 }} />}

                    </div>
                </div>
            </div>

            {/* Event edit popup */}
            {editingEvent && (() => {
                const isIncome = editingEvent.type === 'income'
                const color = isIncome ? '#147b75' : '#e06470'
                const w = 140
                const h = editingEvent.removed ? 60 : 80
                const left = Math.max(8, Math.min(editingEvent.clickX - w / 2, window.innerWidth - w - 8))
                const showBelow = editingEvent.clickY < h + 24
                const top = showBelow ? editingEvent.clickY + 14 : editingEvent.clickY - h - 10
                return (
                    <>
                        <div
                            onClick={() => setEditingEvent(null)}
                            style={{ position: 'fixed', inset: 0, zIndex: 100 }}
                        />
                        <div style={{
                            position: 'fixed',
                            left, top,
                            width: w,
                            background: '#fff',
                            borderRadius: 8,
                            zIndex: 101,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                            padding: '5px 4px 4px',
                        }}>
                            <span style={{
                                fontSize: 8, fontWeight: 600,
                                fontFamily: 'Nunito, sans-serif',
                                color: '#999',
                                padding: '0 3px',
                                display: 'block',
                                marginBottom: 1,
                            }}>
                                {editingEvent.label}{editingEvent.sublabel ? ` · ${editingEvent.sublabel}` : ''}{editingEvent.date ? ` · ${new Date(editingEvent.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                            </span>
                            {!editingEvent.removed && editingEvent.balanceAfter != null && (
                                <span style={{
                                    fontSize: 7, fontWeight: 700,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: editingEvent.balanceAfter >= 0 ? '#147b75' : '#e06470',
                                    padding: '0 3px',
                                    display: 'block',
                                    marginBottom: 3,
                                }}>
                                    New projected balance: {getCurrencySymbol()}{Math.round(editingEvent.balanceAfter).toLocaleString()}
                                </span>
                            )}
                            {editingEvent.removed ? (
                                <button
                                    onClick={() => {
                                        const key = `${editingEvent.editType}:${editingEvent.date}`
                                        updateField('removedEvents', (formData.removedEvents || []).filter(k => k !== key))
                                        setEditingEvent(null)
                                    }}
                                    style={{
                                        width: '100%', height: 20, border: 'none', borderRadius: 5,
                                        background: color, padding: '0 6px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', gap: 3,
                                    }}
                                >
                                    <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#fff' }}>Restore</span>
                                </button>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                        <div style={{
                                            display: 'flex', alignItems: 'center', flex: 1,
                                            background: '#f5f5f5', borderRadius: 5,
                                            padding: '0 6px', height: 24, gap: 2,
                                        }}>
                                            <span style={{
                                                fontSize: 11, fontWeight: 600,
                                                color: '#aaa', fontFamily: 'Nunito, sans-serif',
                                            }}>{getCurrencySymbol()}</span>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={formatDisplay(editAmount)}
                                                onChange={(e) => setEditAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                                                ref={(el) => el && setTimeout(() => el.focus({ preventScroll: true }), 50)}
                                                style={{
                                                    flex: 1, border: 'none',
                                                    background: 'transparent',
                                                    fontSize: 11, fontWeight: 700,
                                                    fontFamily: 'Nunito, sans-serif',
                                                    color: '#000', outline: 'none', padding: 0,
                                                    width: 0, minWidth: 0,
                                                }}
                                            />
                                        </div>
                                        <button
                                            onClick={() => {
                                                const val = editAmount.replace(/[^0-9.]/g, '')
                                                if (editingEvent.editType === 'loan' && editingEvent.editMonth) {
                                                    updateField('instalmentAmounts', {
                                                        ...(formData.instalmentAmounts || {}),
                                                        [editingEvent.editMonth]: val,
                                                    })
                                                } else if (editingEvent.editType === 'bursary' && editingEvent.editMonth) {
                                                    updateField('bursaryInstalmentAmounts', {
                                                        ...(formData.bursaryInstalmentAmounts || {}),
                                                        [editingEvent.editMonth]: val,
                                                    })
                                                } else if (editingEvent.editType === 'family') {
                                                    updateField('familyAmount', val)
                                                } else if (editingEvent.editType === 'otherIncome') {
                                                    updateField('otherIncomeAmount', val)
                                                } else if (editingEvent.editType === 'rent') {
                                                    updateField('rentAmount', val)
                                                } else if (editingEvent.editType === 'bills') {
                                                    updateField('billsAmount', val)
                                                } else if (editingEvent.editType === 'uniFees') {
                                                    updateField('uniFeesAmount', val)
                                                } else if (editingEvent.editType === 'savingsInv') {
                                                    updateField('savingsInvAmount', val)
                                                } else if (editingEvent.editType === 'work') {
                                                    updateField('workAmount', val)
                                                }
                                                analytics.track(DASHBOARD_EVENTS.EVENT_EDITED, {
                                                    edit_type: editingEvent.editType,
                                                    event_type: editingEvent.type,
                                                })
                                                setEditingEvent(null)
                                            }}
                                            style={{
                                                width: 24, height: 24,
                                                border: 'none', borderRadius: 5,
                                                background: color,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer', flexShrink: 0,
                                            }}
                                        >
                                            <svg width="10" height="7" viewBox="0 0 14 10" fill="none">
                                                <path d="M1 5L5 9L13 1" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </button>
                                    </div>
                                    {(() => {
                                        const isLoan = editingEvent.editType === 'loan' && editingEvent.editMonth
                                        const isBursary = editingEvent.editType === 'bursary' && editingEvent.editMonth
                                        if (isLoan || isBursary) {
                                            const monthsKey = isLoan ? 'loanMonths' : 'bursaryMonths'
                                            const amountKey = isLoan ? 'loanAmount' : 'bursaryAmount'
                                            const defaultMonths = isLoan ? DEFAULT_LOAN_MONTHS : ['october', 'february', 'march']
                                            const currentMonths = formData[monthsKey] || defaultMonths
                                            if (currentMonths.length <= 1) return null
                                            return (
                                                <button
                                                    onClick={() => {
                                                        const month = editingEvent.editMonth
                                                        const instKey = isLoan ? 'instalmentAmounts' : 'bursaryInstalmentAmounts'
                                                        const datesKey = isLoan ? 'loanDates' : 'bursaryDates'
                                                        setFormData(prev => {
                                                            const newMonths = (prev[monthsKey] || defaultMonths).filter(m => m !== month)
                                                            const newDates = { ...(prev[datesKey] || {}) }; delete newDates[month]
                                                            // Redistribute total amount evenly across remaining months
                                                            const total = parseFloat(String(prev[amountKey] || '0').replace(/,/g, ''))
                                                            const newInst = {}
                                                            if (total > 0 && newMonths.length > 0) {
                                                                const base = Math.floor(total * 100 / newMonths.length) / 100
                                                                const remainder = Math.round((total - base * newMonths.length) * 100)
                                                                newMonths.forEach((m, i) => {
                                                                    newInst[m] = String(Math.round((base + (i < remainder ? 0.01 : 0)) * 100) / 100)
                                                                })
                                                            }
                                                            return { ...prev, [monthsKey]: newMonths, [instKey]: newInst, [datesKey]: newDates }
                                                        })
                                                        setEditingEvent(null)
                                                    }}
                                                    style={{
                                                        width: '100%', height: 18, border: 'none', borderRadius: 4,
                                                        background: '#fee',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer', gap: 4,
                                                    }}
                                                >
                                                    <svg width="9" height="10" viewBox="0 0 24 24" fill="none" stroke="#e06470" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="3 6 5 6 21 6" />
                                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                    </svg>
                                                    <span style={{ fontSize: 8, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#e06470' }}>Remove instalment</span>
                                                </button>
                                            )
                                        }
                                        return (
                                            <button
                                                onClick={() => {
                                                    if (editingEvent.editType === 'oneOffIncome' || editingEvent.editType === 'oneOffExpense') {
                                                        const dir = editingEvent.editType === 'oneOffIncome' ? 'in' : 'out'
                                                        const updated = (formData.oneOffItems || []).filter(item => {
                                                            const amt = parseFloat(String(item.amount || '0').replace(/,/g, ''))
                                                            return !(item.date === editingEvent.date && (item.direction || 'out') === dir && amt === editingEvent.amount)
                                                        })
                                                        updateField('oneOffItems', updated.length > 0 ? updated : [{ name: '', amount: '', date: '', direction: 'out' }])
                                                    } else {
                                                        const key = `${editingEvent.editType}:${editingEvent.date}`
                                                        updateField('removedEvents', [...(formData.removedEvents || []), key])
                                                    }
                                                    setEditingEvent(null)
                                                }}
                                                style={{
                                                    width: '100%', height: 18, border: 'none', borderRadius: 4,
                                                    background: '#fee',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: 'pointer', gap: 4,
                                                }}
                                            >
                                                <svg width="9" height="10" viewBox="0 0 24 24" fill="none" stroke="#e06470" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="3 6 5 6 21 6" />
                                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                </svg>
                                                <span style={{ fontSize: 8, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#e06470' }}>Delete payment</span>
                                            </button>
                                        )
                                    })()}
                                </div>
                            )}
                        </div>
                    </>
                )
            })()}

            {/* Overdraft edit popup */}
            {editingOverdraft && (() => {
                const w = 140
                const left = Math.max(8, Math.min(editingOverdraft.clickX - w / 2, window.innerWidth - w - 8))
                const top = editingOverdraft.clickY + 8
                return (
                    <>
                        <div
                            onClick={() => setEditingOverdraft(null)}
                            style={{ position: 'fixed', inset: 0, zIndex: 100 }}
                        />
                        <div style={{
                            position: 'fixed',
                            left, top,
                            width: w,
                            background: '#fff',
                            borderRadius: 8,
                            zIndex: 101,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                            padding: '5px 4px 4px',
                        }}>
                            <span style={{
                                fontSize: 8, fontWeight: 600,
                                fontFamily: 'Nunito, sans-serif',
                                color: '#999',
                                padding: '0 3px',
                                display: 'block',
                                marginBottom: 3,
                            }}>
                                Overdraft limit
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <div style={{
                                    display: 'flex', alignItems: 'center',
                                    background: '#f5f5f5', borderRadius: 5,
                                    padding: '0 6px', height: 24, gap: 2,
                                    width: 76,
                                }}>
                                    <span style={{
                                        fontSize: 11, fontWeight: 600,
                                        color: '#aaa', fontFamily: 'Nunito, sans-serif',
                                    }}>{getCurrencySymbol()}</span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={formatDisplay(editOverdraftAmount)}
                                        onChange={(e) => setEditOverdraftAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                                        ref={(el) => el && setTimeout(() => el.focus({ preventScroll: true }), 50)}
                                        style={{
                                            flex: 1, border: 'none',
                                            background: 'transparent',
                                            fontSize: 11, fontWeight: 700,
                                            fontFamily: 'Nunito, sans-serif',
                                            color: '#000', outline: 'none', padding: 0,
                                            width: 0, minWidth: 0,
                                        }}
                                    />
                                </div>
                                <button
                                    onClick={() => {
                                        setShowOverdraft(prev => {
                                            localStorage.setItem('budgeup_show_overdraft', String(!prev))
                                            return !prev
                                        })
                                    }}
                                    style={{
                                        width: 24, height: 24,
                                        border: 'none', borderRadius: 5,
                                        background: showOverdraft ? '#fdf0f1' : '#f5f5f5',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', flexShrink: 0,
                                    }}
                                >
                                    {showOverdraft
                                        ? <Eye size={12} color="#e06470" />
                                        : <EyeOff size={12} color="#aaa" />
                                    }
                                </button>
                                <button
                                    onClick={() => {
                                        const val = editOverdraftAmount.replace(/[^0-9.]/g, '')
                                        updateField('overdraft', val)
                                        analytics.track(DASHBOARD_EVENTS.OVERDRAFT_UPDATED, {
                                            has_overdraft: parseFloat(val) > 0,
                                        })
                                        setEditingOverdraft(null)
                                    }}
                                    style={{
                                        width: 24, height: 24,
                                        border: 'none', borderRadius: 5,
                                        background: '#e06470',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', flexShrink: 0,
                                    }}
                                >
                                    <svg width="10" height="7" viewBox="0 0 14 10" fill="none">
                                        <path d="M1 5L5 9L13 1" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </>
                )
            })()}

            {/* Balance toast */}
            {balanceToast && (
                <div style={{
                    position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
                    background: '#1a1a1a', color: '#fff',
                    padding: '10px 20px', borderRadius: 12,
                    fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                    zIndex: 1100, whiteSpace: 'nowrap',
                    animation: 'toastIn 0.25s ease',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                }}>
                    {balanceToast}
                </div>
            )}

        </div>
    )
}
