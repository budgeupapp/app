import { useState, useEffect, useRef, useCallback } from 'react'
import { toLocalDate, makeOtherInstance, MONTH_KEY_TO_DATE, MONTH_SHORT, isInTerm, distributeEvenly, addMonths } from '../lib/helpers'
import { getCurrencySymbol, getGraphStart, setGraphStart } from '../lib/settings'
import { Button, Input, Modal, Radio, Typography, message } from 'antd'
import StepProgress from '../components/StepProgress'
import NativeSelect from '../components/NativeSelect'
import universityIllustration from '../assets/university-illustration.svg'
import incomeLoan from '../assets/income-loan.svg'
import incomeFamily from '../assets/income-friends.svg'
import incomeWork from '../assets/income-work.svg'
import iconOtherIncome from '../assets/icon-other-income.svg'
import expenseRent from '../assets/expense-rent.svg'
import expenseBills from '../assets/expense-bills.svg'
import expenseUnifees from '../assets/expense-unifees.svg'
import expenseSavings from '../assets/expense-savings.svg'
import iconOtherExpense from '../assets/icon-other-expense.svg'
import incomeBursary from '../assets/income-family.svg'
import variableWeeklySpend from '../assets/variable-weekly-spend.svg'
import variableOneOff from '../assets/variable-one-off.svg'
import TermDatesStep from './TermDatesStep'
import TermGraph, { refreshAY, AY_START, AY_END } from '../components/TermGraph'
import BankBalanceStep from './BankBalanceStep'
import RegularIncomeStep from './RegularIncomeStep'
import MaintenanceLoanStep from './MaintenanceLoanStep'
import BursaryStep from './BursaryStep'
import FamilyFriendsStep from './FamilyFriendsStep'
import WorkIncomeStep from './WorkIncomeStep'
import OtherIncomeStep from './OtherIncomeStep'
import RentStep from './RentStep'
import RegularExpensesStep from './RegularExpensesStep'
import BillsStep from './BillsStep'
import UniFeesStep from './UniFeesStep'
import SavingsInvestmentsStep from './SavingsInvestmentsStep'
import OtherExpenseStep from './OtherExpenseStep'
import OverdraftStep from './OverdraftStep'
import OneOffItemsStep from './OneOffItemsStep'
import WeeklySpendStep from './WeeklySpendStep'
import { SOURCE_ICONS } from './Dashboard'
import { PiShuffle, PiShoppingCart, PiTrendUp, PiTrendDown } from 'react-icons/pi'
import { supabase } from '../lib/supabaseClient'
import { saveCashflowForecast, saveUserFinances, saveTermDates, saveBalanceHistory } from '../lib/api'
import {
    analytics,
    ONBOARDING_EVENTS,
    AUTH_EVENTS,
    getOnboardingStepProperties,
    getUserProperties,
    getStudentLoanProperties,
    getBursaryProperties
} from '../lib/analytics/index.js'
import {
    STEPS,
    UK_UNIVERSITIES,
    MONTH_LABELS,
    ALL_MONTH_KEYS,
    DEFAULT_LOAN_MONTHS,
    OTHER_INCOME_TYPE_OPTIONS,
    OTHER_INCOME_FREQ_OPTIONS,
    REGULAR_FREQ_OPTIONS,
    PAYMENT_TYPE_OPTIONS,
    INITIAL_FORM_DATA,
    getTermDatesForUniversity,
    hasCustomTermDates
} from '../config/onboardingConfig'

const { Title, Text } = Typography

const STORAGE_KEY = 'budgeup_onboarding_state'

// Lookup step config by id for passing heading/subtitle to step components
const STEP_CONFIG = Object.fromEntries(STEPS.map(s => [s.id, s]))

/* ---------- HELPERS ---------- */

const formatMoney = raw => {
    const cleaned = raw.replace(/[^0-9.]/g, '')
    const parts = cleaned.split('.')
    const whole = parts[0] || ''
    const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return parts.length > 1 ? `${formatted}.${parts[1]}` : formatted
}

/* ---------- GRAPH EVENT HELPERS ---------- */

const ayStartStr = () => AY_START.toISOString().slice(0, 10)
const defaultQuarterlyDates = () => {
    const d = new Date(AY_START)
    return [1, 2, 3, 4].map((_, i) => {
        const q = addMonths(new Date(d.getFullYear(), d.getMonth(), 1), i * 3)
        return toLocalDate(q)
    })
}

function generateRentDates(frequency, nextDate, formData = {}) {
    const dates = []
    const ayStart = AY_START
    const ayEnd = AY_END

    if (!frequency) return dates

    // For weekly: generate actual weekly dates
    if (frequency === 'weekly') {
        let d = nextDate ? new Date(nextDate + 'T00:00:00') : new Date(AY_START)
        // Walk back to find the first weekly date on or after ayStart
        while (d > ayStart) d = new Date(d.getTime() - 7 * 24 * 60 * 60 * 1000)
        while (d < ayStart) d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
        while (d <= ayEnd) {
            dates.push(toLocalDate(d))
            d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
        }
        return dates
    }

    // Termly: use term start dates (or overridden rentTermDates)
    if (frequency === 'termly') {
        const terms = formData.termDates?.terms || []
        const overrides = formData.rentTermDates || {}
        for (const term of terms) {
            const date = overrides[term.id] || term.start
            if (!date) continue
            const d = new Date(date + 'T00:00:00')
            if (d >= ayStart && d <= ayEnd) {
                dates.push(date)
            }
        }
        return dates
    }

    // Quarterly: use exact dates if provided, otherwise use default quarterly dates
    if (frequency === 'quarterly') {
        const qDates = formData.rentQuarterlyDates || {}
        const QD = defaultQuarterlyDates()
        for (let i = 0; i < 4; i++) {
            const date = qDates[i] || QD[i]
            if (!date) continue
            const d = new Date(date + 'T00:00:00')
            if (d >= ayStart && d <= ayEnd) {
                dates.push(date)
            }
        }
        dates.sort()
        return dates
    }

    // Monthly / quarterly — use nextDate only for day-of-month, generate across full academic year
    let current = nextDate ? new Date(nextDate + 'T00:00:00') : new Date(AY_START)
    const dom = current.getDate()
    const step = frequency === 'quarterly' ? 3 : 1
    // Backtrack to before ayStart, preserving day-of-month
    while (current > ayStart) current = addMonths(current, -step, dom)
    // Advance to first occurrence on or after ayStart
    while (current < ayStart) current = addMonths(current, step, dom)
    while (current <= ayEnd) {
        dates.push(toLocalDate(current))
        current = addMonths(current, step, dom)
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

function buildGraphEvents(formData) {
    const events = []
    const terms = formData.termDates?.terms || []
    const removedSet = new Set(formData.removedEvents || [])

    // Maintenance loan income events
    if (formData.incomeSources?.includes('maintenance_loan')) {
        const months = formData.loanMonths || DEFAULT_LOAN_MONTHS
        const totalAmount = parseFloat(String(formData.loanAmount || '0').replace(/,/g, ''))

        const loanDateObjs = months.map(m => ({ date: formData.loanDates?.[m] || MONTH_KEY_TO_DATE[m] }))
        const loanAmounts = distributeExcludingRemoved(totalAmount, loanDateObjs, 'loan', removedSet)
        for (let mi = 0; mi < months.length; mi++) {
            const month = months[mi]
            const date = formData.loanDates?.[month] || MONTH_KEY_TO_DATE[month]
            if (!date) continue

            const instalmentAmt = parseFloat(String(formData.instalmentAmounts?.[month] || '0').replace(/,/g, ''))
            const amount = instalmentAmt > 0 ? instalmentAmt : (totalAmount > 0 ? loanAmounts[mi] : 0)

            if (amount <= 0) continue

            events.push({
                date,
                amount,
                type: 'income',
                label: 'Loan Instalment',
                sublabel: `${MONTH_SHORT[month]} loan payment`,
                editType: 'loan',
                editMonth: month,
            })
        }
    }

    // Bursary income events
    if (formData.incomeSources?.includes('bursary')) {
        const DEFAULT_BURSARY_MONTHS = ['october', 'february', 'march']
        const DEFAULT_BURSARY_DATES = { october: '2025-10-27', february: '2026-02-09', march: '2026-03-30' }
        const months = formData.bursaryMonths || DEFAULT_BURSARY_MONTHS
        const totalAmount = parseFloat(String(formData.bursaryAmount || '0').replace(/,/g, ''))

        const bursaryDateObjs = months.map(m => ({ date: formData.bursaryDates?.[m] || DEFAULT_BURSARY_DATES[m] || MONTH_KEY_TO_DATE[m] }))
        const bursaryAmounts = distributeExcludingRemoved(totalAmount, bursaryDateObjs, 'bursary', removedSet)
        for (let mi = 0; mi < months.length; mi++) {
            const month = months[mi]
            const date = formData.bursaryDates?.[month] || DEFAULT_BURSARY_DATES[month] || MONTH_KEY_TO_DATE[month]
            if (!date) continue
            const instalmentAmt = parseFloat(String(formData.bursaryInstalmentAmounts?.[month] || '0').replace(/,/g, ''))
            const amount = instalmentAmt > 0 ? instalmentAmt : (totalAmount > 0 ? bursaryAmounts[mi] : 0)
            if (amount <= 0) continue
            events.push({
                date, amount, type: 'income',
                label: 'Bursary',
                sublabel: `${MONTH_SHORT[month]} bursary`,
                editType: 'bursary', editMonth: month,
            })
        }
    }

    // Family/friends income events
    if (formData.incomeSources?.includes('family_friends')) {
        const famAmtRaw = parseFloat(String(formData.familyAmount || '0').replace(/,/g, ''))
        const freq = formData.familyFrequency || 'monthly'
        const famAmtPeriod = formData.familyAmountPeriod || freq || 'monthly'
        const isYearlyInput = famAmtPeriod === 'yearly'
        const onlyTermTime = isYearlyInput && formData.familyVariesByTerm
        if (famAmtRaw > 0) {
            const ayStart = AY_START
            const YM = { weekly: 52, monthly: 12, quarterly: 4, termly: terms.length || 2, yearly: 1 }
            const yearlyTotal = famAmtRaw * (YM[famAmtPeriod] || 1)
            if (isYearlyInput) {
                const allDates = []
                if (freq === 'weekly') {
                    let d = formData.familyNextDate ? new Date(formData.familyNextDate + 'T00:00:00') : new Date(AY_START)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: 'Weekly support' }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (freq === 'monthly') {
                    let d = formData.familyNextDate ? new Date(formData.familyNextDate + 'T00:00:00') : new Date(AY_START)
                    const dom = d.getDate()
                    while (d > ayStart) d = addMonths(d, -1, dom)
                    while (d < ayStart) d = addMonths(d, 1, dom)
                    while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} support` }); d = addMonths(d, 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = formData.familyTermDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) allDates.push({ date, sublabel: `${term.name} support` }) }
                } else if (freq === 'quarterly') {
                    const qDates = formData.familyQuarterlyDates || {}
                    const QD = defaultQuarterlyDates()
                    for (let i = 0; i < 4; i++) allDates.push({ date: qDates[i] || QD[i], sublabel: `Q${i + 1} support` })
                } else if (freq === 'yearly') {
                    allDates.push({ date: formData.familyNextDate || ayStartStr(), sublabel: 'Yearly support' })
                }
                const dates = onlyTermTime ? allDates.filter(d => isInTerm(d.date, terms)) : allDates
                if (dates.length > 0) {
                    const amounts = distributeExcludingRemoved(yearlyTotal, dates, 'family', removedSet)
                    for (let i = 0; i < dates.length; i++) {
                        events.push({ date: dates[i].date, amount: amounts[i], type: 'income', label: 'Family/Friends', sublabel: dates[i].sublabel, editType: 'family' })
                    }
                }
            } else {
                const famNonTermAmt = formData.familyVariesByTerm ? parseFloat(String(formData.familyNonTermAmount || '0').replace(/,/g, '')) : famAmtRaw
                const getFamAmt = (ds) => formData.familyVariesByTerm ? (isInTerm(ds, terms) ? famAmtRaw : famNonTermAmt) : famAmtRaw
                if (freq === 'weekly') {
                    let d = formData.familyNextDate ? new Date(formData.familyNextDate + 'T00:00:00') : new Date(AY_START)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) { const ds = toLocalDate(d); const a = getFamAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'income', label: 'Family/Friends', sublabel: 'Weekly support', editType: 'family' }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (freq === 'monthly') {
                    let d = formData.familyNextDate ? new Date(formData.familyNextDate + 'T00:00:00') : new Date(AY_START)
                    const dom = d.getDate()
                    while (d > ayStart) d = addMonths(d, -1, dom)
                    while (d < ayStart) d = addMonths(d, 1, dom)
                    while (d <= ayEnd) { const ds = toLocalDate(d); const a = getFamAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'income', label: 'Family/Friends', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} support`, editType: 'family' }); d = addMonths(d, 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = formData.familyTermDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) events.push({ date, amount: famAmtRaw, type: 'income', label: 'Family/Friends', sublabel: `${term.name} support`, editType: 'family' }) }
                } else if (freq === 'quarterly') {
                    const qDates = formData.familyQuarterlyDates || {}
                    const QD = defaultQuarterlyDates()
                    for (let i = 0; i < 4; i++) { const date = qDates[i] || QD[i]; const a = getFamAmt(date); if (a > 0) events.push({ date, amount: a, type: 'income', label: 'Family/Friends', sublabel: `Q${i + 1} support`, editType: 'family' }) }
                }
            }
        }
    }

    // Work events
    if (formData.incomeSources?.includes('work')) {
        const workAmt = parseFloat(String(formData.workAmount || '0').replace(/,/g, ''))
        const freq = formData.workFrequency || 'monthly'
        const workAmtPeriod = formData.workAmountPeriod || (formData.workEntryMode === 'yearly' ? 'yearly' : freq)
        const isYearlyWork = workAmtPeriod === 'yearly'
        const onlyTermTimeWork = isYearlyWork && formData.workVariesByTerm

        if (workAmt > 0 && freq) {
            const ayStart = AY_START
            const ayEnd = AY_END
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
                    while (d > ayStart) d = addMonths(d, -1, dom)
                    while (d < ayStart) d = addMonths(d, 1, dom)
                    while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} income` }); d = addMonths(d, 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = formData.workTermDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) allDates.push({ date, sublabel: `${term.name} income` }) }
                } else if (freq === 'quarterly') {
                    const qDates = formData.workQuarterlyDates || {}
                    const QD = defaultQuarterlyDates()
                    for (let i = 0; i < 4; i++) allDates.push({ date: qDates[i] || QD[i], sublabel: `Q${i + 1} income` })
                } else if (freq === 'yearly') {
                    allDates.push({ date: formData.workNextDate || ayStartStr(), sublabel: 'Yearly income' })
                }
                const dates = onlyTermTimeWork ? allDates.filter(d => isInTerm(d.date, terms)) : allDates
                if (dates.length > 0) {
                    const amounts = distributeExcludingRemoved(yearlyWork, dates, 'work', removedSet)
                    for (let i = 0; i < dates.length; i++) {
                        events.push({ date: dates[i].date, amount: amounts[i], type: 'income', label: 'Work', sublabel: dates[i].sublabel, editType: 'work' })
                    }
                }
            } else {
                const workNonTermAmt = formData.workVariesByTerm ? parseFloat(String(formData.workNonTermAmount || '0').replace(/,/g, '')) : workAmt
                const getWorkAmt = (ds) => formData.workVariesByTerm ? (isInTerm(ds, terms) ? workAmt : workNonTermAmt) : workAmt
                if (freq === 'weekly') {
                    let d = formData.workNextDate ? new Date(formData.workNextDate + 'T00:00:00') : new Date(AY_START)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) { const ds = toLocalDate(d); const a = getWorkAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'income', label: 'Work', sublabel: 'Weekly income', editType: 'work' }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (freq === 'monthly') {
                    let d = formData.workNextDate ? new Date(formData.workNextDate + 'T00:00:00') : new Date(AY_START)
                    const dom = d.getDate()
                    while (d > ayStart) d = addMonths(d, -1, dom)
                    while (d < ayStart) d = addMonths(d, 1, dom)
                    while (d <= ayEnd) { const ds = toLocalDate(d); const a = getWorkAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'income', label: 'Work', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} income`, editType: 'work' }); d = addMonths(d, 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = formData.workTermDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) events.push({ date, amount: workAmt, type: 'income', label: 'Work', sublabel: `${term.name} income`, editType: 'work' }) }
                } else if (freq === 'quarterly') {
                    const qDates = formData.workQuarterlyDates || {}
                    const QD = defaultQuarterlyDates()
                    for (let i = 0; i < 4; i++) { const date = qDates[i] || QD[i]; const a = getWorkAmt(date); if (a > 0) events.push({ date, amount: a, type: 'income', label: 'Work', sublabel: `Q${i + 1} income`, editType: 'work' }) }
                } else if (freq === 'yearly') {
                    if (workAmt > 0) events.push({ date: formData.workNextDate || ayStartStr(), amount: workAmt, type: 'income', label: 'Work', sublabel: 'Yearly income', editType: 'work' })
                }
            }
        }
    }



    // Other income events - loop over otherIncomes array
    for (const inst of (formData.otherIncomes || [])) {
        const otherAmt = parseFloat(String(inst.amount || '0').replace(/,/g, ''))
        const freq = inst.frequency || 'monthly'
        const lbl = inst.label || 'Other Income'
        const otherAmtPeriod = inst.amountPeriod || freq || 'monthly'
        const isYearlyOther = otherAmtPeriod === 'yearly'
        const onlyTermTimeOther = isYearlyOther && inst.variesByTerm

        if (otherAmt > 0) {
            const ayStart = AY_START
            const ayEnd = AY_END
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
                    while (d > ayStart) d = addMonths(d, -1, dom)
                    while (d < ayStart) d = addMonths(d, 1, dom)
                    while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })}` }); d = addMonths(d, 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = inst.termDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) allDates.push({ date, sublabel: `${term.name}` }) }
                } else if (freq === 'quarterly') {
                    const qDates = inst.quarterlyDates || {}
                    const QD = defaultQuarterlyDates()
                    for (let i = 0; i < 4; i++) allDates.push({ date: qDates[i] || QD[i], sublabel: `Q${i + 1}` })
                } else if (freq === 'yearly') {
                    allDates.push({ date: inst.nextDate || ayStartStr(), sublabel: 'Yearly income' })
                }
                const dates = onlyTermTimeOther ? allDates.filter(d => isInTerm(d.date, terms)) : allDates
                if (dates.length > 0) {
                    const amounts = distributeExcludingRemoved(yearlyOther, dates, inst.id, removedSet)
                    for (let i = 0; i < dates.length; i++) {
                        events.push({ date: dates[i].date, amount: amounts[i], type: 'income', label: lbl, sublabel: dates[i].sublabel, editType: inst.id })
                    }
                }
            } else {
                const otherNonTermAmt = inst.variesByTerm ? parseFloat(String(inst.nonTermAmount || '0').replace(/,/g, '')) : otherAmt
                const getOtherAmt = (ds) => inst.variesByTerm ? (isInTerm(ds, terms) ? otherAmt : otherNonTermAmt) : otherAmt
                if (freq === 'weekly') {
                    let d = inst.nextDate ? new Date(inst.nextDate + 'T00:00:00') : new Date(AY_START)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) { const ds = toLocalDate(d); const a = getOtherAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'income', label: lbl, sublabel: 'Weekly', editType: inst.id }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (freq === 'monthly') {
                    let d = inst.nextDate ? new Date(inst.nextDate + 'T00:00:00') : new Date(AY_START)
                    const dom = d.getDate()
                    while (d > ayStart) d = addMonths(d, -1, dom)
                    while (d < ayStart) d = addMonths(d, 1, dom)
                    while (d <= ayEnd) { const ds = toLocalDate(d); const a = getOtherAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'income', label: lbl, sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })}`, editType: inst.id }); d = addMonths(d, 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = inst.termDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) events.push({ date, amount: otherAmt, type: 'income', label: lbl, sublabel: `${term.name}`, editType: inst.id }) }
                } else if (freq === 'quarterly') {
                    const qDates = inst.quarterlyDates || {}
                    const QD = defaultQuarterlyDates()
                    for (let i = 0; i < 4; i++) { const date = qDates[i] || QD[i]; const a = getOtherAmt(date); if (a > 0) events.push({ date, amount: a, type: 'income', label: lbl, sublabel: `Q${i + 1}`, editType: inst.id }) }
                } else if (freq === 'yearly') {
                    if (otherAmt > 0) events.push({ date: inst.nextDate || ayStartStr(), amount: otherAmt, type: 'income', label: lbl, sublabel: 'Yearly income', editType: inst.id })
                }
            }
        }
    }

    // Rent expense events
    const rentAmt = parseFloat(String(formData.rentAmount || '0').replace(/,/g, ''))
    const rentFreq = formData.rentFrequency || 'monthly'
    if (rentAmt > 0 && formData.expenseSources?.includes('rent')) {
        const allRentDates = generateRentDates(rentFreq, formData.rentNextDate, formData)
        const rentDates = allRentDates.filter(d => {
            if (formData.rentStartDate && d < formData.rentStartDate) return false
            if (formData.rentEndDate && d > formData.rentEndDate) return false
            return true
        })
        const rentAmtPeriod = formData.rentAmountPeriod || (formData.rentEntryMode === 'yearly' ? 'yearly' : rentFreq)
        const isYearlyRent = rentAmtPeriod === 'yearly'
        const onlyTermTimeRent = isYearlyRent && formData.rentVariesByTerm
        const YM = { weekly: 52, monthly: 12, quarterly: 4, termly: terms.length || 2, yearly: 1 }
        const yearlyRent = rentAmt * (YM[rentAmtPeriod] || 1)

        if (isYearlyRent) {
            const filteredDates = onlyTermTimeRent ? rentDates.filter(d => isInTerm(d, terms)) : rentDates
            const rentDateObjs = filteredDates.map(d => ({ date: d }))
            const rentAmounts = distributeExcludingRemoved(yearlyRent, rentDateObjs, 'rent', removedSet)
            for (let ri = 0; ri < filteredDates.length; ri++) {
                const date = filteredDates[ri]
                const dt = new Date(date + 'T00:00:00')
                const monthName = dt.toLocaleDateString('en-GB', { month: 'long' })
                events.push({ date, amount: rentAmounts[ri], type: 'expense', label: 'Rent', sublabel: `${monthName} rent`, editType: 'rent' })
            }
        } else {
            const rentNonTermAmt = formData.rentVariesByTerm ? parseFloat(String(formData.rentNonTermAmount || '0').replace(/,/g, '')) : rentAmt
            const getRentAmt = (ds) => formData.rentVariesByTerm ? (isInTerm(ds, terms) ? rentAmt : rentNonTermAmt) : rentAmt
            for (let ri = 0; ri < rentDates.length; ri++) {
                const date = rentDates[ri]
                const a = getRentAmt(date)
                if (a > 0) {
                    const dt = new Date(date + 'T00:00:00')
                    const monthName = dt.toLocaleDateString('en-GB', { month: 'long' })
                    events.push({ date, amount: a, type: 'expense', label: 'Rent', sublabel: `${monthName} rent`, editType: 'rent' })
                }
            }
        }
    }

    // Bills expense events
    const billsAmt = parseFloat(String(formData.billsAmount || '0').replace(/,/g, ''))
    if (billsAmt > 0 && formData.expenseSources?.includes('bills')) {
        const freq = formData.billsFrequency || 'monthly'
        const billsAmtPeriod = formData.billsAmountPeriod || (formData.billsEntryMode === 'yearly' ? 'yearly' : freq)
        const isYearlyBills = billsAmtPeriod === 'yearly'
        const onlyTermTimeBills = isYearlyBills && formData.billsVariesByTerm
        const ayStart = AY_START
        const ayEnd = AY_END
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
                while (d > ayStart) d = addMonths(d, -1, dom)
                while (d < ayStart) d = addMonths(d, 1, dom)
                while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} bills` }); d = addMonths(d, 1, dom) }
            } else if (freq === 'termly') {
                const overrides = formData.billsTermDates || {}
                for (const term of terms) { const date = overrides[term.id] || term.start; if (date) allDates.push({ date, sublabel: `${term.name} bills` }) }
            } else if (freq === 'quarterly') {
                const qDates = formData.billsQuarterlyDates || {}
                const QD = defaultQuarterlyDates()
                for (let i = 0; i < 4; i++) allDates.push({ date: qDates[i] || QD[i], sublabel: `Q${i + 1} bills` })
            } else if (freq === 'yearly') {
                allDates.push({ date: formData.billsNextDate || ayStartStr(), sublabel: 'Yearly bills' })
            }
            const filteredDates = (onlyTermTimeBills ? allDates.filter(d => isInTerm(d.date, terms)) : allDates).filter(d => billsInRange(d.date))
            if (filteredDates.length > 0) {
                const amounts = distributeExcludingRemoved(yearlyBills, filteredDates, 'bills', removedSet)
                for (let i = 0; i < filteredDates.length; i++) {
                    events.push({ date: filteredDates[i].date, amount: amounts[i], type: 'expense', label: 'Bills', sublabel: filteredDates[i].sublabel, editType: 'bills' })
                }
            }
        } else {
            const billsNonTermAmt = formData.billsVariesByTerm ? parseFloat(String(formData.billsNonTermAmount || '0').replace(/,/g, '')) : billsAmt
            const getBillsAmt = (ds) => formData.billsVariesByTerm ? (isInTerm(ds, terms) ? billsAmt : billsNonTermAmt) : billsAmt
            if (freq === 'weekly') {
                let d = formData.billsNextDate ? new Date(formData.billsNextDate + 'T00:00:00') : new Date(AY_START)
                while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                while (d <= ayEnd) { const ds = toLocalDate(d); if (billsInRange(ds)) { const a = getBillsAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'expense', label: 'Bills', sublabel: 'Weekly bills', editType: 'bills' }) }; d = new Date(d.getTime() + 7 * 86400000) }
            } else if (freq === 'monthly') {
                let d = formData.billsNextDate ? new Date(formData.billsNextDate + 'T00:00:00') : new Date(AY_START)
                const dom = d.getDate()
                while (d > ayStart) d = addMonths(d, -1, dom)
                while (d < ayStart) d = addMonths(d, 1, dom)
                while (d <= ayEnd) { const ds = toLocalDate(d); if (billsInRange(ds)) { const a = getBillsAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'expense', label: 'Bills', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} bills`, editType: 'bills' }) }; d = addMonths(d, 1, dom) }
            } else if (freq === 'termly') {
                const overrides = formData.billsTermDates || {}
                for (const term of terms) { const date = overrides[term.id] || term.start; if (date && billsInRange(date)) { const a = getBillsAmt(date); if (a > 0) events.push({ date, amount: a, type: 'expense', label: 'Bills', sublabel: `${term.name} bills`, editType: 'bills' }) } }
            } else if (freq === 'quarterly') {
                const qDates = formData.billsQuarterlyDates || {}
                const QD = defaultQuarterlyDates()
                for (let i = 0; i < 4; i++) { const date = qDates[i] || QD[i]; if (billsInRange(date)) { const a = getBillsAmt(date); if (a > 0) events.push({ date, amount: a, type: 'expense', label: 'Bills', sublabel: `Q${i + 1} bills`, editType: 'bills' }) } }
            } else if (freq === 'yearly') {
                const dateString = formData.billsNextDate || ayStartStr(); if (billsInRange(dateString)) { const a = getBillsAmt(dateString); if (a > 0) events.push({ date: dateString, amount: a, type: 'expense', label: 'Bills', sublabel: 'Yearly bills', editType: 'bills' }) }
            }
        }
    }

    // University fees events
    if (formData.expenseSources?.includes('uni_fees')) {
        const uniAmt = parseFloat(String(formData.uniFeesAmount || '0').replace(/,/g, ''))
        if (uniAmt > 0) {
            const uniAmtPeriod = formData.uniFeesAmountPeriod || 'yearly'
            const uniFreq = uniAmtPeriod === 'yearly' ? (formData.uniFeesFrequency || 'monthly') : uniAmtPeriod
            const isYearlyUni = uniAmtPeriod === 'yearly'
            const onlyTermTimeUni = isYearlyUni && formData.uniFeesVariesByTerm
            const ayStart = AY_START
            const YM = { weekly: 52, monthly: 12, quarterly: 4, termly: terms.length || 2, yearly: 1 }
            const yearlyUni = uniAmt * (YM[uniAmtPeriod] || 1)
            if (isYearlyUni) {
                const allDates = []
                if (uniFreq === 'weekly') {
                    let d = formData.uniFeesNextDate ? new Date(formData.uniFeesNextDate + 'T00:00:00') : new Date(AY_START)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: 'Weekly fees' }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (uniFreq === 'yearly') {
                    allDates.push({ date: formData.uniFeesNextDate || ayStartStr(), sublabel: 'Yearly tuition' })
                } else if (uniFreq === 'monthly') {
                    const dom = formData.uniFeesNextDate ? new Date(formData.uniFeesNextDate + 'T00:00:00').getDate() : 1
                    let d = new Date(AY_START.getFullYear(), AY_START.getMonth(), dom)
                    while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} fees` }); d = addMonths(d, 1, dom) }
                } else if (uniFreq === 'termly') {
                    const overrides = formData.uniFeesTermDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) allDates.push({ date, sublabel: `${term.name} fees` }) }
                } else if (uniFreq === 'quarterly') {
                    const qDates = formData.uniFeesQuarterlyDates || {}
                    const QD = defaultQuarterlyDates()
                    for (let i = 0; i < 4; i++) allDates.push({ date: qDates[i] || QD[i], sublabel: `Q${i + 1} fees` })
                }
                const filteredDates = onlyTermTimeUni ? allDates.filter(d => isInTerm(d.date, terms)) : allDates
                if (filteredDates.length > 0) {
                    const amounts = distributeExcludingRemoved(yearlyUni, filteredDates, 'uniFees', removedSet)
                    for (let i = 0; i < filteredDates.length; i++) {
                        events.push({ date: filteredDates[i].date, amount: amounts[i], type: 'expense', label: 'University Fees', sublabel: filteredDates[i].sublabel, editType: 'uniFees' })
                    }
                }
            } else {
                const uniNonTermAmt = formData.uniFeesVariesByTerm ? parseFloat(String(formData.uniFeesNonTermAmount || '0').replace(/,/g, '')) : uniAmt
                const getUniAmt = (ds) => formData.uniFeesVariesByTerm ? (isInTerm(ds, terms) ? uniAmt : uniNonTermAmt) : uniAmt
                if (uniFreq === 'weekly') {
                    let d = formData.uniFeesNextDate ? new Date(formData.uniFeesNextDate + 'T00:00:00') : new Date(AY_START)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) { const ds = toLocalDate(d); const a = getUniAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'expense', label: 'University Fees', sublabel: 'Weekly fees', editType: 'uniFees' }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (uniFreq === 'yearly') {
                    events.push({ date: formData.uniFeesNextDate || ayStartStr(), amount: uniAmt, type: 'expense', label: 'University Fees', sublabel: 'Yearly tuition', editType: 'uniFees' })
                } else if (uniFreq === 'monthly') {
                    const dom = formData.uniFeesNextDate ? new Date(formData.uniFeesNextDate + 'T00:00:00').getDate() : 1
                    let d = new Date(AY_START.getFullYear(), AY_START.getMonth(), dom)
                    while (d <= ayEnd) { const ds = toLocalDate(d); const a = getUniAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'expense', label: 'University Fees', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} fees`, editType: 'uniFees' }); d = addMonths(d, 1, dom) }
                } else if (uniFreq === 'termly') {
                    const overrides = formData.uniFeesTermDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) events.push({ date, amount: uniAmt, type: 'expense', label: 'University Fees', sublabel: `${term.name} fees`, editType: 'uniFees' }) }
                } else if (uniFreq === 'quarterly') {
                    const qDates = formData.uniFeesQuarterlyDates || {}
                    const QD = defaultQuarterlyDates()
                    for (let i = 0; i < 4; i++) { const date = qDates[i] || QD[i]; const a = getUniAmt(date); if (a > 0) events.push({ date, amount: a, type: 'expense', label: 'University Fees', sublabel: `Q${i + 1} fees`, editType: 'uniFees' }) }
                }
            }
        }
    }

    // Savings & Investments events
    if (formData.expenseSources?.includes('savings_investments')) {
        const savAmt = parseFloat(String(formData.savingsInvAmount || '0').replace(/,/g, ''))
        if (savAmt > 0) {
            const freq = formData.savingsInvFrequency || 'monthly'
            const savAmtPeriod = formData.savingsInvAmountPeriod || (formData.savingsInvEntryMode === 'yearly' ? 'yearly' : freq)
            const isYearlySav = savAmtPeriod === 'yearly'
            const onlyTermTimeSav = isYearlySav && formData.savingsInvVariesByTerm
            const ayStart = AY_START
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
                    while (d > ayStart) d = addMonths(d, -1, dom)
                    while (d < ayStart) d = addMonths(d, 1, dom)
                    while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} savings` }); d = addMonths(d, 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = formData.savingsInvTermDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) allDates.push({ date, sublabel: `${term.name} savings` }) }
                } else if (freq === 'quarterly') {
                    const qDates = formData.savingsInvQuarterlyDates || {}
                    const QD = defaultQuarterlyDates()
                    for (let i = 0; i < 4; i++) allDates.push({ date: qDates[i] || QD[i], sublabel: `Q${i + 1} savings` })
                } else if (freq === 'yearly') {
                    allDates.push({ date: formData.savingsInvNextDate || ayStartStr(), sublabel: 'Yearly savings' })
                }
                const filteredDates = onlyTermTimeSav ? allDates.filter(d => isInTerm(d.date, terms)) : allDates
                if (filteredDates.length > 0) {
                    const amounts = distributeExcludingRemoved(yearlySav, filteredDates, 'savingsInv', removedSet)
                    for (let i = 0; i < filteredDates.length; i++) {
                        events.push({ date: filteredDates[i].date, amount: amounts[i], type: 'expense', label: 'Savings', sublabel: filteredDates[i].sublabel, editType: 'savingsInv' })
                    }
                }
            } else {
                const savNonTermAmt = formData.savingsInvVariesByTerm ? parseFloat(String(formData.savingsInvNonTermAmount || '0').replace(/,/g, '')) : savAmt
                const getSavAmt = (ds) => formData.savingsInvVariesByTerm ? (isInTerm(ds, terms) ? savAmt : savNonTermAmt) : savAmt
                if (freq === 'weekly') {
                    let d = formData.savingsInvNextDate ? new Date(formData.savingsInvNextDate + 'T00:00:00') : new Date(AY_START)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) { const ds = toLocalDate(d); const a = getSavAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'expense', label: 'Savings', sublabel: 'Weekly savings', editType: 'savingsInv' }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (freq === 'monthly') {
                    let d = formData.savingsInvNextDate ? new Date(formData.savingsInvNextDate + 'T00:00:00') : new Date(AY_START)
                    const dom = d.getDate()
                    while (d > ayStart) d = addMonths(d, -1, dom)
                    while (d < ayStart) d = addMonths(d, 1, dom)
                    while (d <= ayEnd) { const ds = toLocalDate(d); const a = getSavAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'expense', label: 'Savings', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} savings`, editType: 'savingsInv' }); d = addMonths(d, 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = formData.savingsInvTermDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) events.push({ date, amount: savAmt, type: 'expense', label: 'Savings', sublabel: `${term.name} savings`, editType: 'savingsInv' }) }
                } else if (freq === 'quarterly') {
                    const qDates = formData.savingsInvQuarterlyDates || {}
                    const QD = defaultQuarterlyDates()
                    for (let i = 0; i < 4; i++) { const date = qDates[i] || QD[i]; const a = getSavAmt(date); if (a > 0) events.push({ date, amount: a, type: 'expense', label: 'Savings', sublabel: `Q${i + 1} savings`, editType: 'savingsInv' }) }
                } else if (freq === 'yearly') {
                    events.push({ date: formData.savingsInvNextDate || ayStartStr(), amount: savAmt, type: 'expense', label: 'Savings', sublabel: 'Yearly savings', editType: 'savingsInv' })
                }
            }
        }
    }

    // Other expense events - loop over otherExpenses array
    for (const inst of (formData.otherExpenses || [])) {
        const otherExpAmt = parseFloat(String(inst.amount || '0').replace(/,/g, ''))
        const freq = inst.frequency || 'monthly'
        const lbl = inst.label || 'Other Expense'
        const otherExpAmtPeriod = inst.amountPeriod || freq || 'monthly'
        const isYearlyOtherExp = otherExpAmtPeriod === 'yearly'
        const onlyTermTimeOtherExp = isYearlyOtherExp && inst.variesByTerm

        if (otherExpAmt > 0) {
            const ayStart = AY_START
            const ayEnd = AY_END
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
                    while (d > ayStart) d = addMonths(d, -1, dom)
                    while (d < ayStart) d = addMonths(d, 1, dom)
                    while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: d.toLocaleDateString('en-GB', { month: 'long' }) }); d = addMonths(d, 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = inst.termDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) allDates.push({ date, sublabel: term.name }) }
                } else if (freq === 'quarterly') {
                    const qDates = inst.quarterlyDates || {}
                    const QD = defaultQuarterlyDates()
                    for (let i = 0; i < 4; i++) allDates.push({ date: qDates[i] || QD[i], sublabel: `Q${i + 1}` })
                } else if (freq === 'yearly') {
                    allDates.push({ date: inst.nextDate || ayStartStr(), sublabel: 'Yearly expense' })
                }
                const filteredDates = onlyTermTimeOtherExp ? allDates.filter(d => isInTerm(d.date, terms)) : allDates
                if (filteredDates.length > 0) {
                    const amounts = distributeExcludingRemoved(yearlyOtherExp, filteredDates, inst.id, removedSet)
                    for (let i = 0; i < filteredDates.length; i++) {
                        events.push({ date: filteredDates[i].date, amount: amounts[i], type: 'expense', label: lbl, sublabel: filteredDates[i].sublabel, editType: inst.id })
                    }
                }
            } else {
                const otherExpNonTermAmt = inst.variesByTerm ? parseFloat(String(inst.nonTermAmount || '0').replace(/,/g, '')) : otherExpAmt
                const getOtherExpAmt = (ds) => inst.variesByTerm ? (isInTerm(ds, terms) ? otherExpAmt : otherExpNonTermAmt) : otherExpAmt
                if (freq === 'weekly') {
                    let d = inst.nextDate ? new Date(inst.nextDate + 'T00:00:00') : new Date(AY_START)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) { const ds = toLocalDate(d); const a = getOtherExpAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'expense', label: lbl, sublabel: 'Weekly', editType: inst.id }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (freq === 'monthly') {
                    let d = inst.nextDate ? new Date(inst.nextDate + 'T00:00:00') : new Date(AY_START)
                    const dom = d.getDate()
                    while (d > ayStart) d = addMonths(d, -1, dom)
                    while (d < ayStart) d = addMonths(d, 1, dom)
                    while (d <= ayEnd) { const ds = toLocalDate(d); const a = getOtherExpAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'expense', label: lbl, sublabel: d.toLocaleDateString('en-GB', { month: 'long' }), editType: inst.id }); d = addMonths(d, 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = inst.termDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) events.push({ date, amount: otherExpAmt, type: 'expense', label: lbl, sublabel: term.name, editType: inst.id }) }
                } else if (freq === 'quarterly') {
                    const qDates = inst.quarterlyDates || {}
                    const QD = defaultQuarterlyDates()
                    for (let i = 0; i < 4; i++) { const date = qDates[i] || QD[i]; const a = getOtherExpAmt(date); if (a > 0) events.push({ date, amount: a, type: 'expense', label: lbl, sublabel: `Q${i + 1}`, editType: inst.id }) }
                } else if (freq === 'yearly') {
                    events.push({ date: inst.nextDate || ayStartStr(), amount: otherExpAmt, type: 'expense', label: lbl, sublabel: 'Yearly expense', editType: inst.id })
                }
            }
        }
    }

    // Weekly spend events
    const weeklyAmt = parseFloat(String(formData.weeklySpend || '0').replace(/,/g, ''))
    const weeklyNonTermAmt = formData.weeklySpendVariesByTerm
        ? parseFloat(String(formData.weeklySpendNonTerm || '0').replace(/,/g, ''))
        : weeklyAmt
    if (weeklyAmt > 0 || weeklyNonTermAmt > 0) {
        const ayStart = AY_START
        const ayEnd = AY_END
        let d = new Date(ayStart)
        // Align to Mondays
        while (d.getDay() !== 1) d = new Date(d.getTime() + 24 * 60 * 60 * 1000)
        while (d <= ayEnd) {
            const dateStr = toLocalDate(d)
            const amt = formData.weeklySpendVariesByTerm
                ? (isInTerm(dateStr, terms) ? weeklyAmt : weeklyNonTermAmt)
                : weeklyAmt
            if (amt > 0) {
                events.push({
                    date: dateStr, amount: amt, type: 'expense',
                    label: 'Weekly Spend', sublabel: 'Average weekly spending',
                    editType: 'weeklySpend',
                    noDot: true,
                })
            }
            d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
        }
    }

    // One-off items events
    const oneOffItems = formData.oneOffItems || []
    for (const item of oneOffItems) {
        const amt = parseFloat(String(item.amount || '0').replace(/,/g, ''))
        if (amt > 0 && item.date) {
            events.push({
                date: item.date, amount: amt,
                type: (item.direction || 'out') === 'in' ? 'income' : 'expense',
                label: item.name || 'One-off',
                sublabel: (item.direction || 'out') === 'in' ? 'One-off income' : 'One-off expense',
                editType: 'oneOff',
            })
        }
    }

    // Mark individually removed events
    const removed = formData.removedEvents || []
    return events.map(e => removed.includes(`${e.editType}:${e.date}`) ? { ...e, removed: true } : e)
}
/* ---------- SUB-COMPONENTS ---------- */

const YesNo = ({ value, onChange }) => (
    <Radio.Group
        optionType="button"
        buttonStyle="solid"
        value={value}
        onChange={e => onChange(e.target.value)}
    >
        <Radio value={true}>Yes</Radio>
        <Radio value={false}>No</Radio>
    </Radio.Group>
)

const MonthChip = ({ label, selected, onClick }) => (
    <div
        onClick={onClick}
        style={{
            padding: '6px 16px',
            borderRadius: 999,
            border: `1px solid ${selected ? '#147B75' : '#d9d9d9'}`,
            background: selected ? '#147B75' : '#fff',
            color: selected ? '#fff' : '#333',
            cursor: 'pointer',
            fontSize: 14,
            userSelect: 'none',
            transition: 'all 0.2s'
        }}
    >
        {label}
    </div>
)

const OtherIncomeList = ({ items, onChange }) => {
    const updateItem = (index, field, value) => {
        const updated = items.map((item, i) =>
            i === index ? { ...item, [field]: value } : item
        )
        onChange(updated)
    }
    const addItem = () =>
        onChange([...items, { type: 'part_time_job', amount: '', date: '', frequency: 'monthly', endDate: '' }])
    const removeItem = index =>
        onChange(items.filter((_, i) => i !== index))

    return (
        <div>
            {items.map((item, index) => (
                <div
                    key={index}
                    style={{
                        background: '#fafafa',
                        borderRadius: 12,
                        padding: '16px',
                        marginBottom: 12,
                        border: '1px solid #e8e8e8'
                    }}
                >
                    {items.length > 1 && (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 12
                        }}>
                            <Text strong style={{ fontSize: 15 }}>Income {index + 1}</Text>
                            <Button
                                type="text"
                                size="small"
                                danger
                                onClick={() => removeItem(index)}
                            >
                                Remove
                            </Button>
                        </div>
                    )}

                    <div style={{ marginBottom: 12 }}>
                        <NativeSelect
                            label="Type"
                            value={item.type}
                            onChange={v => updateItem(index, 'type', v)}
                            options={OTHER_INCOME_TYPE_OPTIONS}
                            placeholder="Select type"
                            style={{ fontSize: 16, height: '40px' }}
                        />
                    </div>

                    <div style={{ marginBottom: 12 }}>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 6, fontSize: 13, }}>
                            Amount
                        </Text>
                        <Input
                            prefix={'\u00A3'}
                            placeholder="0"
                            inputMode="decimal"
                            size="large"
                            style={{ width: '100%' }}
                            value={item.amount}
                            onChange={e =>
                                updateItem(
                                    index,
                                    'amount',
                                    formatMoney(e.target.value)
                                )
                            }
                        />
                    </div>

                    <div style={{ marginBottom: 12 }}>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 6, fontSize: 13, }}>
                            Next payment date
                        </Text>

                        <div style={{ display: 'flex', minWidth: 0 }}>
                            <Input
                                type="date"
                                size="large"
                                style={{
                                    width: '100%',
                                    WebkitAppearance: 'none',
                                    display: 'flex',
                                    height: 40,
                                    boxShadow: 'none'
                                }}
                                value={item.date}
                                onChange={e =>
                                    updateItem(index, 'date', e.target.value)
                                }
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                        <NativeSelect
                            label="Frequency"
                            value={item.frequency}
                            onChange={v => updateItem(index, 'frequency', v)}
                            options={OTHER_INCOME_FREQ_OPTIONS}
                            style={{ fontSize: 16, height: '40px' }}
                        />
                    </div>

                    <div>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 6, fontSize: 13, }}>
                            End date (optional)
                        </Text>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <Input
                                type="date"
                                size="large"
                                style={{
                                    width: '100%',
                                    WebkitAppearance: 'none',
                                    display: 'flex',
                                    height: 40,
                                    boxShadow: 'none'
                                }}
                                value={item.endDate}
                                onChange={e =>
                                    updateItem(index, 'endDate', e.target.value)
                                }
                            />
                            {item.endDate && (
                                <Button
                                    type="text"
                                    size="small"
                                    danger
                                    onClick={() => updateItem(index, 'endDate', '')}
                                >
                                    Clear
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            ))}
            <Button
                type="dashed"
                size="large"
                onClick={addItem}
                style={{ marginTop: 4, width: '100%' }}
            >
                + Add another income source
            </Button>
        </div>
    )
}

const RegularExpenseList = ({ items, onChange }) => {
    const updateItem = (index, field, value) => {
        const updated = items.map((item, i) =>
            i === index ? { ...item, [field]: value } : item
        )
        onChange(updated)
    }
    const addItem = () =>
        onChange([
            ...items,
            { amount: '', date: '', frequency: 'monthly', type: 'rent', endDate: '' }
        ])
    const removeItem = index =>
        onChange(items.filter((_, i) => i !== index))

    return (
        <div>
            {items.map((item, index) => (
                <div
                    key={index}
                    style={{
                        background: '#fafafa',
                        borderRadius: 12,
                        padding: '16px',
                        marginBottom: 12,
                        border: '1px solid #e8e8e8'
                    }}
                >
                    {items.length > 1 && (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 12
                        }}>
                            <Text strong style={{ fontSize: 15 }}>Payment {index + 1}</Text>
                            <Button
                                type="text"
                                size="small"
                                danger
                                onClick={() => removeItem(index)}
                            >
                                Remove
                            </Button>
                        </div>
                    )}

                    <div style={{ marginBottom: 12 }}>
                        <NativeSelect
                            label="Type"
                            value={item.type}
                            onChange={v => updateItem(index, 'type', v)}
                            options={PAYMENT_TYPE_OPTIONS}
                            placeholder="Select type"
                            style={{ fontSize: 16, height: '40px' }}
                        />
                    </div>

                    <div style={{ marginBottom: 12 }}>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 6, fontSize: 13, }}>
                            Amount
                        </Text>
                        <Input
                            prefix={'\u00A3'}
                            placeholder="0"
                            inputMode="decimal"
                            size="large"
                            style={{ width: '100%' }}
                            value={item.amount}
                            onChange={e =>
                                updateItem(
                                    index,
                                    'amount',
                                    formatMoney(e.target.value)
                                )
                            }
                        />
                    </div>

                    <div style={{ marginBottom: 12 }}>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 6, fontSize: 13, }}>
                            Next payment date
                        </Text>

                        <div style={{ display: 'flex', minWidth: 0 }}>
                            <Input
                                type="date"
                                size="large"
                                style={{
                                    width: '100%',
                                    WebkitAppearance: 'none',
                                    display: 'flex',
                                    height: 40,
                                    boxShadow: 'none'
                                }}
                                value={item.date}
                                onChange={e => updateItem(index, 'date', e.target.value)}
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                        <NativeSelect
                            label="Frequency"
                            value={item.frequency}
                            onChange={v => updateItem(index, 'frequency', v)}
                            options={REGULAR_FREQ_OPTIONS}
                            style={{ fontSize: 16, height: '40px' }}
                        />
                    </div>

                    <div>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 6, fontSize: 13, }}>
                            End date (optional)
                        </Text>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <Input
                                type="date"
                                size="large"
                                style={{
                                    width: '100%',
                                    WebkitAppearance: 'none',
                                    display: 'flex',
                                    height: 40,
                                    boxShadow: 'none'
                                }}
                                value={item.endDate}
                                onChange={e =>
                                    updateItem(index, 'endDate', e.target.value)
                                }
                            />
                            {item.endDate && (
                                <Button
                                    type="text"
                                    size="small"
                                    danger
                                    onClick={() => updateItem(index, 'endDate', '')}
                                >
                                    Clear
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            ))}
            <Button
                type="dashed"
                size="large"
                onClick={addItem}
                style={{ marginTop: 4, width: '100%' }}
            >
                + Add another expense
            </Button>
        </div>
    )
}

const OneOffItemList = ({ items, onChange, type }) => {
    const updateItem = (index, field, value) => {
        const updated = items.map((item, i) =>
            i === index ? { ...item, [field]: value } : item
        )
        onChange(updated)
    }
    const addItem = () =>
        onChange([...items, { name: '', amount: '', date: '' }])
    const removeItem = index =>
        onChange(items.filter((_, i) => i !== index))

    return (
        <div>
            {items.map((item, index) => (
                <div
                    key={index}
                    style={{
                        background: '#fafafa',
                        borderRadius: 12,
                        padding: '16px',
                        marginBottom: 12,
                        border: '1px solid #e8e8e8'
                    }}
                >
                    {items.length > 1 && (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 12
                        }}>
                            <Text strong style={{ fontSize: 15 }}>Item {index + 1}</Text>
                            <Button
                                type="text"
                                size="small"
                                danger
                                onClick={() => removeItem(index)}
                            >
                                Remove
                            </Button>
                        </div>
                    )}

                    <div style={{ marginBottom: 12 }}>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 6, fontSize: 13, }}>
                            Name (optional)
                        </Text>
                        <Input
                            placeholder="e.g., Birthday gift, Trip to London"
                            size="large"
                            style={{ width: '100%' }}
                            value={item.name}
                            onChange={e =>
                                updateItem(index, 'name', e.target.value)
                            }
                        />
                    </div>

                    <div style={{ marginBottom: 12 }}>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 6, fontSize: 13, }}>
                            Amount
                        </Text>
                        <Input
                            prefix={'\u00A3'}
                            placeholder="0"
                            inputMode="decimal"
                            size="large"
                            style={{ width: '100%' }}
                            value={item.amount}
                            onChange={e =>
                                updateItem(
                                    index,
                                    'amount',
                                    formatMoney(e.target.value)
                                )
                            }
                        />
                    </div>

                    <div>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 6, fontSize: 13, }}>
                            Date
                        </Text>

                        <div style={{ display: 'flex', minWidth: 0 }}>
                            <Input
                                type="date"
                                size="large"
                                value={item.date}
                                onChange={e => updateItem(index, 'date', e.target.value)}
                                style={{
                                    width: '100%',
                                    WebkitAppearance: 'none',
                                    display: 'flex',
                                    height: 40,
                                    boxShadow: 'none'
                                }}
                            />
                        </div>
                    </div>
                </div>
            ))}
            <Button
                type="dashed"
                size="large"
                onClick={addItem}
                style={{ marginTop: 4, width: '100%' }}
            >
                + Add another {type}
            </Button>
        </div>
    )
}

/* ---------- MAIN COMPONENT ---------- */

export default function FinancialOnboardingForm({ onComplete }) {
    const startedRef = useRef(false)
    const trackOnce = (key, callback) => {
        if (sessionStorage.getItem(key)) return
        sessionStorage.setItem(key, '1')
        callback()
    }
    const stepStartRef = useRef(Date.now())
    const pageRef = useRef(null)
    const subQuestionRef = useRef(null)
    const scrollAreaRef = useRef(null)
    const formCardRef = useRef(null)
    const formCardCleanupRef = useRef(null)
    // Ref always holding the latest step state — used by event listeners that
    // close over an empty-dep effect and would otherwise read stale values.
    const [modal, modalContextHolder] = Modal.useModal()

    const addBlur = () => pageRef.current?.classList.add('blur-behind-modal')
    const removeBlur = () => pageRef.current?.classList.remove('blur-behind-modal')

    const [toast, setToast] = useState(null)
    const toastTimerRef = useRef(null)
    const showToast = (msg) => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        setToast(msg)
        toastTimerRef.current = setTimeout(() => setToast(null), 3500)
    }
    const dismissToast = () => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        setToast(null)
    }

    const [uniSlideOut, setUniSlideOut] = useState(false)
    const [uniSlideIn, setUniSlideIn] = useState(false)
    const [uniConfirming, setUniConfirming] = useState(false)
    const [uniReversing, setUniReversing] = useState(false)
    const [editingEvent, setEditingEvent] = useState(null)  // { ...event, clickX, clickY }
    const [editAmount, setEditAmount] = useState('')
    const [editingBalance, setEditingBalance] = useState(false)
    const [editBalanceAmount, setEditBalanceAmount] = useState('')
    const transitionRef = useRef(null) // guards against overlapping transitions
    const [graphAnimated, setGraphAnimated] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
            return ['termDates', 'balance', 'overdraft', 'regularIncome', 'maintenanceLoan', 'bursary', 'familyFriends', 'work', 'otherIncome', 'rent', 'regularExpenses', 'bills', 'uniFees', 'savingsInvestments', 'otherExpense', 'oneOffItems', 'weeklySpend', 'summary'].includes(saved.currentStepId)
        } catch { return false }
    })
    const getRemovedCount = (editTypes) => {
        const removed = formData.removedEvents || []
        const types = Array.isArray(editTypes) ? editTypes : [editTypes]
        return removed.filter(k => types.some(t => k.startsWith(t + ':'))).length
    }
    const restoreRemoved = (editTypes) => {
        const types = Array.isArray(editTypes) ? editTypes : [editTypes]
        const removed = formData.removedEvents || []
        updateField('removedEvents', removed.filter(k => !types.some(t => k.startsWith(t + ':'))))
    }
    const RestoreDeletedBar = ({ editTypes, color = '#e07b3c' }) => {
        const count = getRemovedCount(editTypes)
        if (count === 0) return null
        return (
            <div style={{ position: 'relative', flexShrink: 0, padding: '0 12px', marginBottom: -4 }}>
                <button
                    onClick={() => restoreRemoved(editTypes)}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        background: '#fff', border: 'none',
                        padding: '8px 16px',
                        borderRadius: 10,
                        cursor: 'pointer',
                        width: '100%',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                        transform: 'translateY(-10px)',
                    }}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                    </svg>
                    <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color }}>
                        {count} payment{count !== 1 ? 's' : ''} deleted — tap to restore
                    </span>
                </button>
            </div>
        )
    }
    const buildPanelSteps = (sources, expSources) => {
        const panels = ['termDates', 'balance', 'overdraft', 'regularIncome']
        const s = sources || []
        if (s.includes('maintenance_loan')) panels.push('maintenanceLoan')
        if (s.includes('bursary')) panels.push('bursary')
        if (s.includes('family_friends')) panels.push('familyFriends')
        if (s.includes('work')) panels.push('work')
        if (s.includes('other_income')) panels.push('otherIncome')
        panels.push('regularExpenses')
        const e = expSources || []
        if (e.includes('rent')) panels.push('rent')
        if (e.includes('bills')) panels.push('bills')
        if (e.includes('uni_fees')) panels.push('uniFees')
        if (e.includes('savings_investments')) panels.push('savingsInvestments')
        if (e.includes('other_expense')) panels.push('otherExpense')
        panels.push('weeklySpend')
        panels.push('summary')
        return panels
    }
    const [activePanel, setActivePanel] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
            const panels = buildPanelSteps(saved.formData?.incomeSources, saved.formData?.expenseSources)
            const idx = panels.indexOf(saved.currentStepId)
            return idx >= 0 ? idx : 0
        } catch { return 0 }
    })
    const [expandedTerm, setExpandedTerm] = useState('_init')
    const [showAllEvents, setShowAllEvents] = useState(false)
    const returnToSummaryRef = useRef(false)

    /* --- State with localStorage restore --- */

    const [formData, setFormData] = useState(() => {
        let data = { ...INITIAL_FORM_DATA }
        try {
            const saved = localStorage.getItem(STORAGE_KEY)
            if (saved) {
                const parsed = JSON.parse(saved)
                data = { ...INITIAL_FORM_DATA, ...parsed.formData }
            }
        } catch { /* ignore */ }
        // Set university from signup if available
        const signupUni = localStorage.getItem('budgeup_signup_university')
        if (signupUni) {
            data.university = signupUni
            localStorage.removeItem('budgeup_signup_university')
        }
        // Migrate legacy flat other income fields to otherIncomes array
        if ((!data.otherIncomes || data.otherIncomes.length === 0) && data.otherIncomeAmount) {
            data.otherIncomes = [{
                id: `oi_${Date.now()}`, amount: data.otherIncomeAmount,
                frequency: data.otherIncomeFrequency || 'monthly',
                amountPeriod: data.otherIncomeAmountPeriod || 'monthly',
                label: data.otherIncomeLabel || '',
                nextDate: data.otherIncomeNextDate || null,
                termDates: data.otherIncomeTermDates || {},
                quarterlyDates: data.otherIncomeQuarterlyDates || {},
                variesByTerm: data.otherIncomeVariesByTerm || false,
                nonTermAmount: data.otherIncomeNonTermAmount || '',
            }]
        }
        // Sync term dates with university-specific dates if available
        if (data.university && hasCustomTermDates(data.university)) {
            data.termDates = getTermDatesForUniversity(data.university)
        }
        // Migrate legacy flat other expense fields to otherExpenses array
        if ((!data.otherExpenses || data.otherExpenses.length === 0) && data.otherExpenseAmount) {
            data.otherExpenses = [{
                id: `oe_${Date.now()}`, amount: data.otherExpenseAmount,
                frequency: data.otherExpenseFrequency || 'monthly',
                amountPeriod: data.otherExpenseAmountPeriod || 'monthly',
                label: data.otherExpenseLabel || '',
                nextDate: data.otherExpenseNextDate || null,
                termDates: data.otherExpenseTermDates || {},
                quarterlyDates: data.otherExpenseQuarterlyDates || {},
                variesByTerm: data.otherExpenseVariesByTerm || false,
                nonTermAmount: data.otherExpenseNonTermAmount || '',
            }]
        }
        return data
    })

    const [currentStepId, setCurrentStepId] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY)
            if (saved) {
                const parsed = JSON.parse(saved)
                if (
                    parsed.currentStepId &&
                    STEPS.some(s => s.id === parsed.currentStepId)
                ) {
                    return parsed.currentStepId
                }
            }
        } catch {
            /* ignore */
        }
        return STEPS[0].id
    })

    const [submitting, setSubmitting] = useState(false)
    const [showAllMonths, setShowAllMonths] = useState(() => {
        const saved = formData.loanMonths || []
        return saved.some(m => !DEFAULT_LOAN_MONTHS.includes(m))
    })

    /* --- Persist to localStorage --- */

    useEffect(() => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ formData, currentStepId })
        )
    }, [formData, currentStepId])

    /* --- Track onboarding started (only once at the first step) --- */

    // Set graph start to 1st of the earliest term's start month
    const [, forceGraphUpdate] = useState(0)
    useEffect(() => {
        const terms = formData.termDates?.terms
        if (terms?.length) {
            const earliest = [...terms].sort((a, b) => a.start.localeCompare(b.start))[0]
            setGraphStart(earliest.start)
        }
        refreshAY()
        forceGraphUpdate(v => v + 1)
    }, [formData.termDates])

    useEffect(() => {
        const identifyUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()

            if (user) {
                analytics.identify(user.id, {
                    email: user.email
                })
            }
        }

        identifyUser()
    }, [])

    useEffect(() => {
        if (!localStorage.getItem('signup_onboarding_pending')) return
        trackOnce('onboarding_started_tracked', () => {
            localStorage.removeItem('signup_onboarding_pending')
            analytics.track(ONBOARDING_EVENTS.STARTED, {
                total_steps: STEPS.length
            })
        })
    }, [])

    /* --- Track step viewed when step changes --- */

    useEffect(() => {
        stepStartRef.current = Date.now()
    }, [currentStepId])

    const lastTrackedStepRef = useRef(null)

    useEffect(() => {
        if (!currentStepId) return

        const key = `onboarding_step_viewed_${currentStepId}`

        trackOnce(key, () => {
            const stepIndex = STEPS.findIndex(s => s.id === currentStepId)
            const step = STEPS[stepIndex]

            if (!step) return

            analytics.track(
                ONBOARDING_EVENTS.STEP_VIEWED,
                getOnboardingStepProperties(
                    {
                        id: step.id,
                        number: stepIndex + 1,
                        heading: step.heading
                    },
                    STEPS.length
                )
            )
        })
    }, [currentStepId])

    const currentIndex = STEPS.findIndex(s => s.id === currentStepId)
    /* --- Lock viewport & scroll focused input inside its container --- */
    const formCardCallbackRef = useCallback((card) => {
        // Clean up previous listeners if any
        if (formCardCleanupRef.current) {
            formCardCleanupRef.current()
            formCardCleanupRef.current = null
        }
        formCardRef.current = card
        if (!card) return

        const scrollAllToTop = () => {
            setTimeout(() => {
                // Scroll every scrollable container inside the card to top
                card.querySelectorAll('*').forEach(node => {
                    if (node.scrollTop > 0) {
                        node.scrollTo({ top: 0, behavior: 'smooth' })
                    }
                })
            }, 300)
        }

        const handleTouchEnd = (e) => {
            const el = e.target
            if (!el.matches('input, textarea, select')) return
            if (el.type === 'date') return
            if (el === document.activeElement) return
            e.preventDefault()
            el.focus({ preventScroll: true })
            scrollAllToTop()
        }

        const handleFocusIn = (e) => {
            const el = e.target
            if (!el.matches('input, textarea, select')) return
            if (el.type === 'date') return
            scrollAllToTop()
        }

        card.addEventListener('touchend', handleTouchEnd, { passive: false })
        card.addEventListener('focusin', handleFocusIn)
        formCardCleanupRef.current = () => {
            card.removeEventListener('touchend', handleTouchEnd)
            card.removeEventListener('focusin', handleFocusIn)
        }
    }, [])

    const currentStep = STEPS[currentIndex]
    const progress = ((currentIndex + 1) / STEPS.length) * 100
    const isLastStep = currentIndex === STEPS.length - 1

    /* --- Helpers --- */

    const updateField = (key, value) => {
        setFormData(prev => ({ ...prev, [key]: value }))
    }

    const updateOtherInst = (arrayKey, instId, field, value) => {
        setFormData(prev => ({
            ...prev,
            [arrayKey]: (prev[arrayKey] || []).map(inst =>
                inst.id === instId ? { ...inst, [field]: value } : inst
            )
        }))
    }

    const PANEL_RESET_FIELDS = {
        balance: { balance: '' },
        maintenanceLoan: { loanAmount: '', loanMonths: [...DEFAULT_LOAN_MONTHS], loanKnowDates: false, loanDates: {}, instalmentAmounts: {} },
        bursary: { bursaryAmount: '', bursaryDates: [...INITIAL_FORM_DATA.bursaryDates], bursaryMonths: undefined, bursaryInstalmentAmounts: {} },
        familyFriends: { familyAmount: '', familyFrequency: 'monthly', familyAmountPeriod: 'monthly', familyNextDate: '', familyTermDates: {}, familyQuarterlyDates: {}, familyVariesByTerm: false, familyNonTermAmount: '' },
        work: { workAmount: '', workFrequency: 'monthly', workEntryMode: 'yearly', workAmountPeriod: 'monthly', workVariesByTerm: false, workNonTermAmount: '', workNextDate: '', workTermDates: {}, workQuarterlyDates: {} },
        otherIncome: { otherIncomes: [], otherIncomeAmount: '', otherIncomeFrequency: 'monthly', otherIncomeEntryMode: 'yearly', otherIncomeAmountPeriod: 'monthly', otherIncomeLabel: '', otherIncomeNextDate: '', otherIncomeTermDates: {}, otherIncomeVariesByTerm: false, otherIncomeNonTermAmount: '' },
        rent: { rentAmount: '', rentFrequency: 'monthly', rentNextDate: '', rentEntryMode: 'per_payment', rentAmountPeriod: 'monthly', rentTermDates: {}, rentQuarterlyDates: {}, rentVariesByTerm: false, rentStartDate: '', rentEndDate: '' },
        bills: { billsAmount: '', billsFrequency: 'monthly', billsEntryMode: 'yearly', billsAmountPeriod: 'monthly', billsNextDate: '', billsTermDates: {}, billsQuarterlyDates: {}, billsStartDate: '', billsEndDate: '' },
        uniFees: { uniFeesAmount: '9250', uniFeesFrequency: 'yearly', uniFeesEntryMode: 'yearly', uniFeesAmountPeriod: 'yearly', uniFeesNextDate: '', uniFeesTermDates: {}, uniFeesQuarterlyDates: {}, uniFeesVariesByTerm: false, uniFeesNonTermAmount: '' },
        savingsInvestments: { savingsInvAmount: '', savingsInvFrequency: 'monthly', savingsInvEntryMode: 'per_payment', savingsInvAmountPeriod: 'monthly', savingsInvNextDate: '', savingsInvTermDates: {}, savingsInvQuarterlyDates: {}, savingsInvVariesByTerm: false, savingsInvNonTermAmount: '' },
        otherExpense: { otherExpenses: [], otherExpenseAmount: '', otherExpenseFrequency: 'monthly', otherExpenseEntryMode: 'yearly', otherExpenseAmountPeriod: 'monthly', otherExpenseLabel: '', otherExpenseNextDate: '', otherExpenseTermDates: {}, otherExpenseQuarterlyDates: {}, otherExpenseVariesByTerm: false, otherExpenseNonTermAmount: '' },
    }

    const resetPanel = (panelId) => {
        const fields = PANEL_RESET_FIELDS[panelId]
        if (!fields) return
        setFormData(prev => ({ ...prev, ...fields }))
    }


    /* --- Navigation --- */


    const goNext = ({ skipped = false } = {}) => {
        dismissToast()
        removeBlur()
        if (!isLastStep) {
            // Track step completion
            analytics.track(ONBOARDING_EVENTS.STEP_COMPLETED, {
                ...getOnboardingStepProperties({
                    id: currentStep.id,
                    number: currentIndex + 1,
                    heading: currentStep.heading,
                    skipped: skipped
                }, STEPS.length),

                duration_ms: Date.now() - stepStartRef.current
            })

            setCurrentStepId(STEPS[currentIndex + 1].id)
            scrollAreaRef.current?.scrollTo({ top: 0 })
        } else {
            submit()
        }
    }

    const goBack = () => {
        dismissToast()
        if (currentIndex > 0) {
            // Track going back
            analytics.track(ONBOARDING_EVENTS.STEP_BACK,
                getOnboardingStepProperties({
                    id: currentStep.id,
                    number: currentIndex + 1,
                    heading: currentStep.heading
                }, STEPS.length)
            )
            setCurrentStepId(STEPS[currentIndex - 1].id)
            scrollAreaRef.current?.scrollTo({ top: 0 })
        }
    }

    const scrollToSub = () => {
        setTimeout(() => {
            subQuestionRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            })
        }, 100)
    }

    const isCurrentStepBlank = () => {
        switch (currentStep.id) {
            case 'university':
                return !formData.university
            case 'termDates':
                return false
            case 'balance':
                return !formData.balance
            case 'regularIncome':
                return false
            case 'maintenanceLoan':
                return !formData.loanAmount && (formData.loanMonths || []).length === 0
            case 'bursary':
                return !formData.bursaryAmount
            case 'familyFriends':
                return !formData.familyAmount
            case 'work':
                return !formData.workAmount
            case 'otherIncome':
                return !(formData.otherIncomes || []).some(i => i.amount)
            case 'regularExpenses':
                return false
            case 'rent':
                return !formData.rentAmount
            case 'bills':
                return !formData.billsAmount
            case 'uniFees':
                return !formData.uniFeesAmount
            case 'savingsInvestments':
                return !formData.savingsInvAmount
            case 'otherExpense':
                return !(formData.otherExpenses || []).some(i => i.amount)
            case 'weeklySpend':
                return !formData.weeklySpend
            default:
                return false
        }
    }

    const getItemsMissingDates = () => {
        return []
    }

    const getMonthDateRange = (monthKey) => {
        const pad = n => String(n).padStart(2, '0')

        const monthIndex = {
            september: 8, october: 9, november: 10, december: 11,
            january: 0, february: 1, march: 2, april: 3,
            may: 4, june: 5, july: 6, august: 7
        }

        const month = monthIndex[monthKey]
        const today = new Date()
        const currentYear = today.getFullYear()
        const currentMonth = today.getMonth()

        // Determine academic year
        // If we're in Sep-Dec, academic year started this year
        // If we're in Jan-Aug, academic year started last year
        let academicYearStart = currentMonth >= 8 ? currentYear : currentYear - 1

        // If the month is Sep-Dec, use academicYearStart
        // If the month is Jan-Aug, use academicYearStart + 1
        let year = month >= 8 ? academicYearStart : academicYearStart + 1

        const lastDay = new Date(year, month + 1, 0).getDate()

        return {
            min: `${year}-${pad(month + 1)}-01`,
            max: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
            default: `${year}-${pad(month + 1)}-15`
        }
    }

    const checkRequiredFields = () => {
        // Only check required fields for the current step
        switch (currentStep.id) {
            case 'university':
                if (!formData.university || !UK_UNIVERSITIES.includes(formData.university)) {
                    return 'Please select your university'
                }
                break

            case 'balance':
                if (!formData.balance) {
                    return 'Please enter an amount'
                }
                break

            case 'maintenanceLoan':
                if (!formData.loanAmount) {
                    return 'Please enter an amount'
                }
                if ((formData.loanMonths || []).length === 0) {
                    return 'Please select at least one month'
                }
                break

            case 'bursary':
                if (!formData.bursaryAmount) {
                    return 'Please enter an amount'
                }
                break

            case 'familyFriends':
                if (!formData.familyAmount) {
                    return 'Please enter an amount'
                }
                break

            case 'work':
                if (!formData.workAmount) {
                    return 'Please enter an amount'
                }
                if ((formData.workFrequency || 'monthly') === 'yearly' && !formData.workNextDate) {
                    return 'Please select a payment date'
                }
                break

            case 'otherIncome':
                if (!(formData.otherIncomes || []).some(i => i.amount)) {
                    return 'Please enter an amount'
                }
                if ((formData.otherIncomes || []).some(i => i.amount && !i.label?.trim())) {
                    return 'Please give each income a name'
                }
                break

            case 'rent':
                if (!formData.rentAmount) {
                    return 'Please enter an amount'
                }
                break

            case 'bills':
                if (!formData.billsAmount) {
                    return 'Please enter an amount'
                }
                break

            case 'uniFees':
                if (!formData.uniFeesAmount) {
                    return 'Please enter an amount'
                }
                break

            case 'savingsInvestments':
                if (!formData.savingsInvAmount) {
                    return 'Please enter an amount'
                }
                break

            case 'otherExpense':
                if (!(formData.otherExpenses || []).some(i => i.amount)) {
                    return 'Please enter an amount'
                }
                if ((formData.otherExpenses || []).some(i => i.amount && !i.label?.trim())) {
                    return 'Please give each expense a name'
                }
                break

            case 'oneOffItems': {
                const filledItems = (formData.oneOffItems || []).filter(i => i.amount || i.name?.trim() || i.date)
                for (const item of filledItems) {
                    if (!item.name?.trim()) return 'Please enter a name for each one-off item'
                    if (!item.amount) return 'Please enter an amount for each one-off item'
                    if (!item.date) return 'Please enter a date for each one-off item'
                }
                break
            }

        }

        return null
    }

    const confirmSkip = () => {
        addBlur()

        modal.confirm({
            title: 'Skip this question?',
            content:
                "You haven’t answered this question. Are you sure you want to skip it?",
            okText: 'Skip',
            cancelText: 'Go back',
            mask: false,
            onCancel: removeBlur,
            onOk: () => {
                goNext({ skipped: true })
            }
        })
    }

    const handleUniversityConfirm = () => {
        if (transitionRef.current) return // block during active transition
        const error = checkRequiredFields()
        if (error) {
            showToast(error)
            return
        }

        // Shrink button first, then switch step
        setUniConfirming(true)
        transitionRef.current = true
        setTimeout(() => {
            goNext()
            setGraphAnimated(true)
            setUniConfirming(false)
            transitionRef.current = null
        }, 100)
    }


    const handleTermDatesBack = () => {
        if (transitionRef.current) return // block double-tap
        setUniSlideIn(true)
        setUniSlideOut(true)
        setUniReversing(true) // start with back button visible to match panel
        // Double rAF ensures browser has painted initial position before animating
        const r1 = requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setUniSlideOut(false)
                setUniReversing(false) // animate back button away
            })
        })
        const t2 = setTimeout(() => {
            goBack()
            setUniSlideIn(false)
            setGraphAnimated(false)
            transitionRef.current = null
        }, 550)
        transitionRef.current = () => { cancelAnimationFrame(r1); clearTimeout(t2) }
    }

    const handleTermDatesNext = () => {
        if (transitionRef.current) return
        if (isCurrentStepBlank()) { confirmSkip(); return }
        const error = checkRequiredFields()
        if (error) {
            showToast(error)
            return
        }
        goNext()
        setTimeout(() => setActivePanel(1), 16)
    }

    const handlePanelBack = () => {
        if (transitionRef.current) return
        const panels = buildPanelSteps(formData.incomeSources, formData.expenseSources)
        if (returnToSummaryRef.current) {
            returnToSummaryRef.current = false
            const summaryIdx = panels.indexOf('summary')
            if (summaryIdx >= 0) {
                setActivePanel(summaryIdx)
                setCurrentStepId('summary')
                scrollAreaRef.current?.scrollTo({ top: 0 })
                return
            }
        }
        let prev = activePanel - 1
        if (prev < 0) prev = 0
        const prevStepId = panels[prev]
        setActivePanel(prev)
        setCurrentStepId(prevStepId)
        scrollAreaRef.current?.scrollTo({ top: 0 })
    }

    const PANEL_TO_SOURCE = {
        maintenanceLoan: { key: 'incomeSources', value: 'maintenance_loan' },
        bursary: { key: 'incomeSources', value: 'bursary' },
        familyFriends: { key: 'incomeSources', value: 'family_friends' },
        work: { key: 'incomeSources', value: 'work' },
        otherIncome: { key: 'incomeSources', value: 'other_income' },
        rent: { key: 'expenseSources', value: 'rent' },
        bills: { key: 'expenseSources', value: 'bills' },
        uniFees: { key: 'expenseSources', value: 'uni_fees' },
        savingsInvestments: { key: 'expenseSources', value: 'savings_investments' },
        otherExpense: { key: 'expenseSources', value: 'other_expense' },
    }

    const handlePanelSkip = () => {
        if (transitionRef.current) return
        const panels = buildPanelSteps(formData.incomeSources, formData.expenseSources)
        const panelId = panels[activePanel]
        const mapping = PANEL_TO_SOURCE[panelId]

        // For overdraft, clear and advance
        if (panelId === 'overdraft') {
            setFormData(prev => ({ ...prev, overdraft: '' }))
            const nextPanelIdx = activePanel + 1
            if (nextPanelIdx < panels.length) {
                setCurrentStepId(panels[nextPanelIdx])
                scrollAreaRef.current?.scrollTo({ top: 0 })
                setTimeout(() => setActivePanel(nextPanelIdx), 16)
            } else {
                const lastPanelId = panels[panels.length - 1]
                const lastIdx = STEPS.findIndex(s => s.id === lastPanelId)
                if (lastIdx < STEPS.length - 1) setCurrentStepId(STEPS[lastIdx + 1].id)
                setActivePanel(0)
            }
            return
        }

        // For oneOffItems, just clear items and advance normally
        if (panelId === 'oneOffItems') {
            setFormData(prev => ({
                ...prev,
                oneOffItems: [{ name: '', amount: '', date: '', direction: 'out' }],
            }))
            const nextPanelIdx = activePanel + 1
            if (nextPanelIdx < panels.length) {
                setCurrentStepId(panels[nextPanelIdx])
                scrollAreaRef.current?.scrollTo({ top: 0 })
                setTimeout(() => setActivePanel(nextPanelIdx), 16)
            } else {
                const lastPanelId = panels[panels.length - 1]
                const lastIdx = STEPS.findIndex(s => s.id === lastPanelId)
                if (lastIdx < STEPS.length - 1) {
                    setCurrentStepId(STEPS[lastIdx + 1].id)
                }
                setActivePanel(0)
            }
            return
        }

        if (mapping) {
            // Remove source and clear field data so it doesn't show on dashboard
            const panelResetMap = {
                maintenance_loan: 'maintenanceLoan', bursary: 'bursary',
                family_friends: 'familyFriends', work: 'work',
                other_income: 'otherIncome', rent: 'rent', bills: 'bills',
                uni_fees: 'uniFees', savings_investments: 'savingsInvestments',
                other_expense: 'otherExpense',
            }
            const resetFields = PANEL_RESET_FIELDS[panelResetMap[mapping.value]] || {}
            setFormData(prev => ({
                ...prev,
                ...resetFields,
                [mapping.key]: (prev[mapping.key] || []).filter(s => s !== mapping.value),
            }))
        }
        // Advance — panels list will be rebuilt without this panel
        const nextPanelIdx = activePanel
        const newPanels = buildPanelSteps(
            mapping?.key === 'incomeSources' ? (formData.incomeSources || []).filter(s => s !== mapping.value) : (formData.incomeSources || []),
            mapping?.key === 'expenseSources' ? (formData.expenseSources || []).filter(s => s !== mapping.value) : (formData.expenseSources || []),
        )
        if (nextPanelIdx < newPanels.length) {
            setCurrentStepId(newPanels[nextPanelIdx])
            setActivePanel(nextPanelIdx)
            scrollAreaRef.current?.scrollTo({ top: 0 })
        } else {
            const lastPanelId = newPanels[newPanels.length - 1]
            const lastIdx = STEPS.findIndex(s => s.id === lastPanelId)
            if (lastIdx < STEPS.length - 1) {
                setCurrentStepId(STEPS[lastIdx + 1].id)
            }
            setActivePanel(0)
        }
    }

    const handlePanelNext = () => {
        if (transitionRef.current) return
        const error = checkRequiredFields()
        if (error) {
            showToast(error)
            return
        }
        const panels = buildPanelSteps(formData.incomeSources, formData.expenseSources)
        if (returnToSummaryRef.current) {
            returnToSummaryRef.current = false
            const summaryIdx = panels.indexOf('summary')
            if (summaryIdx >= 0) {
                setActivePanel(summaryIdx)
                setCurrentStepId('summary')
                scrollAreaRef.current?.scrollTo({ top: 0 })
                return
            }
        }
        const nextPanelIdx = activePanel + 1
        if (nextPanelIdx < panels.length) {
            // Still in panel group — advance to next panel step
            setCurrentStepId(panels[nextPanelIdx])
            scrollAreaRef.current?.scrollTo({ top: 0 })
            setTimeout(() => setActivePanel(nextPanelIdx), 16)
        } else {
            // Last panel reached — submit and go to dashboard
            submit()
        }
    }


    /* --- Submit --- */

    const submit = async () => {
        setSubmitting(true)

        // Show loading screen immediately
        if (onComplete) {
            onComplete()
        }

        // Save data in the background
        try {
            const {
                data: { user },
                error: userError
            } = await supabase.auth.getUser()

            if (userError || !user) {
                return
            }

            await Promise.all([
                saveCashflowForecast(user.id, formData),
                saveTermDates(user.id, formData.termDates),
                formData.balance ? saveBalanceHistory(user.id, formData.balance) : Promise.resolve(),
            ])

            // Get referral code from user metadata or localStorage
            const referredBy = user.user_metadata?.referred_by || localStorage.getItem('referral_code')

            await saveUserFinances(user.id, {
                university: formData.university,
                balance: formData.balance,
                overdraft: formData.overdraft,
                savings: formData.savings,
                weeklySpend: formData.weeklySpend,
                weeklySpendNonTerm: formData.weeklySpendNonTerm,
                weeklySpendVariesByTerm: formData.weeklySpendVariesByTerm,
                onboardingCompleted: true,
                referredBy: referredBy || null
            })

            // Clear referral code from localStorage after saving
            if (referredBy) {
                localStorage.removeItem('referral_code')
                // Track successful referral conversion
                analytics.track(AUTH_EVENTS.REFERRAL_SIGNUP_COMPLETED, {
                    referral_code: referredBy
                })
            }

            analytics.track(ONBOARDING_EVENTS.COMPLETED, {
                ...getUserProperties({
                    university: formData.university,
                    currency: getCurrencySymbol(),
                    balance: formData.balance,
                    savings: formData.savings,
                    weeklySpend: formData.weeklySpend,
                    studentLoan: formData.studentLoan,
                    bursary: formData.bursary
                }),
                ...getStudentLoanProperties(formData),
                ...getBursaryProperties(formData),
                has_other_income: formData.otherIncome,
                has_one_off_items: (formData.oneOffItems || []).some(i => i.amount),
                was_referred: !!referredBy
            })
        } catch (err) {
            console.error(err)

            // Track onboarding error
            analytics.track(ONBOARDING_EVENTS.ERROR, {
                error_message: err.message,
                error_type: err.name,
                step_id: currentStep.id,
                step_number: currentIndex + 1
            })

            analytics.error(err, { context: 'onboarding_submission' })
        } finally {
            setSubmitting(false)
        }
    }


    /* ---------- RENDER ---------- */

    const [imgLoaded, setImgLoaded] = useState(false)

    useEffect(() => {
        const img = new Image()
        img.src = universityIllustration
        img.onload = () => setImgLoaded(true)
    }, [])

    // university + termDates share a single render block so TermDatesStep stays
    // mounted throughout the transition — prevents the flash on step switch
    const PANEL_STEPS = buildPanelSteps(formData.incomeSources, formData.expenseSources)
    const PANEL_LABEL_MAP = {
        termDates: 'Confirm Term Dates',
        balance: 'Confirm Bank Balance',
        overdraft: 'Confirm Overdraft',
        regularIncome: 'Confirm Regular Income',
        maintenanceLoan: 'Confirm Maintenance Loan',
        bursary: 'Confirm Bursary',
        familyFriends: 'Confirm Family & Friends',
        work: 'Confirm Work',
        otherIncome: 'Confirm Other Income',
        rent: 'Confirm Rent',
        regularExpenses: 'Confirm Regular Expenses',
        bills: 'Confirm Bills',
        uniFees: 'Confirm University Fees',
        savingsInvestments: 'Confirm Savings & Investments',
        otherExpense: 'Confirm Other Expense',
        oneOffItems: 'Confirm One-off Items',
        weeklySpend: 'Confirm Weekly Spend',
        summary: 'Build my budget',
    }
    const PANEL_LABELS = PANEL_STEPS.map(id => PANEL_LABEL_MAP[id])
    const inPanelGroup = currentStep.id === 'university' || PANEL_STEPS.includes(currentStep.id) || activePanel > 0

    if (inPanelGroup) {
        const terms = formData.termDates?.terms || []
        const balanceNum = parseFloat(String(formData.balance || '0').replace(/,/g, '')) || 0
        const activeExpanded = expandedTerm === '_init' ? (terms[0]?.id ?? null) : expandedTerm

        // Determine which handler to use based on active panel
        const panelOnNext = activePanel === 0 ? handleTermDatesNext : handlePanelNext
        const panelOnBack = activePanel === 0 ? handleTermDatesBack : handlePanelBack

        const toastEl = toast && (
            <>
                <div onClick={dismissToast} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
                <div
                    onClick={dismissToast}
                    style={{
                        position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)',
                        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                        color: '#fff', padding: '10px 20px', borderRadius: 20,
                        fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                        zIndex: 9999, maxWidth: 'calc(100% - 48px)', whiteSpace: 'nowrap',
                        textAlign: 'center', lineHeight: 1.4,
                        animation: 'toastIn 0.25s ease',
                    }}
                >
                    {toast}
                </div>
            </>
        )

        return (
            <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fff' }}>
                {toastEl}
                {/* Single TermGraph — props change based on panel */}
                {/* Safe area spacer for notch */}
                <div style={{ paddingTop: 'env(safe-area-inset-top, 0px)', flexShrink: 0, background: '#fff' }} />
                <div style={{
                    height: graphAnimated ? 200 : 0,
                    opacity: graphAnimated ? 1 : 0,
                    transform: graphAnimated ? 'translateY(0)' : 'translateY(-8px)',
                    overflow: 'hidden',
                    flexShrink: 0,
                    margin: graphAnimated ? '0 8px' : '0',
                    transition: graphAnimated
                        ? 'height 0.6s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.45s ease, transform 0.45s cubic-bezier(.22,1,.36,1), margin 0.6s ease'
                        : 'height 0.35s ease, opacity 0.25s ease, transform 0.25s ease, margin 0.35s ease',
                }}>
                    <TermGraph
                        graphHeight={150}
                        marginTop={8}
                        terms={terms}
                        expandedTerm={activePanel === 0 ? activeExpanded : undefined}
                        balance={activePanel >= 1 ? balanceNum : undefined}
                        overdraft={formData.overdraft ? parseFloat(String(formData.overdraft || '0').replace(/,/g, '')) : undefined}
                        events={activePanel >= 3 ? buildGraphEvents(formData) : []}
                        hiddenEventTypes={(() => {
                            const panelId = PANEL_STEPS[activePanel]
                            if (panelId === 'summary') return []
                            const oiIds = (formData.otherIncomes || []).map(i => i.id)
                            const oeIds = (formData.otherExpenses || []).map(i => i.id)
                            const incomeEditTypes = ['loan', 'bursary', 'family', 'work', ...oiIds]
                            const expenseEditTypes = ['rent', 'bills', 'uniFees', 'savingsInv', ...oeIds, 'weeklySpend']
                            const allTypes = [...incomeEditTypes, ...expenseEditTypes, 'oneOff']
                            // On regularIncome: hide all expense types + oneOff, and hide unchecked income types
                            if (panelId === 'regularIncome') {
                                const hidden = [...expenseEditTypes, 'oneOff']
                                const srcMap = { maintenance_loan: 'loan', bursary: 'bursary', family_friends: 'family', work: 'work', other_income: oiIds }
                                const selected = formData.incomeSources || []
                                for (const [src, editType] of Object.entries(srcMap)) {
                                    if (!selected.includes(src)) {
                                        if (Array.isArray(editType)) hidden.push(...editType)
                                        else hidden.push(editType)
                                    }
                                }
                                return hidden
                            }
                            // On regularExpenses: hide all income types + oneOff + weeklySpend, and hide unchecked expense types
                            if (panelId === 'regularExpenses') {
                                const hidden = [...incomeEditTypes, 'oneOff', 'weeklySpend']
                                const srcMap = { rent: 'rent', bills: 'bills', uni_fees: 'uniFees', savings_investments: 'savingsInv', other_expense: oeIds }
                                const selected = formData.expenseSources || []
                                for (const [src, editType] of Object.entries(srcMap)) {
                                    if (!selected.includes(src)) {
                                        if (Array.isArray(editType)) hidden.push(...editType)
                                        else hidden.push(editType)
                                    }
                                }
                                return hidden
                            }
                            if (!showAllEvents && activePanel >= 4) {
                                const typeMap = {
                                    maintenanceLoan: 'loan', bursary: 'bursary',
                                    familyFriends: 'family', work: 'work',
                                    rent: 'rent', bills: 'bills', uniFees: 'uniFees',
                                    savingsInvestments: 'savingsInv',
                                    oneOffItems: 'oneOff',
                                    weeklySpend: 'weeklySpend',
                                }
                                let currentTypes = typeMap[panelId] ? [typeMap[panelId]] : []
                                if (panelId === 'otherIncome') currentTypes = oiIds
                                if (panelId === 'otherExpense') currentTypes = oeIds
                                if (currentTypes.length === 0) return []
                                return allTypes.filter(t => !currentTypes.includes(t))
                            }
                            return []
                        })()}
                        currentEventType={activePanel >= 4 ? (() => {
                            const panelId = PANEL_STEPS[activePanel]
                            const typeMap = {
                                maintenanceLoan: 'loan', bursary: 'bursary',
                                familyFriends: 'family', work: 'work',
                                rent: 'rent', bills: 'bills', uniFees: 'uniFees',
                                savingsInvestments: 'savingsInv',
                                oneOffItems: 'oneOff',
                                weeklySpend: 'weeklySpend',
                            }
                            if (panelId === 'otherIncome') return (formData.otherIncomes || [])[0]?.id || null
                            if (panelId === 'otherExpense') return (formData.otherExpenses || [])[0]?.id || null
                            return typeMap[panelId] || null
                        })() : null}
                        onEventClick={(evt, e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            setEditingEvent({ ...evt, clickX: rect.left + rect.width / 2, clickY: rect.top })
                            setEditAmount(String(evt.amount))
                        }}
                        hideDots={PANEL_STEPS[activePanel] === 'summary'}
                        forceGreenDots={PANEL_STEPS[activePanel] === 'regularIncome'}
                        forceDotColor={PANEL_STEPS[activePanel] === 'regularIncome' ? 'green' : PANEL_STEPS[activePanel] === 'regularExpenses' ? 'red' : null}
                        onTermClick={activePanel === 0 ? (termId) => setExpandedTerm(termId) : undefined}
                        onBalanceClick={activePanel >= 1 ? (e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            setEditBalanceAmount(String(formData.balance || ''))
                            setEditingBalance({ clickX: rect.left + rect.width / 2, clickY: rect.top })
                        } : undefined}
                    />
                </div>

                {/* Form card with sliding panels */}
                <div ref={formCardCallbackRef} style={{
                    flex: 1,
                    background: '#f0f4f4',
                    borderRadius: '16px 16px 0 0',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    minHeight: 0,
                    position: 'relative',
                }}>
                    {/* Income/expense indicator strip */}
                    {(() => {
                        const panelId = PANEL_STEPS[activePanel]
                        const incomeTypes = ['regularIncome', 'maintenanceLoan', 'bursary', 'familyFriends', 'work', 'otherIncome']
                        const expenseTypes = ['rent', 'regularExpenses', 'bills', 'uniFees', 'savingsInvestments', 'otherExpense']
                        const otherTypes = ['oneOffItems', 'weeklySpend']
                        const stripColor = panelId === 'summary' ? '#147b75'
                            : panelId === 'regularIncome' ? '#147b75'
                                : panelId === 'regularExpenses' ? '#e06470'
                                    : incomeTypes.includes(panelId) ? 'rgba(20,123,117,0.35)'
                                        : expenseTypes.includes(panelId) ? 'rgba(224,100,112,0.35)'
                                            : otherTypes.includes(panelId) ? '#e06470'
                                                : null
                        return (
                            <div style={{
                                height: stripColor ? 4 : 0,
                                background: stripColor || 'transparent',
                                borderRadius: '16px 16px 0 0',
                                flexShrink: 0,
                                transition: 'height 0.3s ease, background 0.3s ease',
                                overflow: 'hidden',
                            }} />
                        )
                    })()}

                    {/* Panel content area */}
                    <div style={{ flex: 1, position: 'relative', overflow: 'clip', minHeight: 0, margin: '8px 8px 0', borderRadius: '14px 14px 0 0' }}>
                        {PANEL_STEPS.map((panelId, i) => (
                            <div key={panelId} style={{
                                position: 'absolute', inset: 0,
                                display: 'flex', flexDirection: 'column',
                                overflow: 'hidden',
                                transform: i < activePanel ? 'translateY(-100%)'
                                    : i > activePanel ? 'translateY(100%)'
                                        : 'translateY(0)',
                                transition: 'transform 0.5s cubic-bezier(.25,.46,.45,.94)',
                                background: '#fff',
                                borderRadius: '14px 14px 0 0',
                            }}>
                                {panelId === 'termDates' && (
                                    <TermDatesStep
                                        termData={formData.termDates}
                                        updateTermDates={(data) => updateField('termDates', data)}
                                        expandedTerm={activeExpanded}
                                        onExpandedTermChange={setExpandedTerm}
                                    />
                                )}
                                {panelId === 'balance' && (
                                    <BankBalanceStep
                                        balance={formData.balance}
                                        updateBalance={(val) => updateField('balance', val)}

                                    />
                                )}
                                {panelId === 'overdraft' && (
                                    <OverdraftStep
                                        overdraft={formData.overdraft}
                                        updateOverdraft={(val) => updateField('overdraft', val)}
                                    />
                                )}
                                {panelId === 'regularIncome' && (
                                    <RegularIncomeStep
                                        incomeSources={formData.incomeSources || []}
                                        updateIncomeSources={(val) => updateField('incomeSources', val)}
                                    />
                                )}
                                {!['termDates', 'balance', 'overdraft', 'regularIncome', 'regularExpenses', 'savingsInvestments', 'otherExpense', 'summary'].includes(panelId) && new Set(buildGraphEvents(formData).filter(e => !e.removed).map(e => e.editType)).size >= 2 && (() => {
                                    const incPanels = ['maintenanceLoan', 'bursary', 'familyFriends', 'work', 'otherIncome']
                                    const expPanels = ['rent', 'bills', 'uniFees']
                                    const otherPanels = ['oneOffItems', 'weeklySpend']
                                    const btnColor = incPanels.includes(panelId) ? '#147b75'
                                        : expPanels.includes(panelId) ? '#e06470'
                                            : otherPanels.includes(panelId) ? '#e06470'
                                                : '#147b75'
                                    return (
                                        <button
                                            onClick={() => setShowAllEvents(s => !s)}
                                            style={{
                                                position: 'absolute', top: 22, right: 24, zIndex: 10,
                                                background: showAllEvents ? btnColor : '#f3f3f3',
                                                border: 'none', borderRadius: 20, cursor: 'pointer',
                                                padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5,
                                                transition: 'background 0.2s ease',
                                            }}
                                        >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={showAllEvents ? '#fff' : '#999'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                {!showAllEvents ? (
                                                    <>
                                                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                                                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                                                        <line x1="1" y1="1" x2="23" y2="23" />
                                                    </>
                                                ) : (
                                                    <>
                                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                        <circle cx="12" cy="12" r="3" />
                                                    </>
                                                )}
                                            </svg>
                                            <span style={{
                                                fontSize: 11, fontWeight: 700,
                                                fontFamily: 'Nunito, sans-serif',
                                                color: showAllEvents ? '#fff' : '#999',
                                            }}>
                                                Show all
                                            </span>
                                        </button>
                                    )
                                })()}
                                {panelId === 'maintenanceLoan' && (
                                    <MaintenanceLoanStep
                                        loanAmount={formData.loanAmount}
                                        updateLoanAmount={(val) => updateField('loanAmount', val)}
                                        loanMonths={formData.loanMonths}
                                        updateLoanMonths={(val) => updateField('loanMonths', val)}
                                        loanKnowDates={formData.loanKnowDates}
                                        updateLoanKnowDates={(val) => updateField('loanKnowDates', val)}
                                        loanDates={formData.loanDates}
                                        updateLoanDates={(val) => updateField('loanDates', val)}
                                        instalmentAmounts={formData.instalmentAmounts || {}}
                                        updateInstalmentAmounts={(val) => updateField('instalmentAmounts', val)}
                                    />
                                )}
                                {panelId === 'bursary' && (
                                    <BursaryStep
                                        bursaryAmount={formData.bursaryAmount}
                                        updateBursaryAmount={(val) => updateField('bursaryAmount', val)}
                                        bursaryMonths={formData.bursaryMonths}
                                        updateBursaryMonths={(val) => updateField('bursaryMonths', val)}
                                        bursaryDates={formData.bursaryDates}
                                        updateBursaryDates={(val) => updateField('bursaryDates', val)}
                                        bursaryInstalmentAmounts={formData.bursaryInstalmentAmounts || {}}
                                        updateBursaryInstalmentAmounts={(val) => updateField('bursaryInstalmentAmounts', val)}

                                    />
                                )}
                                {panelId === 'familyFriends' && (
                                    <FamilyFriendsStep
                                        familyAmount={formData.familyAmount}
                                        updateFamilyAmount={(val) => updateField('familyAmount', val)}
                                        familyFrequency={formData.familyFrequency}
                                        updateFamilyFrequency={(val) => updateField('familyFrequency', val)}
                                        familyAmountPeriod={formData.familyAmountPeriod}
                                        updateFamilyAmountPeriod={(val) => updateField('familyAmountPeriod', val)}
                                        familyNextDate={formData.familyNextDate}
                                        updateFamilyNextDate={(val) => updateField('familyNextDate', val)}
                                        terms={formData.termDates?.terms || []}
                                        familyTermDates={formData.familyTermDates || {}}
                                        updateFamilyTermDates={(val) => updateField('familyTermDates', val)}
                                        familyQuarterlyDates={formData.familyQuarterlyDates || {}}
                                        updateFamilyQuarterlyDates={(val) => updateField('familyQuarterlyDates', val)}
                                        familyVariesByTerm={formData.familyVariesByTerm}
                                        updateFamilyVariesByTerm={(val) => updateField('familyVariesByTerm', val)}
                                        familyNonTermAmount={formData.familyNonTermAmount}
                                        updateFamilyNonTermAmount={(val) => updateField('familyNonTermAmount', val)}
                                    />
                                )}
                                {panelId === 'work' && (
                                    <WorkIncomeStep
                                        workAmount={formData.workAmount}
                                        updateWorkAmount={(val) => updateField('workAmount', val)}
                                        workFrequency={formData.workFrequency}
                                        updateWorkFrequency={(val) => updateField('workFrequency', val)}
                                        workAmountPeriod={formData.workAmountPeriod}
                                        updateWorkAmountPeriod={(val) => updateField('workAmountPeriod', val)}
                                        workVariesByTerm={formData.workVariesByTerm}
                                        updateWorkVariesByTerm={(val) => updateField('workVariesByTerm', val)}
                                        workNonTermAmount={formData.workNonTermAmount}
                                        updateWorkNonTermAmount={(val) => updateField('workNonTermAmount', val)}
                                        workEntryMode={formData.workEntryMode}
                                        updateWorkEntryMode={(val) => updateField('workEntryMode', val)}
                                        workNextDate={formData.workNextDate}
                                        updateWorkNextDate={(val) => updateField('workNextDate', val)}
                                        terms={formData.termDates?.terms || []}
                                        workTermDates={formData.workTermDates || {}}
                                        updateWorkTermDates={(val) => updateField('workTermDates', val)}
                                        workQuarterlyDates={formData.workQuarterlyDates || {}}
                                        updateWorkQuarterlyDates={(val) => updateField('workQuarterlyDates', val)}
                                    />
                                )}
                                {panelId === 'otherIncome' && (() => {
                                    const instances = formData.otherIncomes || []
                                    // Auto-create first instance if none
                                    if (instances.length === 0) {
                                        const first = makeOtherInstance('oi')
                                        setTimeout(() => updateField('otherIncomes', [first]), 0)
                                        return null
                                    }
                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                                            <div style={{ padding: '18px 24px 0', flexShrink: 0 }}>
                                                <h2 style={{ fontSize: 25, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#000', margin: '0 0 8px', lineHeight: 1.3 }}>Other Income</h2>
                                                <p style={{ fontSize: 15, fontFamily: 'Nunito, sans-serif', color: '#444', margin: '0 0 16px', lineHeight: 1.5 }}>Any other regular income not covered above?</p>
                                            </div>
                                            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', padding: '0 0 16px' }}>
                                                {instances.map((inst, idx) => (
                                                    <div key={inst.id} data-inst-id={inst.id}>
                                                        {instances.length > 1 && (
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px 8px' }}>
                                                                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#147b75' }}>
                                                                    {inst.label || `Income ${idx + 1}`}
                                                                </span>
                                                                <button onClick={() => {
                                                                    const prevId = idx > 0 ? instances[idx - 1].id : null
                                                                    updateField('otherIncomes', instances.filter(i => i.id !== inst.id))
                                                                    if (prevId) setTimeout(() => {
                                                                        const el = document.querySelector(`[data-inst-id="${prevId}"]`)
                                                                        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                                                    }, 50)
                                                                }}
                                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#e06470' }}>
                                                                    Remove
                                                                </button>
                                                            </div>
                                                        )}
                                                        <OtherIncomeStep
                                                            compact
                                                            onboarding
                                                            otherIncomeAmount={inst.amount}
                                                            updateOtherIncomeAmount={(val) => updateOtherInst('otherIncomes', inst.id, 'amount', val)}
                                                            otherIncomeFrequency={inst.frequency}
                                                            updateOtherIncomeFrequency={(val) => updateOtherInst('otherIncomes', inst.id, 'frequency', val)}
                                                            otherIncomeAmountPeriod={inst.amountPeriod}
                                                            updateOtherIncomeAmountPeriod={(val) => updateOtherInst('otherIncomes', inst.id, 'amountPeriod', val)}
                                                            otherIncomeQuarterlyDates={inst.quarterlyDates}
                                                            updateOtherIncomeQuarterlyDates={(val) => updateOtherInst('otherIncomes', inst.id, 'quarterlyDates', val)}
                                                            otherIncomeLabel={inst.label}
                                                            updateOtherIncomeLabel={(val) => updateOtherInst('otherIncomes', inst.id, 'label', val)}
                                                            otherIncomeNextDate={inst.nextDate}
                                                            updateOtherIncomeNextDate={(val) => updateOtherInst('otherIncomes', inst.id, 'nextDate', val)}
                                                            terms={formData.termDates?.terms || []}
                                                            otherIncomeTermDates={inst.termDates || {}}
                                                            updateOtherIncomeTermDates={(val) => updateOtherInst('otherIncomes', inst.id, 'termDates', val)}
                                                            otherIncomeVariesByTerm={inst.variesByTerm}
                                                            updateOtherIncomeVariesByTerm={(val) => updateOtherInst('otherIncomes', inst.id, 'variesByTerm', val)}
                                                            otherIncomeNonTermAmount={inst.nonTermAmount}
                                                            updateOtherIncomeNonTermAmount={(val) => updateOtherInst('otherIncomes', inst.id, 'nonTermAmount', val)}
                                                            otherIncomeEntryMode={inst.entryMode}
                                                        />
                                                        {idx < instances.length - 1 && (
                                                            <div style={{ height: 1, background: '#e8e8e8', margin: '12px 24px' }} />
                                                        )}
                                                    </div>
                                                ))}
                                                <div style={{ padding: '12px 24px 0' }}>
                                                    <button
                                                        onClick={() => {
                                                            const newInst = makeOtherInstance('oi')
                                                            updateField('otherIncomes', [...instances, newInst])
                                                            setTimeout(() => {
                                                                const el = document.querySelector(`[data-inst-id="${newInst.id}"]`)
                                                                el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                                            }, 50)
                                                        }}
                                                        style={{
                                                            width: '100%', padding: '10px 0', borderRadius: 10,
                                                            border: '1.5px solid #147b75', background: 'transparent',
                                                            cursor: 'pointer', fontSize: 14, fontWeight: 600,
                                                            fontFamily: 'Nunito, sans-serif', color: '#147b75',
                                                        }}>
                                                        + Add another income
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })()}
                                {panelId === 'rent' && (
                                    <RentStep
                                        rentAmount={formData.rentAmount}
                                        updateRentAmount={(val) => updateField('rentAmount', val)}
                                        rentFrequency={formData.rentFrequency}
                                        updateRentFrequency={(val) => updateField('rentFrequency', val)}
                                        rentAmountPeriod={formData.rentAmountPeriod}
                                        updateRentAmountPeriod={(val) => updateField('rentAmountPeriod', val)}
                                        rentNextDate={formData.rentNextDate}
                                        updateRentNextDate={(val) => updateField('rentNextDate', val)}
                                        rentEntryMode={formData.rentEntryMode || 'yearly'}
                                        updateRentEntryMode={(val) => updateField('rentEntryMode', val)}
                                        terms={formData.termDates?.terms || []}
                                        rentTermDates={formData.rentTermDates || {}}
                                        updateRentTermDates={(val) => updateField('rentTermDates', val)}
                                        rentQuarterlyDates={formData.rentQuarterlyDates || {}}
                                        updateRentQuarterlyDates={(val) => updateField('rentQuarterlyDates', val)}
                                        rentStartDate={formData.rentStartDate}
                                        updateRentStartDate={(val) => updateField('rentStartDate', val)}
                                        rentEndDate={formData.rentEndDate}
                                        updateRentEndDate={(val) => updateField('rentEndDate', val)}
                                    />
                                )}
                                {panelId === 'regularExpenses' && (
                                    <RegularExpensesStep
                                        expenseSources={formData.expenseSources || []}
                                        updateExpenseSources={(val) => updateField('expenseSources', val)}
                                    />
                                )}
                                {panelId === 'bills' && (
                                    <BillsStep
                                        billsAmount={formData.billsAmount}
                                        updateBillsAmount={(val) => updateField('billsAmount', val)}
                                        billsFrequency={formData.billsFrequency}
                                        updateBillsFrequency={(val) => updateField('billsFrequency', val)}
                                        billsAmountPeriod={formData.billsAmountPeriod}
                                        updateBillsAmountPeriod={(val) => updateField('billsAmountPeriod', val)}
                                        billsQuarterlyDates={formData.billsQuarterlyDates}
                                        updateBillsQuarterlyDates={(val) => updateField('billsQuarterlyDates', val)}
                                        billsEntryMode={formData.billsEntryMode}
                                        updateBillsEntryMode={(val) => updateField('billsEntryMode', val)}
                                        billsNextDate={formData.billsNextDate}
                                        updateBillsNextDate={(val) => updateField('billsNextDate', val)}
                                        terms={formData.termDates?.terms || []}
                                        billsTermDates={formData.billsTermDates || {}}
                                        updateBillsTermDates={(val) => updateField('billsTermDates', val)}
                                        billsStartDate={formData.billsStartDate}
                                        updateBillsStartDate={(val) => updateField('billsStartDate', val)}
                                        billsEndDate={formData.billsEndDate}
                                        updateBillsEndDate={(val) => updateField('billsEndDate', val)}
                                        rentStartDate={formData.rentStartDate}
                                        rentEndDate={formData.rentEndDate}
                                    />
                                )}
                                {panelId === 'uniFees' && (
                                    <UniFeesStep
                                        uniFeesAmount={formData.uniFeesAmount}
                                        updateUniFeesAmount={(val) => updateField('uniFeesAmount', val)}
                                        uniFeesFrequency={formData.uniFeesFrequency}
                                        updateUniFeesFrequency={(val) => updateField('uniFeesFrequency', val)}
                                        uniFeesAmountPeriod={formData.uniFeesAmountPeriod}
                                        updateUniFeesAmountPeriod={(val) => updateField('uniFeesAmountPeriod', val)}
                                        uniFeesQuarterlyDates={formData.uniFeesQuarterlyDates}
                                        updateUniFeesQuarterlyDates={(val) => updateField('uniFeesQuarterlyDates', val)}
                                        uniFeesEntryMode={formData.uniFeesEntryMode}
                                        updateUniFeesEntryMode={(val) => updateField('uniFeesEntryMode', val)}
                                        uniFeesNextDate={formData.uniFeesNextDate}
                                        updateUniFeesNextDate={(val) => updateField('uniFeesNextDate', val)}
                                        terms={formData.termDates?.terms || []}
                                        uniFeesTermDates={formData.uniFeesTermDates || {}}
                                        updateUniFeesTermDates={(val) => updateField('uniFeesTermDates', val)}
                                        uniFeesVariesByTerm={formData.uniFeesVariesByTerm}
                                        updateUniFeesVariesByTerm={(val) => updateField('uniFeesVariesByTerm', val)}
                                        uniFeesNonTermAmount={formData.uniFeesNonTermAmount}
                                        updateUniFeesNonTermAmount={(val) => updateField('uniFeesNonTermAmount', val)}
                                    />
                                )}
                                {panelId === 'savingsInvestments' && (
                                    <SavingsInvestmentsStep
                                        savingsInvAmount={formData.savingsInvAmount}
                                        updateSavingsInvAmount={(val) => updateField('savingsInvAmount', val)}
                                        savingsInvFrequency={formData.savingsInvFrequency}
                                        updateSavingsInvFrequency={(val) => updateField('savingsInvFrequency', val)}
                                        savingsInvAmountPeriod={formData.savingsInvAmountPeriod}
                                        updateSavingsInvAmountPeriod={(val) => updateField('savingsInvAmountPeriod', val)}
                                        savingsInvNextDate={formData.savingsInvNextDate}
                                        updateSavingsInvNextDate={(val) => updateField('savingsInvNextDate', val)}
                                        savingsInvEntryMode={formData.savingsInvEntryMode}
                                        updateSavingsInvEntryMode={(val) => updateField('savingsInvEntryMode', val)}
                                        terms={formData.termDates?.terms || []}
                                        savingsInvTermDates={formData.savingsInvTermDates || {}}
                                        updateSavingsInvTermDates={(val) => updateField('savingsInvTermDates', val)}
                                        savingsInvQuarterlyDates={formData.savingsInvQuarterlyDates || {}}
                                        updateSavingsInvQuarterlyDates={(val) => updateField('savingsInvQuarterlyDates', val)}
                                        savingsInvVariesByTerm={formData.savingsInvVariesByTerm}
                                        updateSavingsInvVariesByTerm={(val) => updateField('savingsInvVariesByTerm', val)}
                                        savingsInvNonTermAmount={formData.savingsInvNonTermAmount}
                                        updateSavingsInvNonTermAmount={(val) => updateField('savingsInvNonTermAmount', val)}
                                    />
                                )}
                                {panelId === 'otherExpense' && (() => {
                                    const instances = formData.otherExpenses || []
                                    if (instances.length === 0) {
                                        const first = makeOtherInstance('oe')
                                        setTimeout(() => updateField('otherExpenses', [first]), 0)
                                        return null
                                    }
                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                                            <div style={{ padding: '18px 24px 0', flexShrink: 0 }}>
                                                <h2 style={{ fontSize: 25, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#000', margin: '0 0 8px', lineHeight: 1.3 }}>Other Expenses</h2>
                                                <p style={{ fontSize: 15, fontFamily: 'Nunito, sans-serif', color: '#444', margin: '0 0 16px', lineHeight: 1.5 }}>Any other regular expense not covered above?</p>
                                            </div>
                                            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', padding: '0 0 16px' }}>
                                                {instances.map((inst, idx) => (
                                                    <div key={inst.id} data-inst-id={inst.id}>
                                                        {instances.length > 1 && (
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px 8px' }}>
                                                                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#e06470' }}>
                                                                    {inst.label || `Expense ${idx + 1}`}
                                                                </span>
                                                                <button onClick={() => {
                                                                    const prevId = idx > 0 ? instances[idx - 1].id : null
                                                                    updateField('otherExpenses', instances.filter(i => i.id !== inst.id))
                                                                    if (prevId) setTimeout(() => {
                                                                        const el = document.querySelector(`[data-inst-id="${prevId}"]`)
                                                                        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                                                    }, 50)
                                                                }}
                                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#e06470' }}>
                                                                    Remove
                                                                </button>
                                                            </div>
                                                        )}
                                                        <OtherExpenseStep
                                                            compact
                                                            onboarding
                                                            otherExpenseAmount={inst.amount}
                                                            updateOtherExpenseAmount={(val) => updateOtherInst('otherExpenses', inst.id, 'amount', val)}
                                                            otherExpenseFrequency={inst.frequency}
                                                            updateOtherExpenseFrequency={(val) => updateOtherInst('otherExpenses', inst.id, 'frequency', val)}
                                                            otherExpenseAmountPeriod={inst.amountPeriod}
                                                            updateOtherExpenseAmountPeriod={(val) => updateOtherInst('otherExpenses', inst.id, 'amountPeriod', val)}
                                                            otherExpenseQuarterlyDates={inst.quarterlyDates}
                                                            updateOtherExpenseQuarterlyDates={(val) => updateOtherInst('otherExpenses', inst.id, 'quarterlyDates', val)}
                                                            otherExpenseLabel={inst.label}
                                                            updateOtherExpenseLabel={(val) => updateOtherInst('otherExpenses', inst.id, 'label', val)}
                                                            otherExpenseNextDate={inst.nextDate}
                                                            updateOtherExpenseNextDate={(val) => updateOtherInst('otherExpenses', inst.id, 'nextDate', val)}
                                                            terms={formData.termDates?.terms || []}
                                                            otherExpenseTermDates={inst.termDates || {}}
                                                            updateOtherExpenseTermDates={(val) => updateOtherInst('otherExpenses', inst.id, 'termDates', val)}
                                                            otherExpenseVariesByTerm={inst.variesByTerm}
                                                            updateOtherExpenseVariesByTerm={(val) => updateOtherInst('otherExpenses', inst.id, 'variesByTerm', val)}
                                                            otherExpenseNonTermAmount={inst.nonTermAmount}
                                                            updateOtherExpenseNonTermAmount={(val) => updateOtherInst('otherExpenses', inst.id, 'nonTermAmount', val)}
                                                        />
                                                        {idx < instances.length - 1 && (
                                                            <div style={{ height: 1, background: '#e8e8e8', margin: '12px 24px' }} />
                                                        )}
                                                    </div>
                                                ))}
                                                <div style={{ padding: '12px 24px 0' }}>
                                                    <button
                                                        onClick={() => {
                                                            const newInst = makeOtherInstance('oe')
                                                            updateField('otherExpenses', [...instances, newInst])
                                                            setTimeout(() => {
                                                                const el = document.querySelector(`[data-inst-id="${newInst.id}"]`)
                                                                el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                                            }, 50)
                                                        }}
                                                        style={{
                                                            width: '100%', padding: '10px 0', borderRadius: 10,
                                                            border: '1.5px solid #e06470', background: 'transparent',
                                                            cursor: 'pointer', fontSize: 14, fontWeight: 600,
                                                            fontFamily: 'Nunito, sans-serif', color: '#e06470',
                                                        }}>
                                                        + Add another expense
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })()}
                                {panelId === 'oneOffItems' && (
                                    <OneOffItemsStep
                                        items={formData.oneOffItems || [{ name: '', amount: '', date: '', direction: 'out' }]}
                                        updateItems={(val) => updateField('oneOffItems', val)}
                                    />
                                )}
                                {panelId === 'weeklySpend' && (
                                    <WeeklySpendStep
                                        weeklySpend={formData.weeklySpend}
                                        updateWeeklySpend={(val) => updateField('weeklySpend', val)}
                                        weeklySpendNonTerm={formData.weeklySpendNonTerm}
                                        updateWeeklySpendNonTerm={(val) => updateField('weeklySpendNonTerm', val)}
                                        weeklySpendVariesByTerm={formData.weeklySpendVariesByTerm}
                                        updateWeeklySpendVariesByTerm={(val) => updateField('weeklySpendVariesByTerm', val)}
                                    />
                                )}
                                {panelId === 'summary' && (() => {
                                    const allEvts = buildGraphEvents(formData)
                                    const totalIncome = allEvts.filter(e => e.type === 'income' && !e.removed).reduce((s, e) => s + e.amount, 0)
                                    const totalExpense = allEvts.filter(e => e.type === 'expense' && !e.removed).reduce((s, e) => s + e.amount, 0)
                                    const net = totalIncome - totalExpense
                                    const sym = getCurrencySymbol()
                                    const fmtK = (v) => { if (v >= 1000) { const k = v / 1000; const dec = Math.round(k * 10) % 10; return `${sym}${k.toFixed(dec === 0 ? 0 : 1)}k` } return `${sym}${Math.round(v).toLocaleString()}` }

                                    const INCOME_SOURCE_MAP = [
                                        { id: 'maintenance_loan', label: 'Maintenance Loan', editType: 'loan', panelId: 'maintenanceLoan' },
                                        { id: 'bursary', label: 'Bursary', editType: 'bursary', panelId: 'bursary' },
                                        { id: 'family_friends', label: 'Family & Friends', editType: 'family', panelId: 'familyFriends' },
                                        { id: 'work', label: 'Work', editType: 'work', panelId: 'work' },
                                    ]
                                    const EXPENSE_SOURCE_MAP = [
                                        { id: 'rent', label: 'Rent', editType: 'rent', panelId: 'rent' },
                                        { id: 'bills', label: 'Bills & Utilities', editType: 'bills', panelId: 'bills' },
                                        { id: 'uni_fees', label: 'University Fees', editType: 'uniFees', panelId: 'uniFees' },
                                        { id: 'savings_investments', label: 'Savings & Investments', editType: 'savingsInv', panelId: 'savingsInvestments' },
                                    ]

                                    const getYearly = (editTypes, includeNoDot = false) => allEvts.filter(e => editTypes.includes(e.editType) && !e.removed && (includeNoDot || !e.noDot)).reduce((s, e) => s + e.amount, 0)

                                    const incomeSources = INCOME_SOURCE_MAP.filter(s => (formData.incomeSources || []).includes(s.id))
                                    const otherIncSources = (formData.incomeSources || []).includes('other_income') ? (formData.otherIncomes || []).filter(inst => inst.amount) : []
                                    const expenseSources = EXPENSE_SOURCE_MAP.filter(s => (formData.expenseSources || []).includes(s.id))
                                    const otherExpSources = (formData.expenseSources || []).includes('other_expense') ? (formData.otherExpenses || []).filter(inst => inst.amount) : []
                                    const weeklySpendAmt = parseFloat(String(formData.weeklySpend || '0').replace(/,/g, ''))
                                    const oneOffFiltered = (formData.oneOffItems || []).filter(it => it.name || it.amount)
                                    const oneOffCount = oneOffFiltered.length
                                    const oneOffTotal = oneOffFiltered.reduce((s, it) => {
                                        const amt = parseFloat(String(it.amount || '0').replace(/,/g, '')) || 0
                                        return s + (it.direction === 'in' ? amt : -amt)
                                    }, 0)

                                    const goToPanel = (panelId) => {
                                        const idx = PANEL_STEPS.indexOf(panelId)
                                        if (idx >= 0) {
                                            returnToSummaryRef.current = true
                                            setActivePanel(idx)
                                            setCurrentStepId(panelId)
                                            scrollAreaRef.current?.scrollTo({ top: 0 })
                                        }
                                    }

                                    const chevron = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6" /></svg>

                                    const SummaryRow = ({ sourceId, label, amount, color, isExpense, onTap }) => {
                                        const si = SOURCE_ICONS[sourceId]
                                        const IconComp = si?.Icon
                                        const iconColor = isExpense ? '#e06470' : '#147b75'
                                        return (
                                            <div onClick={onTap} style={{ display: 'flex', alignItems: 'center', padding: '7px 0', gap: 10, cursor: onTap ? 'pointer' : 'default' }}>
                                                <div style={{
                                                    width: 28, height: 28, borderRadius: '50%',
                                                    background: `${iconColor}15`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    flexShrink: 0,
                                                }}>
                                                    {IconComp && <IconComp size={16} color={iconColor} />}
                                                </div>
                                                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#333' }}>{label}</span>
                                                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color }}>{fmtK(amount)}/yr</span>
                                                {onTap && chevron}
                                            </div>
                                        )
                                    }

                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                                            <div style={{ padding: '18px 24px 0', flexShrink: 0 }}>
                                                <h2 style={{ fontSize: 25, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#000', margin: '0 0 4px', lineHeight: 1.3 }}>Your Budget</h2>
                                                <p style={{ fontSize: 14, fontFamily: 'Nunito, sans-serif', color: '#444', margin: '0 0 16px', lineHeight: 1.5 }}>Here's a summary of your finances for the year.</p>
                                            </div>
                                            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', padding: '0 24px 16px' }}>
                                                {/* Bank balance & overdraft */}
                                                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                                    <div onClick={() => goToPanel('balance')} style={{
                                                        flex: 1, background: '#f5f7f7', borderRadius: 10, padding: '10px 12px',
                                                        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                                                    }}>
                                                        <div style={{ flex: 1 }}>
                                                            <p style={{ fontSize: 10, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#888', margin: 0, textTransform: 'uppercase', letterSpacing: 0.3 }}>Balance</p>
                                                            <p style={{ fontSize: 16, fontWeight: 800, fontFamily: 'Nunito, sans-serif', color: '#333', margin: '2px 0 0' }}>{sym}{Math.round(parseFloat(String(formData.balance || '0').replace(/,/g, ''))).toLocaleString()}</p>
                                                        </div>
                                                        {chevron}
                                                    </div>
                                                    <div onClick={() => goToPanel('overdraft')} style={{
                                                        flex: 1, background: '#f5f7f7', borderRadius: 10, padding: '10px 12px',
                                                        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                                                    }}>
                                                        <div style={{ flex: 1 }}>
                                                            <p style={{ fontSize: 10, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#888', margin: 0, textTransform: 'uppercase', letterSpacing: 0.3 }}>Overdraft</p>
                                                            <p style={{ fontSize: 16, fontWeight: 800, fontFamily: 'Nunito, sans-serif', color: '#333', margin: '2px 0 0' }}>{formData.overdraft ? `${sym}${Math.round(parseFloat(String(formData.overdraft).replace(/,/g, ''))).toLocaleString()}` : 'None'}</p>
                                                        </div>
                                                        {chevron}
                                                    </div>
                                                </div>

                                                {/* Income vs Expense bar */}
                                                {(() => {
                                                    const total = totalIncome + totalExpense
                                                    const spendPct = total > 0 ? Math.round((totalExpense / total) * 100) : 50
                                                    return (
                                                        <div style={{ marginBottom: 16, background: '#f5f7f7', borderRadius: 12, padding: '14px 16px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                                                <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#333' }}>
                                                                    Yearly Overview
                                                                </span>
                                                                <span style={{
                                                                    fontSize: 15, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
                                                                    color: net >= 0 ? '#147b75' : '#e06470',
                                                                }}>
                                                                    {net >= 0 ? '+' : '\u2212'}{sym}{Math.abs(Math.round(net)).toLocaleString()}
                                                                </span>
                                                            </div>
                                                            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#f0f0f0', marginBottom: 10 }}>
                                                                <div style={{
                                                                    height: '100%',
                                                                    width: `${100 - spendPct}%`,
                                                                    background: '#147b75',
                                                                    borderRadius: spendPct <= 0 ? 4 : '4px 0 0 4px',
                                                                    transition: 'width 0.4s ease',
                                                                }} />
                                                                <div style={{
                                                                    height: '100%',
                                                                    width: `${spendPct}%`,
                                                                    background: '#e06470',
                                                                    borderRadius: spendPct >= 100 ? 4 : '0 4px 4px 0',
                                                                    transition: 'width 0.4s ease',
                                                                }} />
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#147b75' }}>
                                                                    Income {sym}{Math.round(totalIncome).toLocaleString()}
                                                                </span>
                                                                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#e06470' }}>
                                                                    Spend {sym}{Math.round(totalExpense).toLocaleString()}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )
                                                })()}

                                                {/* Income section */}
                                                {(incomeSources.length > 0 || otherIncSources.length > 0) && (
                                                    <>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                            <PiTrendUp size={16} color="#333" />
                                                            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#333' }}>Regular Income</span>
                                                        </div>
                                                        {incomeSources.map(s => <SummaryRow key={s.id} sourceId={s.id} label={s.label} amount={getYearly([s.editType])} color="rgba(20,123,117,0.8)" onTap={() => goToPanel(s.panelId)} />)}
                                                        {otherIncSources.map(inst => <SummaryRow key={inst.id} sourceId="other_income" label={inst.label || 'Other Income'} amount={getYearly([inst.id])} color="rgba(20,123,117,0.8)" onTap={() => goToPanel('otherIncome')} />)}
                                                        <div style={{ height: 1, background: '#f0f0f0', margin: '8px 0' }} />
                                                    </>
                                                )}

                                                {/* Expense section */}
                                                {(expenseSources.length > 0 || otherExpSources.length > 0) && (
                                                    <>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                            <PiTrendDown size={16} color="#333" />
                                                            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#333' }}>Regular Expenses</span>
                                                        </div>
                                                        {expenseSources.map(s => <SummaryRow key={s.id} sourceId={s.id} label={s.label} amount={getYearly([s.editType])} color="rgba(224,100,112,0.8)" isExpense onTap={() => goToPanel(s.panelId)} />)}
                                                        {otherExpSources.map(inst => <SummaryRow key={inst.id} sourceId="other_expense" label={inst.label || 'Other Expense'} amount={getYearly([inst.id])} color="rgba(224,100,112,0.8)" isExpense onTap={() => goToPanel('otherExpense')} />)}
                                                    </>
                                                )}

                                                {/* Flexible section */}
                                                {(weeklySpendAmt > 0 || oneOffCount > 0) && (
                                                    <>
                                                        {(expenseSources.length > 0 || otherExpSources.length > 0) && <div style={{ height: 1, background: '#f0f0f0', margin: '8px 0' }} />}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                            <PiShuffle size={16} color="#333" />
                                                            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#333' }}>Flexible</span>
                                                        </div>
                                                        {weeklySpendAmt > 0 && (
                                                            <div onClick={() => goToPanel('weeklySpend')} style={{ display: 'flex', alignItems: 'center', padding: '7px 0', gap: 10, cursor: 'pointer' }}>
                                                                <div style={{
                                                                    width: 28, height: 28, borderRadius: '50%',
                                                                    background: 'rgba(224,100,112,0.08)',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    flexShrink: 0,
                                                                }}>
                                                                    <PiShoppingCart size={16} color="#e06470" />
                                                                </div>
                                                                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#333' }}>Weekly Spend</span>
                                                                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: 'rgba(224,100,112,0.8)' }}>{fmtK(getYearly(['weeklySpend'], true))}/yr</span>
                                                                {chevron}
                                                            </div>
                                                        )}
                                                        {oneOffCount > 0 && (
                                                            <div onClick={() => goToPanel('oneOffItems')} style={{ display: 'flex', alignItems: 'center', padding: '7px 0', gap: 10, cursor: 'pointer' }}>
                                                                <img src={variableOneOff} alt="" style={{ width: 22, height: 22, objectFit: 'contain', objectPosition: 'center', flexShrink: 0 }} />
                                                                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#333' }}>{oneOffCount} One-Off Item{oneOffCount !== 1 ? 's' : ''}</span>
                                                                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: oneOffTotal >= 0 ? 'rgba(20,123,117,0.8)' : 'rgba(224,100,112,0.8)' }}>
                                                                    {oneOffTotal >= 0 ? '+' : ''}{sym}{Math.abs(Math.round(oneOffTotal)).toLocaleString()}
                                                                </span>
                                                                {chevron}
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })()}
                            </div>
                        ))}
                    </div>

                    {/* Restore deleted bar — pinned above bottom buttons */}
                    {(() => {
                        const panelId = PANEL_STEPS[activePanel]
                        const editTypesMap = {
                            maintenanceLoan: 'loan', bursary: 'bursary',
                            familyFriends: 'family', work: 'work',
                            rent: 'rent', bills: 'bills', uniFees: 'uniFees',
                            savingsInvestments: 'savingsInv',
                        }
                        let editTypes = editTypesMap[panelId]
                        if (panelId === 'otherIncome') editTypes = (formData.otherIncomes || []).map(i => i.id)
                        if (panelId === 'otherExpense') editTypes = (formData.otherExpenses || []).map(i => i.id)
                        if (!editTypes) return null
                        return <RestoreDeletedBar editTypes={editTypes} color="#e07b3c" />
                    })()}

                    {/* Bottom buttons — hidden during uni overlay transition to avoid double-render jitter */}
                    <div style={{
                        flexShrink: 0,
                        padding: '10px 16px calc(14px + env(safe-area-inset-bottom, 0px))',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        background: '#f0f4f4',
                        visibility: (uniConfirming || uniSlideIn) ? 'hidden' : 'visible',
                    }}>
                        <button
                            onClick={panelOnBack}
                            style={{
                                width: 45, height: 45, borderRadius: 50,
                                border: 'none', background: '#f0f0f0',
                                cursor: 'pointer', flexShrink: 0, padding: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'translateZ(0)'
                            }}
                        >
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <path d="M12 15L7 10L12 5" stroke="#4b4a4a"
                                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                        <button
                            onClick={panelOnNext}
                            style={{
                                flex: 1, height: 45,
                                background: '#147b75',
                                color: '#fff',
                                border: 'none', borderRadius: 50,
                                fontSize: 15, fontWeight: 700,
                                fontFamily: 'Nunito, sans-serif',
                                cursor: 'pointer', letterSpacing: 0,
                            }}
                        >
                            {returnToSummaryRef.current ? 'Save' : PANEL_LABELS[activePanel]}
                        </button>
                        <div style={{
                            overflow: 'hidden', flexShrink: 0,
                            width: (PANEL_TO_SOURCE[PANEL_STEPS[activePanel]] || PANEL_STEPS[activePanel] === 'oneOffItems') ? 36 : 0,
                            opacity: (PANEL_TO_SOURCE[PANEL_STEPS[activePanel]] || PANEL_STEPS[activePanel] === 'oneOffItems') ? 1 : 0,
                            transition: 'width 0.3s ease, opacity 0.2s ease, margin-left 0.3s ease',
                            marginLeft: (PANEL_TO_SOURCE[PANEL_STEPS[activePanel]] || PANEL_STEPS[activePanel] === 'oneOffItems') ? 0 : -12,
                        }}>
                            <button
                                onClick={handlePanelSkip}
                                style={{
                                    background: 'none', border: 'none',
                                    cursor: 'pointer', padding: '0 4px',
                                    fontSize: 13, fontWeight: 600,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: '#aaa', whiteSpace: 'nowrap',
                                }}
                            >
                                Skip
                            </button>
                        </div>
                    </div>
                </div>

                {/* University overlay — present during university step and reverse slide-in */}
                {(currentStep.id === 'university' || uniSlideIn) && (
                    <>
                        {/* Backdrop — only in steady-state university step, not during reverse slide */}
                        <div style={{
                            position: 'fixed',
                            inset: 0,
                            background: '#fff',
                            pointerEvents: 'none',
                            zIndex: 5,
                            opacity: uniSlideIn ? 0 : 1,
                            transition: 'opacity 0.3s ease',
                        }} />

                        {/* University card — top contracts down into form card position */}
                        <div style={{
                            position: 'fixed',
                            top: uniSlideOut ? 200 : 10,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            zIndex: 6,
                            overflow: 'hidden',
                            borderRadius: uniSlideOut ? '16px 16px 0 0' : 14,
                            boxShadow: 'none',
                            background: '#fff',
                            display: 'flex',
                            flexDirection: 'column',
                            transition: 'top 0.55s cubic-bezier(0.25, 1, 0.5, 1)'
                        }}>
                            {/* Content fades out as card contracts */}
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                flex: 1,
                                minHeight: 0,
                            }}>
                                <div style={{ padding: '18px 24px 0' }}>
                                    <h2 style={{
                                        fontSize: 25,
                                        fontWeight: 700,
                                        fontFamily: 'Nunito, sans-serif',
                                        color: '#000',
                                        margin: '0 0 12px',
                                        lineHeight: 1.3,
                                    }}>
                                        Your University
                                    </h2>
                                    <p style={{
                                        fontSize: 15,
                                        fontFamily: 'Nunito, sans-serif',
                                        color: '#444',
                                        margin: '0 0 24px',
                                        lineHeight: 1.5,
                                    }}>
                                        This helps us match your budget to your term dates and connect you with university support if needed
                                    </p>
                                    <NativeSelect
                                        value={formData.university}
                                        onChange={(value) => {
                                            updateField('university', value)
                                            updateField('termDates', getTermDatesForUniversity(value))
                                        }}
                                        options={UK_UNIVERSITIES.map(uni => ({ value: uni, label: uni }))}
                                        placeholder="Select your university"
                                        style={{ fontSize: 17, height: '40px' }}
                                    />
                                </div>
                                <div style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '16px 24px 0',
                                    minHeight: 0,
                                }}>
                                    <img
                                        src={universityIllustration}
                                        alt=""
                                        style={{
                                            width: '100%',
                                            maxWidth: 303,
                                            height: 'auto',
                                            objectFit: 'contain',
                                            opacity: (uniConfirming || uniSlideOut) ? 0 : 1,
                                            transition: 'opacity 0.8s ease-in-out',
                                        }}
                                    />
                                </div>
                                <div style={{ padding: '10px 19px 14px 19px', borderTop: '1px solid #f3f3f3', position: 'relative', zIndex: 1, background: '#fff' }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                    }}>
                                        {/* Ghost back button — fades in during confirm, starts visible during reverse */}
                                        <div style={{
                                            width: uniConfirming ? 60 : uniReversing ? 45 : 0,
                                            height: 45,
                                            borderRadius: 50,
                                            background: '#f0f0f0',
                                            flexShrink: 0,
                                            opacity: (uniConfirming || uniReversing) ? 1 : 0,
                                            overflow: 'hidden',
                                            position: 'relative',
                                            transition: 'width 0.35s cubic-bezier(.22,1,.36,1), opacity 0.25s ease',
                                        }}>
                                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"
                                                style={{
                                                    position: 'absolute',
                                                    top: '50%', left: '50%',
                                                    transform: 'translate(-50%, -50%)',
                                                    display: 'block',
                                                }}>
                                                <path d="M12 15L7 10L12 5" stroke="#4b4a4a"
                                                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </div>
                                        <button
                                            onClick={handleUniversityConfirm}
                                            style={{
                                                flex: 1,
                                                height: 45,
                                                background: '#147b75',
                                                color: '#fff',
                                                border: 'none',
                                                borderRadius: 50,
                                                fontSize: 15,
                                                fontWeight: 700,
                                                fontFamily: 'Nunito, sans-serif',
                                                cursor: 'pointer',
                                                letterSpacing: 0,
                                                transition: 'flex 0.35s cubic-bezier(.22,1,.36,1)',
                                            }}
                                        >
                                            {(uniConfirming || uniReversing) ? 'Confirm Term Dates' : 'Confirm University'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )
                }

                {/* Event edit modal */}
                {editingEvent && (() => {
                    const isIncome = editingEvent.type === 'income'
                    const color = isIncome ? '#147b75' : '#e06470'
                    const w = 140
                    const left = Math.max(8, Math.min(editingEvent.clickX - w / 2, window.innerWidth - w - 8))
                    const top = editingEvent.clickY + 12
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
                                    {editingEvent.sublabel}{editingEvent.date ? ` · ${new Date(editingEvent.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
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
                                        New balance: {getCurrencySymbol()}{Math.round(editingEvent.balanceAfter).toLocaleString()}
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
                                                    value={formatMoney(editAmount)}
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
                                                    } else if (editingEvent.editType === 'work' && editingEvent.editMonth) {
                                                        updateField('workInstalmentAmounts', {
                                                            ...(formData.workInstalmentAmounts || {}),
                                                            [editingEvent.editMonth]: val,
                                                        })
                                                    } else if (editingEvent.editType === 'savings' && editingEvent.editMonth) {
                                                        updateField('savingsInstalmentAmounts', {
                                                            ...(formData.savingsInstalmentAmounts || {}),
                                                            [editingEvent.editMonth]: val,
                                                        })
                                                    } else if (editingEvent.editType === 'family') {
                                                        updateField('familyAmount', val)
                                                    } else if (editingEvent.editType?.startsWith('oi_')) {
                                                        updateOtherInst('otherIncomes', editingEvent.editType, 'amount', val)
                                                    } else if (editingEvent.editType?.startsWith('oe_')) {
                                                        updateOtherInst('otherExpenses', editingEvent.editType, 'amount', val)
                                                    } else if (editingEvent.editType === 'rent') {
                                                        updateField('rentAmount', val)
                                                    }
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
                                                                const newInst = { ...(prev[instKey] || {}) }; delete newInst[month]
                                                                const newDates = { ...(prev[datesKey] || {}) }; delete newDates[month]
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
                                                        const key = `${editingEvent.editType}:${editingEvent.date}`
                                                        updateField('removedEvents', [...(formData.removedEvents || []), key])
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
                {/* Balance edit popup */}
                {editingBalance && (() => {
                    const w = 105
                    const left = Math.max(8, Math.min(editingBalance.clickX - w / 2, window.innerWidth - w - 8))
                    const top = editingBalance.clickY + 12
                    return (
                        <>
                            <div
                                onClick={() => setEditingBalance(false)}
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
                                    Bank balance
                                </span>
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
                                            value={formatMoney(editBalanceAmount)}
                                            onChange={(e) => setEditBalanceAmount(e.target.value.replace(/[^0-9.\-]/g, ''))}
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
                                            const val = editBalanceAmount.replace(/[^0-9.\-]/g, '')
                                            updateField('balance', val)
                                            setEditingBalance(false)
                                        }}
                                        style={{
                                            width: 24, height: 24,
                                            border: 'none', borderRadius: 5,
                                            background: '#EC8C17',
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
            </div >
        )
    }


}
