import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ChevronUp, ChevronDown, ChevronRight, Check, Clock, Plus, Trash, Eye, EyeOff, AlertTriangle } from 'react-feather'
import { PiCalendarBlank, PiCalendarBlankFill, PiLightbulb, PiLightbulbFill, PiChartLineUp, PiTrendUp, PiTrendUpBold, PiShuffle, PiShuffleBold } from 'react-icons/pi'
import { useSurveySequence } from '../lib/useSurveySequence'
import TermGraph, { refreshAY, AY_START, AY_END, datePct, daysBetween, fmt } from '../components/TermGraph'
import { supabase } from '../lib/supabaseClient'
import { fetchUserData, saveCashflowForecast, saveUserFinances, saveTermDates, saveBalanceHistory } from '../lib/api'
import { getCurrencySymbol, getGraphStart, setGraphStart } from '../lib/settings'
import { toLocalDate, makeOtherInstance, MONTH_KEY_TO_DATE, MONTH_SHORT, isInTerm, distributeEvenly, addMonths } from '../lib/helpers'
import { analytics, DASHBOARD_EVENTS, getBalanceRange } from '../lib/analytics/index.js'
import {
    INITIAL_FORM_DATA,
    DEFAULT_LOAN_MONTHS,
    ALL_MONTH_KEYS,
    MONTH_LABELS,
    hasCustomTermDates,
    getTermDatesForUniversity,
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
import { PiGraduationCap, PiHandCoins, PiUsers, PiBriefcase, PiDotsThree, PiHouse, PiLightningFill, PiBank, PiPiggyBank, PiRepeat, PiIdentificationCard, PiAirplaneTilt, PiMusicNotes, PiGift, PiDeviceMobile, PiTShirt, PiHeartbeat, PiBookOpen, PiStorefront, PiLifebuoy, PiLaptop } from 'react-icons/pi'
import FlexSourceStep from './FlexSourceStep'
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

// Phosphor icon components + colors for each source (used in FAB + SourceRow)
export const SOURCE_ICONS = {
    maintenance_loan: { Icon: PiGraduationCap, color: '#147b75' },
    bursary: { Icon: PiHandCoins, color: '#1a9e97' },
    family_friends: { Icon: PiUsers, color: '#3b82a0' },
    work: { Icon: PiBriefcase, color: '#5a7c4f' },
    other_income: { Icon: PiDotsThree, color: '#888' },
    rent: { Icon: PiHouse, color: '#e06470' },
    bills: { Icon: PiLightningFill, color: '#e8838e' },
    uni_fees: { Icon: PiBank, color: '#c0392b' },
    savings_investments: { Icon: PiPiggyBank, color: '#d4566a' },
    subscriptions: { Icon: PiRepeat, color: '#cf5c68' },
    memberships: { Icon: PiIdentificationCard, color: '#e06470' },
    other_expense: { Icon: PiDotsThree, color: '#888' },
    // Flex income
    flex_freelance: { Icon: PiBriefcase, color: '#5a7c4f' },
    flex_family_topups: { Icon: PiUsers, color: '#3b82a0' },
    flex_savings_dip: { Icon: PiPiggyBank, color: '#1a9e97' },
    flex_selling: { Icon: PiStorefront, color: '#7c6f4f' },
    flex_hardship: { Icon: PiLifebuoy, color: '#c0392b' },
    flex_side_projects: { Icon: PiLaptop, color: '#6366f1' },
    flex_other_income: { Icon: PiDotsThree, color: '#888' },
    // Flex expense
    flex_travel: { Icon: PiAirplaneTilt, color: '#e06470' },
    flex_subscriptions: { Icon: PiRepeat, color: '#cf5c68' },
    flex_memberships: { Icon: PiIdentificationCard, color: '#e06470' },
    flex_events: { Icon: PiMusicNotes, color: '#d4566a' },
    flex_gifts: { Icon: PiGift, color: '#e8838e' },
    flex_tech: { Icon: PiDeviceMobile, color: '#8b5cf6' },
    flex_clothing: { Icon: PiTShirt, color: '#d4566a' },
    flex_health: { Icon: PiHeartbeat, color: '#e06470' },
    flex_course_materials: { Icon: PiBookOpen, color: '#c0392b' },
    flex_other_expense: { Icon: PiDotsThree, color: '#888' },
}

const STORAGE_KEY = 'budgeup_onboarding_state'

/* ---------- SOURCE CONFIGS ---------- */

const FIXED_INCOME_SOURCES = [
    { id: 'maintenance_loan', label: 'Maintenance Loan', icon: incomeLoan, panelId: 'maintenanceLoan', editable: true, onboarding: true },
    { id: 'bursary', label: 'Bursary', icon: incomeFamily, panelId: 'bursary', onboarding: true },
    { id: 'family_friends', label: 'Family & Friends', icon: incomeFriends, panelId: 'familyFriends', onboarding: true },
    { id: 'work', label: 'Work', icon: incomeWork, panelId: 'work', onboarding: true },
]

const FIXED_EXPENSE_SOURCES = [
    { id: 'rent', label: 'Rent', icon: expenseRent, panelId: 'rent', onboarding: true },
    { id: 'bills', label: 'Bills & Utilities', icon: expenseBills, panelId: 'bills', onboarding: true },
    { id: 'uni_fees', label: 'University Fees', icon: expenseUnifees, panelId: 'uniFees', onboarding: true },
    { id: 'savings_investments', label: 'Savings & Investments', icon: expenseSavings, panelId: 'savingsInvestments', onboarding: true },
    { id: 'subscriptions', label: 'Subscriptions', icon: null, panelId: 'subscriptions' },
    { id: 'memberships', label: 'Memberships', icon: null, panelId: 'memberships' },
]

const FLEX_INCOME_SOURCES = [
    { id: 'flex_freelance', label: 'Freelance / Gig Work', defaultFreq: 'monthly' },
    { id: 'flex_family_topups', label: 'Family Top-ups', defaultFreq: 'monthly' },
    { id: 'flex_savings_dip', label: 'Dip into Savings', defaultFreq: 'one-off' },
    { id: 'flex_selling', label: 'Selling Items', defaultFreq: 'one-off' },
    { id: 'flex_hardship', label: 'Hardship Fund', defaultFreq: 'one-off' },
    { id: 'flex_side_projects', label: 'Side Projects', defaultFreq: 'monthly' },
    { id: 'flex_other_income', label: 'Other Income', defaultFreq: 'monthly' },
]

const FLEX_EXPENSE_SOURCES = [
    { id: 'flex_travel', label: 'Travel & Holidays', defaultFreq: 'one-off' },
    { id: 'flex_events', label: 'Events & Nights Out', defaultFreq: 'one-off' },
    { id: 'flex_gifts', label: 'Gifts', defaultFreq: 'one-off' },
    { id: 'flex_tech', label: 'Tech & Gadgets', defaultFreq: 'one-off' },
    { id: 'flex_clothing', label: 'Clothing', defaultFreq: 'one-off' },
    { id: 'flex_health', label: 'Health & Wellbeing', defaultFreq: 'one-off' },
    { id: 'flex_course_materials', label: 'Course Materials', defaultFreq: 'one-off' },
    { id: 'flex_other_expense', label: 'Other Expense', defaultFreq: 'monthly' },
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
    if (frequency === 'fortnightly') {
        let d = nextDate ? new Date(nextDate + 'T00:00:00') : new Date(AY_START)
        while (d > ayStart) d = new Date(d.getTime() - 14 * 24 * 60 * 60 * 1000)
        while (d < ayStart) d = new Date(d.getTime() + 14 * 24 * 60 * 60 * 1000)
        while (d <= ayEnd) { dates.push(toLocalDate(d)); d = new Date(d.getTime() + 14 * 24 * 60 * 60 * 1000) }
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
            const YM = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, termly: terms.length || 2, yearly: 1 }
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
                    while (d > ayStart) d = addMonths(d, -1, dom)
                    while (d < ayStart) d = addMonths(d, 1, dom)
                    while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} support` }); d = addMonths(d, 1, dom) }
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
                    while (d > ayStart) d = addMonths(d, -1, dom)
                    while (d < ayStart) d = addMonths(d, 1, dom)
                    while (d <= ayEnd) { const ds = toLocalDate(d); const a = getFamAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'income', label: 'Family/Friends', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} support`, editType: 'family' }); d = addMonths(d, 1, dom) }
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
            const YM = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, termly: terms.length || 2, yearly: 1 }
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
                    while (d > ayStart) d = addMonths(d, -1, dom)
                    while (d < ayStart) d = addMonths(d, 1, dom)
                    while (d <= ayEnd) { const ds = toLocalDate(d); const a = getWorkAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'income', label: 'Work', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} income`, editType: 'work' }); d = addMonths(d, 1, dom) }
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
            const YM = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, termly: terms.length || 2, yearly: 1 }
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
                    while (d > ayStart) d = addMonths(d, -1, dom)
                    while (d < ayStart) d = addMonths(d, 1, dom)
                    while (d <= ayEnd) { const ds = toLocalDate(d); const a = getOtherAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'income', label: lbl, sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })}`, editType: inst.id }); d = addMonths(d, 1, dom) }
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
        const YM = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, termly: terms.length || 2, yearly: 1 }
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
        const YM = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, termly: terms.length || 2, yearly: 1 }
        const yearlyBills = billsAmt * (YM[billsAmtPeriod] || 1)
        if (isYearlyBills) {
            const allDates = []
            if (freq === 'weekly' || freq === 'fortnightly') {
                const step = freq === 'fortnightly' ? 14 : 7
                let d = formData.billsNextDate ? new Date(formData.billsNextDate + 'T00:00:00') : new Date(AY_START)
                while (d > ayStart) d = new Date(d.getTime() - step * 86400000)
                while (d < ayStart) d = new Date(d.getTime() + step * 86400000)
                while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: freq === 'fortnightly' ? 'Fortnightly bills' : 'Weekly bills' }); d = new Date(d.getTime() + step * 86400000) }
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
            if (freq === 'weekly' || freq === 'fortnightly') {
                const step = freq === 'fortnightly' ? 14 : 7
                let d = formData.billsNextDate ? new Date(formData.billsNextDate + 'T00:00:00') : new Date(AY_START)
                while (d > ayStart) d = new Date(d.getTime() - step * 86400000)
                while (d < ayStart) d = new Date(d.getTime() + step * 86400000)
                while (d <= ayEnd) { const dateString = toLocalDate(d); if (billsInRange(dateString)) { const a = getBillsAmt(dateString); if (a > 0) events.push({ date: dateString, amount: a, type: 'expense', label: 'Bills', sublabel: freq === 'fortnightly' ? 'Fortnightly bills' : 'Weekly bills', editType: 'bills' }) }; d = new Date(d.getTime() + step * 86400000) }
            } else if (freq === 'monthly') {
                let d = formData.billsNextDate ? new Date(formData.billsNextDate + 'T00:00:00') : new Date(AY_START)
                const dom = d.getDate()
                while (d > ayStart) d = addMonths(d, -1, dom)
                while (d < ayStart) d = addMonths(d, 1, dom)
                while (d <= ayEnd) { const dateString = toLocalDate(d); if (billsInRange(dateString)) { const a = getBillsAmt(dateString); if (a > 0) events.push({ date: dateString, amount: a, type: 'expense', label: 'Bills', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} bills`, editType: 'bills' }) }; d = addMonths(d, 1, dom) }
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
            const YM = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, termly: terms.length || 2, yearly: 1 }
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
                    while (d > ayStart) d = addMonths(d, -1, dom)
                    while (d < ayStart) d = addMonths(d, 1, dom)
                    while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} fees` }); d = addMonths(d, 1, dom) }
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
                    while (d > ayStart) d = addMonths(d, -1, dom)
                    while (d < ayStart) d = addMonths(d, 1, dom)
                    while (d <= ayEnd) {
                        const dateString = toLocalDate(d); const a = getUniAmt(dateString)
                        if (a > 0) events.push({ date: dateString, amount: a, type: 'expense', label: 'University Fees', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} fees`, editType: 'uniFees' })
                        d = addMonths(d, 1, dom)
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
            const YM = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, termly: terms.length || 2, yearly: 1 }
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
                    while (d <= ayEnd) { allDates.push({ date: toLocalDate(d), sublabel: 'Monthly savings' }); d = addMonths(d, 1, dom) }
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
                    while (d > ayStart) d = addMonths(d, -1, dom)
                    while (d < ayStart) d = addMonths(d, 1, dom)
                    while (d <= ayEnd) { const dateString = toLocalDate(d); const a = getSavAmt(dateString); if (a > 0) events.push({ date: dateString, amount: a, type: 'expense', label: 'Savings', sublabel: 'Monthly savings', editType: 'savingsInv' }); d = addMonths(d, 1, dom) }
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
            const YM = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, termly: terms.length || 2, yearly: 1 }
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
                    while (d > ayStart) d = addMonths(d, -1, dom)
                    while (d < ayStart) d = addMonths(d, 1, dom)
                    while (d <= ayEnd) { const dateString = toLocalDate(d); const a = getOtherExpAmt(dateString); if (a > 0) events.push({ date: dateString, amount: a, type: 'expense', label: lbl, sublabel: d.toLocaleDateString('en-GB', { month: 'long' }), editType: inst.id }); d = addMonths(d, 1, dom) }
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

    // Flex sources (income + expense)
    const allFlexSources = [
        ...((formData.flexIncomeSources || []).map(id => ({ id, type: 'income' }))),
        ...((formData.flexExpenseSources || []).map(id => ({ id, type: 'expense' }))),
    ]
    for (const { id: flexId, type: flexType } of allFlexSources) {
        const srcData = formData.flexSourceData?.[flexId]
        if (!srcData) continue
        const amt = parseFloat(String(srcData.amount || '0').replace(/,/g, ''))
        if (amt <= 0) continue
        const freq = srcData.frequency || 'monthly'
        const allSrc = flexType === 'income' ? FLEX_INCOME_SOURCES : FLEX_EXPENSE_SOURCES
        const srcDef = allSrc.find(s => s.id === flexId)
        const label = srcDef?.label || flexId
        const startDate = srcData.startDate || AY_START
        const endDate = srcData.endDate || AY_END
        const ayStart = new Date(AY_START + 'T00:00:00')
        const ayEndD = new Date(AY_END + 'T00:00:00')
        const effStart = new Date(Math.max(new Date(startDate + 'T00:00:00'), ayStart))
        const effEnd = new Date(Math.min(endDate ? new Date(endDate + 'T00:00:00') : ayEndD, ayEndD))

        if (freq === 'one-off') {
            if (startDate) events.push({ date: startDate, amount: amt, type: flexType, label, sublabel: 'One-off', editType: flexId })
        } else if (freq === 'weekly') {
            let d = new Date(effStart)
            while (d <= effEnd) { events.push({ date: toLocalDate(d), amount: amt, type: flexType, label, sublabel: 'Weekly', editType: flexId }); d = new Date(d.getTime() + 7 * 86400000) }
        } else if (freq === 'fortnightly') {
            let d = new Date(effStart)
            while (d <= effEnd) { events.push({ date: toLocalDate(d), amount: amt, type: flexType, label, sublabel: 'Fortnightly', editType: flexId }); d = new Date(d.getTime() + 14 * 86400000) }
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
        const isFlex = e.editType?.startsWith('flex_')
        const base = isFlex ? { ...e, flex: true } : e
        // One-off items are deleted from source array directly, not via removedEvents
        if (base.editType === 'oneOffIncome' || base.editType === 'oneOffExpense') return base
        return removed.includes(`${base.editType}:${base.date}`) ? { ...base, removed: true } : base
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

function BalancePillInline({ value, sym, onSave, onCancel, compact }) {
    const [raw, setRaw] = useState(() => {
        const n = parseFloat(String(value || '').replace(/,/g, ''))
        return isNaN(n) ? '' : new Intl.NumberFormat('en-GB').format(Math.abs(n))
    })
    const [isNegative, setIsNegative] = useState(value < 0)
    const inputRef = useRef(null)

    useEffect(() => { inputRef.current?.focus({ preventScroll: true }) }, [])

    const handleChange = (e) => {
        let val = e.target.value.replace(/[^0-9.]/g, '')
        const parts = val.split('.')
        if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('')
        if (parts.length === 2 && parts[1].length > 2) val = parts[0] + '.' + parts[1].slice(0, 2)
        const [int, dec] = val.split('.')
        const formattedInt = int ? new Intl.NumberFormat('en-GB').format(Number(int)) : ''
        setRaw(dec !== undefined ? `${formattedInt}.${dec}` : formattedInt)
    }

    const handleConfirm = () => {
        const n = parseFloat(String(raw || '0').replace(/,/g, ''))
        onSave(String(isNegative ? -Math.abs(n) : Math.abs(n)))
    }

    const sz = compact ? 28 : 40

    return (
        <div style={{ display: 'flex', flexDirection: compact ? 'row' : 'column', alignItems: compact ? 'center' : 'stretch', gap: compact ? 10 : 0 }}>
            {/* Number input row */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: compact ? '4px 0' : '8px 0 24px', gap: compact ? 6 : 10,
                flex: compact ? 1 : undefined,
            }}>
                <button
                    onClick={() => setIsNegative(n => !n)}
                    style={{
                        width: compact ? 24 : 28, height: compact ? 34 : 44, borderRadius: compact ? 6 : 8,
                        cursor: 'pointer', background: isNegative ? '#e06470' : '#147b75',
                        border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: compact ? 18 : 22, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                        flexShrink: 0, transition: 'background 0.2s ease',
                    }}
                >
                    {isNegative ? '\u2212' : '+'}
                </button>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                    <span style={{
                        fontSize: sz, fontWeight: 800, color: '#1a1a1a',
                        fontFamily: 'Nunito, sans-serif',
                    }}>{sym}</span>
                    <input
                        ref={inputRef}
                        type="text"
                        inputMode="decimal"
                        value={raw}
                        onChange={handleChange}
                        onKeyDown={e => e.key === 'Enter' && handleConfirm()}
                        style={{
                            border: 'none', background: 'transparent',
                            fontSize: sz, fontWeight: 800, color: '#1a1a1a',
                            fontFamily: 'Nunito, sans-serif', outline: 'none', padding: 0,
                            width: Math.max(compact ? 50 : 60, (raw || '0.00').length * (compact ? 16 : 22)),
                            textAlign: 'left',
                        }}
                        placeholder="0.00"
                    />
                </div>
            </div>

            {/* Save button */}
            <button
                onClick={handleConfirm}
                style={{
                    width: compact ? 40 : '100%', height: compact ? 40 : 48,
                    borderRadius: compact ? 12 : 14,
                    border: 'none', background: '#EC8C17',
                    fontSize: compact ? 14 : 16, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                    color: '#fff', cursor: 'pointer', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
            >
                {compact ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M5 12L10 17L19 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                ) : 'Save'}
            </button>
        </div>
    )
}

/* ---------- FLEX ROW (mirrors SourceRow expand behavior) ---------- */

function FlexRow({ srcId, label, amt, frequency, si, isExpense, expanded, onExpandToggle, onDelete, onToggleVisibility, active = true, scrollContainerRef, children }) {
    const innerRef = useRef(null)
    const [measuredHeight, setMeasuredHeight] = useState(0)
    const [deleting, setDeleting] = useState(false)

    useLayoutEffect(() => {
        if (expanded && innerRef.current) {
            setMeasuredHeight(innerRef.current.scrollHeight)
        }
    }, [expanded, children])

    useEffect(() => {
        if (!expanded || !innerRef.current) return
        const ro = new ResizeObserver(() => {
            if (innerRef.current) setMeasuredHeight(innerRef.current.scrollHeight)
        })
        ro.observe(innerRef.current)
        return () => ro.disconnect()
    }, [expanded])

    const color = isExpense ? '#e06470' : '#147b75'

    const handleDelete = () => {
        if (deleting) return
        setDeleting(true)
        setTimeout(() => onDelete(), 500)
    }

    return (
        <div data-source-row data-source-id={srcId} style={{
            margin: '0 12px', borderRadius: 10, background: !active ? '#f0f0f0' : '#f5f5f5', overflow: 'hidden',
            maxHeight: deleting ? 0 : 1000,
            opacity: deleting ? 0 : !active ? 0.55 : 1,
            marginBottom: deleting ? -2 : 6,
            transform: deleting ? 'translateX(-40px) scale(0.97)' : 'translateX(0) scale(1)',
            transition: deleting
                ? 'max-height 0.4s cubic-bezier(0.22, 0.61, 0.36, 1) 0.1s, opacity 0.25s ease, margin-bottom 0.4s ease 0.1s, transform 0.3s ease'
                : 'opacity 0.3s ease, background 0.3s ease',
        }}>
            <div onClick={onExpandToggle} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', gap: 12, cursor: 'pointer' }}>
                {si && (
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: isExpense ? 'rgba(224,100,112,0.1)' : 'rgba(20,123,117,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <si.Icon size={20} color={color} />
                    </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a', display: 'block' }}>{label}</span>
                    {amt > 0 && (
                        <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#999' }}>
                            {isExpense ? '\u2212' : '+'}{getCurrencySymbol()}{amt.toLocaleString()}
                            {frequency && frequency !== 'one-off' ? `/${frequency === 'weekly' ? 'wk' : frequency === 'fortnightly' ? '2wk' : frequency === 'monthly' ? 'mo' : frequency === 'quarterly' ? 'qtr' : frequency === 'termly' ? 'term' : 'yr'}` : ''}
                        </span>
                    )}
                </div>
                {onToggleVisibility && (
                    <button onClick={(e) => { e.stopPropagation(); onToggleVisibility() }} style={{
                        background: 'none', border: 'none', padding: '4px 8px 4px 4px',
                        cursor: 'pointer', display: 'flex', alignItems: 'center',
                        flexShrink: 0, marginRight: -4,
                    }}>
                        <div style={{
                            transition: 'transform 0.2s ease, opacity 0.2s ease',
                            transform: active ? 'scale(1)' : 'scale(0.85)',
                            opacity: active ? 1 : 0.5,
                            display: 'flex', alignItems: 'center',
                        }}>
                            {active
                                ? <Eye size={16} strokeWidth={1.8} color={isExpense ? '#e06470' : '#147b75'} />
                                : <EyeOff size={16} strokeWidth={1.8} color="#999" />
                            }
                        </div>
                    </button>
                )}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isExpense ? '#bbb' : '#999'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)' }}><path d="M6 9l6 6 6-6" /></svg>
            </div>
            <div style={{
                maxHeight: expanded ? (measuredHeight + 20) || 800 : 0,
                opacity: expanded ? 1 : 0,
                overflow: 'hidden',
                transition: expanded
                    ? 'max-height 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.2s ease'
                    : 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease',
            }}>
                <div ref={innerRef}>
                    <div style={{ borderTop: '1px solid #eee', padding: '8px 14px 4px', background: '#fafafa' }}>
                        {children}
                        <div style={{ padding: '4px 0 8px', textAlign: 'center' }}>
                            <span onClick={handleDelete} style={{ fontSize: 10, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#e06470', cursor: 'pointer' }}>Delete {label.toLowerCase()}</span>
                        </div>
                    </div>
                </div>
            </div>
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
    const [naturalHeight, setNaturalHeight] = useState(null)
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



    return (
        <div ref={rowRef} data-source-row data-source-id={source.id} style={{
            margin: '0 12px',
            borderRadius: 10,
            background: isInactive ? '#f0f0f0' : '#f5f5f5',
            overflow: 'hidden',
            maxHeight: deleting ? 0 : naturalHeight != null ? naturalHeight : 1000,
            opacity: deleting ? 0 : isInactive ? 0.55 : 1,
            marginBottom: deleting ? 0 : 6,
            transition: deleting
                ? 'max-height 0.4s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.25s ease, margin-bottom 0.4s cubic-bezier(0.22, 0.61, 0.36, 1)'
                : 'opacity 0.25s ease, background 0.25s ease',
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
                {(() => {
                    const si = SOURCE_ICONS[source.id] || SOURCE_ICONS[source.isOtherIncome ? 'other_income' : source.isOtherExpense ? 'other_expense' : '']
                    if (si) {
                        const { Icon: SrcIcon } = si
                        const iconColor = isInactive ? '#bbb' : (isExpense ? '#e06470' : '#147b75')
                        const bgColor = isInactive ? '#eee' : (isExpense ? 'rgba(224,100,112,0.1)' : 'rgba(20,123,117,0.1)')
                        return (
                            <div style={{
                                width: 36, height: 36, borderRadius: '50%',
                                background: bgColor,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <SrcIcon size={20} color={iconColor} />
                            </div>
                        )
                    }
                    return (
                        <div style={{
                            width: 36, height: 36,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, opacity: isInactive ? 0.4 : 0.8,
                        }}>
                            <img src={source.icon} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                        </div>
                    )
                })()}

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
                        background: 'none', border: 'none', padding: '4px 8px 4px 4px',
                        cursor: 'pointer', display: 'flex', alignItems: 'center',
                        flexShrink: 0, marginRight: -4,
                    }}
                >
                    <div style={{
                        transition: 'transform 0.2s ease, opacity 0.2s ease',
                        transform: active ? 'scale(1)' : 'scale(0.85)',
                        opacity: active ? 1 : 0.5,
                        display: 'flex', alignItems: 'center',
                    }}>
                        {active
                            ? <Eye size={16} strokeWidth={1.8} color={isExpense ? '#e06470' : '#147b75'} />
                            : <EyeOff size={16} strokeWidth={1.8} color="#999" />
                        }
                    </div>
                </button>
                <ChevronRight size={16} color={isInactive ? '#bbb' : '#ccc'} style={{
                    flexShrink: 0,
                    transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                }} />
            </div>

            {/* Expanded section — animated height */}
            <div data-expand-content style={{
                maxHeight: expanded ? (measuredHeight + 20) || 800 : 0,
                opacity: expanded ? 1 : 0,
                overflow: 'hidden',
                transition: expanded
                    ? 'max-height 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.2s ease'
                    : 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease',
            }}>
                <div ref={innerRef}>
                    {children && (
                        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 14, background: '#fafafa' }}>
                            {children}
                        </div>
                    )}
                    {onDelete && (
                        <div style={{ padding: '4px 10px 10px', textAlign: 'center', background: '#fafafa' }}>
                            <span
                                onClick={(e) => {
                                    e.stopPropagation()
                                    if (deleting) return
                                    // Capture actual height before collapsing
                                    if (rowRef.current) setNaturalHeight(rowRef.current.offsetHeight)
                                    requestAnimationFrame(() => {
                                        setDeleting(true)
                                        onDelete()
                                    })
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
    // Merge break names from university config (only fills in missing names, never changes dates)
    try {
        if (d.university && hasCustomTermDates(d.university) && d.termDates?.terms?.length) {
            const custom = getTermDatesForUniversity(d.university)
            if (custom?.terms?.length) {
                for (let ti = 0; ti < d.termDates.terms.length && ti < custom.terms.length; ti++) {
                    const breaks = d.termDates.terms[ti].breaks
                    const customBreaks = custom.terms[ti].breaks
                    if (!breaks || !customBreaks) continue
                    for (let bi = 0; bi < breaks.length; bi++) {
                        const match = customBreaks.find(cb => cb.start === breaks[bi].start && cb.end === breaks[bi].end)
                        if (match?.name && !breaks[bi].name) {
                            breaks[bi].name = match.name
                        }
                    }
                }
            }
        }
    } catch { /* ignore */ }
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

    const [userEmail, setUserEmail] = useState('')
    const [graphKey, setGraphKey] = useState(0)
    const [graphZeroDate, setGraphZeroDate] = useState(null)
    const [graphOverdraftDate, setGraphOverdraftDate] = useState(null)
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
    const [showHolidays, setShowHolidays] = useState(() => localStorage.getItem('budgeup_show_holidays') !== 'false')
    const [showFlexible, setShowFlexible] = useState(() => localStorage.getItem('budgeup_show_flexible') !== 'false')
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

        const wasExpanded = expandedSources.has(sourceId)

        // When collapsing, add temporary spacer to prevent scroll jump as content shrinks
        if (wasExpanded) {
            isAnimatingRef.current = true
            if (snapTimerRef.current) { clearTimeout(snapTimerRef.current); snapTimerRef.current = null }
            const el = scrollRef.current
            if (el) {
                const graphExpanded = el.scrollTop < SHRINK_DIST - 1
                if (graphExpanded) {
                    // Graph is expanded — just let the row collapse, no scroll needed
                    setTimeout(() => { isAnimatingRef.current = false }, 450)
                } else {
                    const spacer = document.createElement('div')
                    spacer.style.height = '500px'
                    spacer.style.flexShrink = '0'
                    el.appendChild(spacer)
                    // After collapse animation, shrink spacer gradually then remove
                    setTimeout(() => {
                        // Animate spacer height to 0 so scroll adjusts smoothly
                        spacer.style.transition = 'height 0.4s ease'
                        spacer.style.height = '0px'
                        const maxScroll = el.scrollHeight - spacer.offsetHeight - el.clientHeight
                        const dest = Math.max(0, Math.min(el.scrollTop, maxScroll))
                        if (Math.abs(el.scrollTop - dest) > 2) {
                            el.scrollTo({ top: dest, behavior: 'smooth' })
                        }
                        setTimeout(() => {
                            spacer.remove()
                            isAnimatingRef.current = false
                        }, 450)
                    }, 300)
                }
            } else {
                setTimeout(() => { isAnimatingRef.current = false }, 300)
            }
        }

        setExpandedSources(prev => {
            const next = new Set(prev)
            if (next.has(sourceId)) {
                next.delete(sourceId)
                setVisibleExpandedSource(v => v === sourceId ? null : v)
            } else {
                next.add(sourceId)
                setVisibleExpandedSource(sourceId)
            }
            return next
        })

        // When expanding, scroll row into view (without collapsing the graph)
        if (!wasExpanded) {
            isAnimatingRef.current = true
            if (snapTimerRef.current) { clearTimeout(snapTimerRef.current); snapTimerRef.current = null }
            setTimeout(() => {
                const el = scrollRef.current
                if (!el) { isAnimatingRef.current = false; return }
                const row = el.querySelector(`[data-source-id="${sourceId}"]`)
                if (!row) { isAnimatingRef.current = false; return }
                const stickyHeader = el.querySelector('[data-sticky-header]')
                const headerH = stickyHeader ? stickyHeader.offsetHeight : 0
                const target = row.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - headerH - 5
                const dest = Math.max(el.scrollTop, target)
                const dist = Math.abs(el.scrollTop - dest)
                if (dist > 2) {
                    const duration = Math.max(400, Math.min(700, dist * 3))
                    const start = el.scrollTop
                    const diff = dest - start
                    const startTime = performance.now()
                    const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
                    const step = (now) => {
                        const t = Math.min(1, (now - startTime) / duration)
                        el.scrollTop = start + diff * ease(t)
                        applyScrollStyles(el.scrollTop)
                        if (t < 1) {
                            requestAnimationFrame(step)
                        } else {
                            isAnimatingRef.current = false
                        }
                    }
                    requestAnimationFrame(step)
                } else {
                    isAnimatingRef.current = false
                }
            }, 150)
        }
    }, [expandedSources])
    const [activeTab, setActiveTabRaw] = useState(() => localStorage.getItem('budgeup_active_tab') || 'goals')
    const setActiveTab = (tab) => { localStorage.setItem('budgeup_active_tab', tab); setActiveTabRaw(tab) }
    const [goalsShowMore, setGoalsShowMore] = useState(false)
    const [warningMinimised, setWarningMinimisedRaw] = useState(() => localStorage.getItem('budgeup_warning_minimised') === 'true')
    const setWarningMinimised = (fn) => { setWarningMinimisedRaw(prev => { const val = typeof fn === 'function' ? fn(prev) : fn; localStorage.setItem('budgeup_warning_minimised', String(val)); return val }) }
    const [tappedSegment, setTappedSegment] = useState(null) // { label, amt, color }
    const [showAllIncome, setShowAllIncome] = useState(false)
    const [showAllExpenses, setShowAllExpenses] = useState(false)
    const goalsMoreRef = useRef(null)
    const goalsTransCardRef = useRef(null)
    const tabScrollRef = useRef({})
    const tabExpandedRef = useRef({})
    const tabGraphCoveredRef = useRef({
        goals: sessionStorage.getItem('budgeup_graph_covered_goals') === 'true',
        fixed: sessionStorage.getItem('budgeup_graph_covered_fixed') === 'true',
        variable: sessionStorage.getItem('budgeup_graph_covered_variable') === 'true',
    })
    const handleTabChange = (tab, targetScrollOverride) => {
        if (tab !== activeTab) {
            analytics.track(DASHBOARD_EVENTS.TAB_SWITCHED, { tab })
        }
        const el = scrollRef.current
        if (!el) return

        // Tapping the already-active tab — toggle between expanded and collapsed
        if (tab === activeTab) {
            const gc = graphCardRef.current
            const graphEl = graphContainerRef.current
            const heroEl = heroHeaderRef.current
            if (!gc || !graphEl) return
            const currentH = graphEl.offsetHeight
            const isExpanded = currentH > MIN_H + 10
            const t = '0.35s cubic-bezier(0.4, 0, 0.2, 1)'
            gc.style.transition = `height ${t}`
            graphEl.style.transition = `height ${t}`
            if (heroEl) heroEl.style.transition = `opacity 0.3s ease, max-height ${t}, padding ${t}`
            if (isExpanded) {
                graphEl.style.height = `${MIN_H}px`
                if (heroEl) { heroEl.style.opacity = '0'; heroEl.style.maxHeight = '0px'; heroEl.style.paddingTop = '0px'; heroEl.style.paddingBottom = '0px' }
            } else {
                graphEl.style.height = `${MAX_H}px`
                gc.style.height = ''
                if (heroEl) { heroEl.style.opacity = '1'; heroEl.style.maxHeight = '80px'; heroEl.style.paddingTop = '4px'; heroEl.style.paddingBottom = '6px' }
                if (graphCovered) {
                    setGraphCovered(false)
                    setThemeColor('#ffffff')
                    themeColorRef.current = '#ffffff'
                }
            }
            setTimeout(() => { gc.style.transition = ''; graphEl.style.transition = ''; if (heroEl) heroEl.style.transition = '' }, 400)
            return
        }

        // Switching to different tab — save scroll position
        sessionStorage.setItem('budgeup_scroll_dashboard_' + activeTab, String(el.scrollTop))

        // Check if tab is empty
        const isFixedEmpty = tab === 'fixed' &&
            INCOME_SOURCES.filter(s => isSourceVisible(s.id, formData.incomeSources)).length === 0 &&
            EXPENSE_SOURCES.filter(s => isSourceVisible(s.id, formData.expenseSources)).length === 0
        const isFlexEmpty = tab === 'variable' &&
            (formData.flexIncomeSources || []).length === 0 &&
            (formData.flexExpenseSources || []).length === 0 &&
            (formData.oneOffItems || []).filter(i => i.amount && i.name).length === 0
        const isTabEmpty = isFixedEmpty || isFlexEmpty

        // Restore saved scroll position for the target tab
        const savedScroll = parseInt(sessionStorage.getItem('budgeup_scroll_dashboard_' + tab) || '0', 10)
        const targetScroll = isTabEmpty ? 0 : savedScroll

        isTabSwitchingRef.current = true
        isAnimatingRef.current = true
        animatingStartRef.current = performance.now()
        if (snapTimerRef.current) clearTimeout(snapTimerRef.current)

        applyScrollStyles(targetScroll)

        // Disable transitions during tab switch so dropdowns don't animate
        el.style.setProperty('--tab-switching', '1')
        cachedNodesRef.current = null

        flushSync(() => {
            setActiveTab(tab)
        })

        cachedNodesRef.current = null
        el.scrollTop = targetScroll
        applyScrollStyles(targetScroll)

        requestAnimationFrame(() => {
            el.scrollTop = targetScroll
            applyScrollStyles(targetScroll)
            requestAnimationFrame(() => {
                el.scrollTop = targetScroll
                applyScrollStyles(targetScroll)
                // Re-enable transitions
                el.style.removeProperty('--tab-switching')
                isTabSwitchingRef.current = false
                isAnimatingRef.current = false
            })
        })
    }
    const [editingEvent, setEditingEvent] = useState(null)
    const [editAmount, setEditAmount] = useState('')
    const [editingOverdraft, setEditingOverdraft] = useState(null)
    const [editOverdraftAmount, setEditOverdraftAmount] = useState('')
    const [fabBalanceOpen, setFabBalanceOpen] = useState(false)
    const [fabBalanceClosing, setFabBalanceClosing] = useState(false)
    const setThemeColor = (color) => {
        const existing = document.querySelector('meta[name="theme-color"]')
        if (existing) existing.remove()
        const meta = document.createElement('meta')
        meta.name = 'theme-color'
        meta.content = color
        document.head.appendChild(meta)
    }
    const openFabBalance = () => {
        setFabBalanceOpen(true)
        setThemeColor('#ffffff')
        window.dispatchEvent(new CustomEvent('nav-fab-balance', { detail: { open: true } }))
    }
    const closeFabBalance = () => {
        setFabBalanceClosing(true)
        setThemeColor('#ffffff')
        window.dispatchEvent(new CustomEvent('nav-fab-balance', { detail: { open: false } }))
        setTimeout(() => {
            setFabBalanceOpen(false)
            setFabBalanceClosing(false)
        }, 300)
    }
    // Listen for FAB button tap to close balance popup
    useEffect(() => {
        const handler = () => closeFabBalance()
        window.addEventListener('nav-fab-close-balance', handler)
        return () => window.removeEventListener('nav-fab-close-balance', handler)
    }, [])
    const [editingBalance, setEditingBalance] = useState(false)
    const [editBalanceValue, setEditBalanceValue] = useState('')
    const balanceInputRef = useRef(null)

    useEffect(() => {
        if (editingBalance) {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                if (balanceInputRef.current) {
                    balanceInputRef.current.focus()
                    balanceInputRef.current.select()
                }
            }))
        }
    }, [editingBalance])

    const saveInlineBalance = () => {
        const newVal = parseFloat(String(editBalanceValue || '0').replace(/,/g, '')) || 0
        const today = toLocalDate(new Date())
        const lastRecorded = localStorage.getItem('budgeup_balance_last_date')
        const isUpdate = lastRecorded === today
        if (!originSetRef.current) {
            originSetRef.current = true
            updateField('balance', editBalanceValue)
        }
        if (userIdRef.current) {
            saveBalanceHistory(userIdRef.current, newVal)
        }
        analytics.track(DASHBOARD_EVENTS.BALANCE_RECORDED, {
            balance_range: getBalanceRange(newVal),
            is_first_recording: !originSetRef.current,
            is_update: isUpdate,
            entry_method: 'inline_edit',
        })
        localStorage.setItem('budgeup_balance_last_date', today)
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
        if (balanceNum !== newVal) {
            if (balanceToastTimer.current) clearTimeout(balanceToastTimer.current)
            setBalanceToast(isUpdate ? 'Updated today\u2019s balance' : 'Recorded balance for today')
            balanceToastTimer.current = setTimeout(() => setBalanceToast(null), 2500)
        }
        setEditingBalance(false)
    }
    const [showGraphFilter, setShowGraphFilter] = useState(false)
    const [graphFilterClosing, setGraphFilterClosing] = useState(false)
    const graphFilterRef = useRef(null)
    const graphFilterDropdownRef = useRef(null)
    const [graphIsZoomed, setGraphIsZoomed] = useState(false)
    const zoomOutRef = useRef(null)

    const closeGraphFilter = useCallback(() => {
        if (!showGraphFilter || graphFilterClosing) return
        setGraphFilterClosing(true)
        setTimeout(() => { setShowGraphFilter(false); setGraphFilterClosing(false) }, 180)
    }, [showGraphFilter, graphFilterClosing])

    // Close graph filter on outside click
    useEffect(() => {
        if (!showGraphFilter) return
        const handler = (e) => {
            if (graphFilterRef.current && !graphFilterRef.current.contains(e.target) &&
                graphFilterDropdownRef.current && !graphFilterDropdownRef.current.contains(e.target)) {
                closeGraphFilter()
            }
        }
        document.addEventListener('pointerdown', handler)
        return () => document.removeEventListener('pointerdown', handler)
    }, [showGraphFilter, closeGraphFilter])
    const [balanceHistory, setBalanceHistory] = useState([])
    const originSetRef = useRef(false)
    const [dbLoaded, setDbLoaded] = useState(false)
    const saveTimerRef = useRef(null)
    const userIdRef = useRef(null)
    const [userJoinDate, setUserJoinDate] = useState(null)

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
                    if (user.email) setUserEmail(user.email)
                    if (user.created_at) {
                        const d = new Date(user.created_at)
                        setUserJoinDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
                    }

                    const result = await fetchUserData(user.id)

                    // Sync graph start from database, respecting the user's chosen mode
                    const mode = localStorage.getItem('budgeup_graph_start_mode')
                    const joinDateStr = user.created_at
                        ? (() => { const d = new Date(user.created_at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
                        : null
                    if (mode === 'first_term') {
                        // Will be handled by the termDates useEffect below
                    } else if (mode === 'custom' && localStorage.getItem('budgeup_graph_start')) {
                        // Custom mode — keep whatever the user set locally
                    } else if (mode === 'joined' && joinDateStr) {
                        // Always use actual join date
                        setGraphStart(joinDateStr)
                        refreshAY()
                        setGraphKey(k => k + 1)
                    } else if (result.profile?.graph_start) {
                        setGraphStart(result.profile.graph_start)
                        if (!mode) {
                            localStorage.setItem('budgeup_graph_start_mode', 'joined')
                        }
                        refreshAY()
                        setGraphKey(k => k + 1)
                    } else if (joinDateStr) {
                        setGraphStart(joinDateStr)
                        if (!mode) {
                            localStorage.setItem('budgeup_graph_start_mode', 'joined')
                        }
                        refreshAY()
                        setGraphKey(k => k + 1)
                    }
                    if (cancelled) return
                    if (result.formData) {
                        // Merge Supabase with localStorage to preserve unsaved local changes
                        let localFD = {}
                        try { const ls = localStorage.getItem(STORAGE_KEY); localFD = (ls ? JSON.parse(ls) : {}).formData || {} } catch {}
                        const merged = migrateOtherFields({ ...INITIAL_FORM_DATA, ...result.formData })
                        // Preserve local sources not yet synced to Supabase
                        for (const k of ['incomeSources', 'expenseSources', 'flexIncomeSources', 'flexExpenseSources']) {
                            if (localFD[k]?.length) merged[k] = [...new Set([...(merged[k] || []), ...localFD[k]])]
                        }
                        if (localFD.flexSourceData) merged.flexSourceData = { ...(merged.flexSourceData || {}), ...localFD.flexSourceData }
                        if (localFD.otherIncomes?.length) merged.otherIncomes = [...new Set([...(merged.otherIncomes || []).map(i => JSON.stringify(i)), ...localFD.otherIncomes.map(i => JSON.stringify(i))])].map(s => JSON.parse(s))
                        if (localFD.otherExpenses?.length) merged.otherExpenses = [...new Set([...(merged.otherExpenses || []).map(i => JSON.stringify(i)), ...localFD.otherExpenses.map(i => JSON.stringify(i))])].map(s => JSON.parse(s))
                        // Prefer localStorage term dates (Settings saves there immediately, Supabase may lag)
                        try {
                            const saved = localStorage.getItem(STORAGE_KEY)
                            const parsed = saved ? JSON.parse(saved) : {}
                            if (parsed.formData?.termDates?.terms?.length) {
                                merged.termDates = parsed.formData.termDates
                            }
                            // Re-run break name merge after localStorage override
                            if (merged.university && hasCustomTermDates(merged.university) && merged.termDates?.terms?.length) {
                                const custom = getTermDatesForUniversity(merged.university)
                                if (custom?.terms?.length) {
                                    for (let ti = 0; ti < merged.termDates.terms.length && ti < custom.terms.length; ti++) {
                                        const breaks = merged.termDates.terms[ti].breaks
                                        const customBreaks = custom.terms[ti].breaks
                                        if (!breaks || !customBreaks) continue
                                        for (let bi = 0; bi < breaks.length; bi++) {
                                            const match = customBreaks.find(cb => cb.start === breaks[bi].start && cb.end === breaks[bi].end)
                                            if (match?.name && !breaks[bi].name) {
                                                breaks[bi].name = match.name
                                            }
                                        }
                                    }
                                }
                            }
                            localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, formData: merged }))
                        } catch { /* ignore */ }
                        setFormData(merged)
                        // Persist merged data (break names etc.) back to Supabase
                        saveUserFinances(userIdRef.current, { ...merged, onboardingCompleted: true }).catch(() => {})
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

    // Update graph start to 1st of first term's start month (only in term-start mode)
    useEffect(() => {
        const mode = localStorage.getItem('budgeup_graph_start_mode')
        if (mode && mode !== 'first_term') return
        const terms = formData.termDates?.terms
        if (!terms?.length) return
        const earliest = [...terms].sort((a, b) => a.start.localeCompare(b.start))[0]
        if (getGraphStart() !== earliest.start) {
            setGraphStart(earliest.start)
            refreshAY()
        }
    }, [formData.termDates])

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
                        balance: formData.balance,
                    }),
                    saveTermDates(userId, formData.termDates),
                ])
            } catch (err) {
                console.error('Failed to save to Supabase:', err)
            }
        }, 2000) // 2s debounce
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current)
                // Flush save immediately on cleanup
                const userId = userIdRef.current
                if (userId) {
                    saveCashflowForecast(userId, formData).catch(() => {})
                    saveUserFinances(userId, {
                        university: formData.university,
                        overdraft: formData.overdraft,
                        savings: formData.savings,
                        weeklySpend: formData.weeklySpend,
                        weeklySpendNonTerm: formData.weeklySpendNonTerm,
                        weeklySpendVariesByTerm: formData.weeklySpendVariesByTerm,
                        balance: formData.balance,
                    }).catch(() => {})
                }
                saveTimerRef.current = null
            }
        }
    }, [formData, dbLoaded])

    // Shrink graph on scroll: 200 → 108 (direct DOM for smooth perf)
    const scrollRef = useRef(null)
    const graphContainerRef = useRef(null)
    const contentWrapRef = useRef(null)
    const stickyHeaderRef = useRef(null)
    const themeColorRef = useRef('#ffffff')
    const [graphCovered, setGraphCoveredRaw] = useState(() => {
        const tab = sessionStorage.getItem('budgeup_active_tab') || 'goals'
        return sessionStorage.getItem('budgeup_graph_covered_' + tab) === 'true'
    })
    const setGraphCovered = (v) => {
        const tab = sessionStorage.getItem('budgeup_active_tab') || 'goals'
        sessionStorage.setItem('budgeup_graph_covered_' + tab, String(v))
        setGraphCoveredRaw(v)
    }
    const graphCardRef = useRef(null)
    const heroHeaderRef = useRef(null)
    const rafRef = useRef(null)
    const MAX_H = 220
    const MIN_H = 115
    const SHRINK_DIST = MAX_H - MIN_H
    const HIDE_DIST = MIN_H // additional scroll to fully hide graph

    // Graph height — always MAX_H. Drag handler controls height via refs only.
    const graphHeight = MAX_H
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

    const applyScrollStyles = useCallback(() => { }, [])

    // Animate graph to collapsed state (midway)
    const collapseGraph = useCallback(() => {
        const gc = graphCardRef.current
        const graphEl = graphContainerRef.current
        const heroEl = heroHeaderRef.current
        if (!gc || !graphEl) return
        if (graphEl.offsetHeight <= MIN_H + 5) return // already collapsed
        const t = '0.35s cubic-bezier(0.4, 0, 0.2, 1)'
        gc.style.transition = `height ${t}`
        graphEl.style.transition = `height ${t}`
        if (heroEl) heroEl.style.transition = `opacity 0.3s ease, max-height ${t}, padding ${t}`
        graphEl.style.height = `${MIN_H}px`
        gc.style.height = ''
        if (heroEl) { heroEl.style.opacity = '0'; heroEl.style.maxHeight = '0px'; heroEl.style.paddingTop = '0px'; heroEl.style.paddingBottom = '0px' }
        setTimeout(() => {
            gc.style.transition = ''
            graphEl.style.transition = ''
            if (heroEl) heroEl.style.transition = ''
        }, 400)
    }, [])

    // Drag on tabs/handle: Phase 1 = shrink graph, Phase 2 = cover collapsed graph
    const onHandlePointerDown = useCallback((e) => {
        const gc = graphCardRef.current
        const graphEl = graphContainerRef.current
        const heroEl = heroHeaderRef.current
        if (!gc) return

        const startY = e.clientY
        let moved = false
        let rafId = null
        let lastPos = 0
        const easeLocal = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t

        // Work out where we're starting from
        const currentGraphH = graphEl ? graphEl.offsetHeight : MAX_H
        let startPos
        let maxDragPos // limit how far this gesture can go
        if (graphCovered) {
            // Covered — drag down stops at collapsed
            startPos = MAX_H
            maxDragPos = MAX_H
        } else if (currentGraphH <= MIN_H + 10) {
            // Already collapsed — this gesture covers the graph
            startPos = SHRINK_DIST
            maxDragPos = MAX_H
        } else {
            // Expanded — this gesture only collapses, stops at SHRINK_DIST
            startPos = 0
            maxDragPos = SHRINK_DIST
        }

        const applyPos = (pos) => {
            const p = Math.max(0, Math.min(MAX_H, pos))

            if (p <= SHRINK_DIST) {
                // Phase 1: shrink graph, no clipping
                const t = p / SHRINK_DIST
                const ct = easeLocal(t)
                if (graphEl) graphEl.style.height = `${MAX_H - ct * SHRINK_DIST}px`
                gc.style.height = ''
                gc.style.marginTop = '0px'
                if (heroEl) {
                    const f = easeLocal(Math.min(1, t * 2.5))
                    heroEl.style.opacity = `${1 - f}`
                    heroEl.style.maxHeight = `${(1 - f) * 80}px`
                    heroEl.style.paddingTop = `${(1 - f) * 4}px`
                    heroEl.style.paddingBottom = `${(1 - f) * 6}px`
                }
            } else {
                // Phase 2: graph at MIN_H, shrink card height to hide it
                if (graphEl) graphEl.style.height = `${MIN_H}px`
                const cover = (p - SHRINK_DIST) / MIN_H
                const cardH = MIN_H * (1 - cover)
                gc.style.height = `${Math.max(0, cardH)}px`
                gc.style.marginTop = '0px'
                if (heroEl) {
                    heroEl.style.opacity = '0'
                    heroEl.style.maxHeight = '0px'
                    heroEl.style.paddingTop = '0px'
                    heroEl.style.paddingBottom = '0px'
                }
            }
        }

        const onMove = (ev) => {
            const dy = ev.clientY - startY
            if (!moved && Math.abs(dy) < 8) return
            if (!moved && dy > 0 && startPos <= 0) {
                // Already expanded, pulling down — abort
                window.removeEventListener('pointermove', onMove)
                window.removeEventListener('pointerup', onUp)
                return
            }
            if (!moved) {
                // First move — remove transitions for direct manipulation
                gc.style.transition = 'none'
                if (graphEl) graphEl.style.transition = 'none'
                if (heroEl) heroEl.style.transition = 'none'
            }
            moved = true
            lastPos = Math.max(0, Math.min(maxDragPos, startPos - dy))
            if (rafId) cancelAnimationFrame(rafId)
            rafId = requestAnimationFrame(() => applyPos(lastPos))
        }

        const snapTo = (state) => {
            const t = '0.35s cubic-bezier(0.4, 0, 0.2, 1)'
            gc.style.transition = `height ${t}, margin-top ${t}`
            if (graphEl) graphEl.style.transition = `height ${t}`
            if (heroEl) heroEl.style.transition = `opacity 0.3s ease, max-height ${t}, padding ${t}`

            if (state === 'expanded') {
                if (graphEl) graphEl.style.height = `${MAX_H}px`
                gc.style.height = ''
                gc.style.marginTop = '0px'
                if (heroEl) { heroEl.style.opacity = '1'; heroEl.style.maxHeight = '80px'; heroEl.style.paddingTop = '4px'; heroEl.style.paddingBottom = '6px' }
            } else if (state === 'collapsed') {
                if (graphEl) graphEl.style.height = `${MIN_H}px`
                gc.style.height = ''
                gc.style.marginTop = '0px'
                if (heroEl) { heroEl.style.opacity = '0'; heroEl.style.maxHeight = '0px'; heroEl.style.paddingTop = '0px'; heroEl.style.paddingBottom = '0px' }
            } else {
                if (graphEl) graphEl.style.height = `${MIN_H}px`
                gc.style.height = '0px'
                gc.style.marginTop = '0px'
                if (heroEl) { heroEl.style.opacity = '0'; heroEl.style.maxHeight = '0px'; heroEl.style.paddingTop = '0px'; heroEl.style.paddingBottom = '0px' }
            }

            const isCovered = state === 'covered'

            // When expanding, lock scroll and reset to top so graph stays visible

            setTimeout(() => {
                gc.style.transition = ''
                if (graphEl) graphEl.style.transition = ''
                if (heroEl) heroEl.style.transition = ''
                // Always restore scroll
                const el = scrollRef.current
                if (el) {
                    el.style.overflow = ''
                    el.style.overflowY = 'auto'
                }
                isAnimatingRef.current = false
            }, 400)

            setGraphCovered(isCovered)
            setThemeColor('#ffffff')
            themeColorRef.current = '#ffffff'
        }

        const onUp = () => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
            if (rafId) cancelAnimationFrame(rafId)

            if (!moved) {
                // Tap — do nothing, let tab onClick handle it
                return
            }

            // Snap to nearest state
            const p = Math.max(0, Math.min(MAX_H, lastPos))
            if (graphCovered) {
                if (p < SHRINK_DIST + MIN_H * 0.75) snapTo('collapsed')
                else snapTo('covered')
            } else if (startPos === 0) {
                if (p > SHRINK_DIST * 0.2) snapTo('collapsed')
                else snapTo('expanded')
            } else {
                if (p > SHRINK_DIST + MIN_H * 0.2) snapTo('covered')
                else if (p < SHRINK_DIST * 0.8) snapTo('expanded')
                else snapTo('collapsed')
            }
        }

        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
    }, [graphCovered])

    const animateScroll = useCallback((el, target, durationOverride, onComplete) => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
        const start = el.scrollTop
        const diff = target - start
        const dist = Math.abs(diff)
        if (dist < 1) { isAnimatingRef.current = false; onComplete?.(); return }
        // Duration proportional to distance: 250-450ms
        const duration = durationOverride ?? Math.max(250, Math.min(450, dist * 4))
        isAnimatingRef.current = true
        animatingStartRef.current = performance.now()
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
    const animatingStartRef = useRef(0)

    const handleScroll = useCallback(() => {
        if (isAnimatingRef.current) {
            // Safety: if stuck animating for over 1s, force unlock
            if (performance.now() - animatingStartRef.current > 1000) {
                isAnimatingRef.current = false
                isTabSwitchingRef.current = false
            } else {
                return
            }
        }
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

    // Apply saved scroll position + graph state immediately on mount to prevent flash
    useLayoutEffect(() => {
        const saved = sessionStorage.getItem('budgeup_scroll_dashboard_' + activeTab)
        if (saved && scrollRef.current) {
            const pos = parseInt(saved, 10)
            if (pos > 0) {
                scrollRef.current.scrollTop = pos
                applyScrollStyles(pos)
            }
        }
        // Restore graph visual state to match graphCovered
        const gc = graphCardRef.current
        const graphEl = graphContainerRef.current
        const heroEl = heroHeaderRef.current
        if (graphCovered) {
            if (graphEl) graphEl.style.height = `${MIN_H}px`
            if (gc) { gc.style.height = '0px'; gc.style.marginTop = '0px' }
            if (heroEl) { heroEl.style.opacity = '0'; heroEl.style.maxHeight = '0px'; heroEl.style.paddingTop = '0px'; heroEl.style.paddingBottom = '0px' }
        } else {
            const pos = parseInt(saved || '0', 10)
            if (pos > 0) {
                if (graphEl) graphEl.style.height = `${MIN_H}px`
                if (heroEl) { heroEl.style.opacity = '0'; heroEl.style.maxHeight = '0px'; heroEl.style.paddingTop = '0px'; heroEl.style.paddingBottom = '0px' }
            }
        }
    }, [])

    // Re-apply scroll position + graph state after data loads (content may have changed)
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
        const gc = graphCardRef.current
        const graphEl = graphContainerRef.current
        const heroEl = heroHeaderRef.current
        if (graphCovered) {
            if (graphEl) graphEl.style.height = `${MIN_H}px`
            if (gc) { gc.style.height = '0px'; gc.style.marginTop = '0px' }
            if (heroEl) { heroEl.style.opacity = '0'; heroEl.style.maxHeight = '0px'; heroEl.style.paddingTop = '0px'; heroEl.style.paddingBottom = '0px' }
        } else {
            const pos = parseInt(saved || '0', 10)
            if (pos > 0) {
                if (graphEl) graphEl.style.height = `${MIN_H}px`
                if (heroEl) { heroEl.style.opacity = '0'; heroEl.style.maxHeight = '0px'; heroEl.style.paddingTop = '0px'; heroEl.style.paddingBottom = '0px' }
            }
        }
    }, [dbLoaded])





    // Pin scroll when keyboard dismisses (any input blur)
    useEffect(() => {
        const el = scrollRef.current
        if (!el) return
        const onFocusOut = (e) => {
            if (e.relatedTarget) return
            const scrollBefore = el.scrollTop
            const savedOverflow = el.style.overflowY
            el.style.overflowY = 'hidden'
            el.scrollTop = scrollBefore
            const start = performance.now()
            const pin = () => {
                el.scrollTop = scrollBefore
                if (performance.now() - start < 500) {
                    requestAnimationFrame(pin)
                } else {
                    el.style.overflowY = savedOverflow || 'auto'
                }
            }
            requestAnimationFrame(pin)
        }
        el.addEventListener('focusout', onFocusOut)
        return () => el.removeEventListener('focusout', onFocusOut)
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

    // Handle FAB actions from BottomNav
    useEffect(() => {
        const scrollToSection = (isExpense) => {
            const el = scrollRef.current
            if (!el) return
            setTimeout(() => {
                const selector = isExpense ? '[data-section="expenses"]' : '[data-section="income"]'
                const section = el.querySelector(selector)
                if (section) {
                    const stickyHeader = el.querySelector('[data-sticky-header]')
                    const headerH = stickyHeader ? stickyHeader.offsetHeight : 0
                    const target = section.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - headerH
                    animateScroll(el, Math.max(0, target + 200), 350)
                } else {
                    animateScroll(el, 0, 350)
                }
            }, 50)
        }

        const openAddPicker = (type) => {
            if (activeTab !== 'fixed') handleTabChange('fixed')
            addPickerScrollPos.current = scrollRef.current?.scrollTop ?? null
            setAddingSourceType(type)
        }

        const handler = (e) => {
            const { action } = e.detail || {}
            if (!action) return

            if (action === 'update-balance') {
                openFabBalance()
                return
            }

            if (action.startsWith('add-source:')) {
                const [, sourceId, type] = action.split(':')
                const isExp = type === 'expense'
                const el = scrollRef.current
                const savedScroll = el ? el.scrollTop : 0
                // Step 1: switch to regular tab if needed, collapse graph
                if (activeTab !== 'fixed') setActiveTab('fixed')
                collapseGraph()
                // Lock scroll during reflow
                if (el) {
                    isAnimatingRef.current = true
                    el.scrollTop = savedScroll
                    applyScrollStyles(savedScroll)
                }
                // Step 2: add source — use addSource for other_income/other_expense (creates instances)
                if (sourceId === 'other_income' || sourceId === 'other_expense') {
                    addSource(sourceId, isExp)
                } else {
                    if (isExp) {
                        const sources = formData.expenseSources || []
                        if (!sources.includes(sourceId)) updateField('expenseSources', [...sources, sourceId])
                    } else {
                        const sources = formData.incomeSources || []
                        if (!sources.includes(sourceId)) updateField('incomeSources', [...sources, sourceId])
                    }
                    setExpandedSources(prev => new Set(prev).add(sourceId))
                }
                // Wait for render + collapse animation, then scroll to row
                setTimeout(() => {
                    if (!el) return
                    const stickyHeader = el.querySelector('[data-sticky-header]')
                    const headerH = stickyHeader ? stickyHeader.offsetHeight : 0
                    const sectionAttr = isExp ? 'expenses' : 'income'
                    const sectionSources = isExp ? formData.expenseSources : formData.incomeSources
                    const isFirstInSection = (sectionSources || []).filter(s => s !== sourceId).length === 0
                    const scrollTarget = isFirstInSection
                        ? el.querySelector(`[data-section="${sectionAttr}"]`)
                        : el.querySelector(`[data-source-id="${sourceId}"]`)
                    if (scrollTarget) {
                        const target = scrollTarget.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - headerH - 8
                        el.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
                    }
                }, 400)
                return
            }

            if (action.startsWith('add-flex:')) {
                const [, sourceId, type] = action.split(':')
                const isExp = type === 'expense'
                if (activeTab !== 'variable') setActiveTab('variable')
                collapseGraph()
                const flexSrc = isExp ? FLEX_EXPENSE_SOURCES : FLEX_INCOME_SOURCES
                const srcDef = flexSrc.find(s => s.id === sourceId)
                setFormData(prev => {
                    const key = isExp ? 'flexExpenseSources' : 'flexIncomeSources'
                    const existing = prev[key] || []
                    if (existing.includes(sourceId)) return prev
                    return {
                        ...prev,
                        [key]: [...existing, sourceId],
                        flexSourceData: { ...prev.flexSourceData, [sourceId]: { frequency: srcDef?.defaultFreq || 'monthly' } },
                    }
                })
                setExpandedSources(prev => new Set(prev).add(sourceId))
                // Scroll to the new source after render
                setTimeout(() => {
                    const el = scrollRef.current
                    if (!el) return
                    const row = el.querySelector(`[data-source-id="${sourceId}"]`)
                    if (row) {
                        const stickyHeader = el.querySelector('[data-sticky-header]')
                        const headerH = stickyHeader ? stickyHeader.offsetHeight : 0
                        const target = row.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - headerH - 8
                        el.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
                    }
                }, 300)
                return
            }

            if (action === 'add-regular-income') return
            if (action === 'add-regular-expense') return

            if (action === 'add-oneoff-income' || action === 'add-income' ||
                action === 'add-oneoff-expense' || action === 'add-expense') {
                handleTabChange('variable')
            }
        }

        window.addEventListener('nav-fab-action', handler)
        window.dispatchEvent(new CustomEvent('dashboard-ready'))
        return () => window.removeEventListener('nav-fab-action', handler)
    }, [animateScroll, handleTabChange, activeTab])

    const freqView = 'Yearly'

    // Persist formData changes back to localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY)
            const parsed = saved ? JSON.parse(saved) : {}
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, formData }))
        } catch { /* ignore */ }
        // Expose active sources so BottomNav can filter its carousel
        window.__budgeup_active_sources = {
            income: formData.incomeSources || [],
            expense: formData.expenseSources || [],
            flexIncome: formData.flexIncomeSources || [],
            flexExpense: formData.flexExpenseSources || [],
        }
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
            panelId: 'otherIncome', isOtherIncome: true, onboarding: true,
        })),
    ]
    const EXPENSE_SOURCES = [
        ...FIXED_EXPENSE_SOURCES,
        ...otherExpenses.map(inst => ({
            id: inst.id, label: inst.label || 'Other Regular Expense', icon: iconOtherExpense,
            panelId: 'otherExpense', isOtherExpense: true, onboarding: true,
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

    // Hero metric: actual balance vs predicted (green line) for today
    const heroMetric = (() => {
        const { diff, isAhead, isOnTrack } = goalsData
        const sym = getCurrencySymbol()
        const pct = projBal !== 0 ? Math.round(Math.abs(diff) / Math.abs(projBal) * 100) : 0
        if (isOnTrack) return { color: '#147b75', value: 'On track', pct: 0, label: 'vs projection' }
        const absDiff = Math.abs(diff)
        const formatted = `${sym}${absDiff.toLocaleString()}`
        if (isAhead) return { color: '#147b75', value: `+${formatted}`, pct: `+${pct}%`, label: 'above projection' }
        return { color: '#e06470', value: `\u2212${formatted}`, pct: `\u2212${pct}%`, label: 'below projection' }
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
        const isOtherIncome = otherIncomes.some(i => i.id === sourceId)
        const isOtherExpense = otherExpenses.some(i => i.id === sourceId)

        const remainingSources = isExpense
            ? (formData.expenseSources || []).filter(s => s !== sourceId)
            : (formData.incomeSources || []).filter(s => s !== sourceId)
        const otherSectionSources = isExpense
            ? (formData.incomeSources || [])
            : (formData.expenseSources || [])
        const sectionWillBeEmpty = remainingSources.length === 0
        const willBeEmpty = sectionWillBeEmpty && otherSectionSources.length === 0
        const el = scrollRef.current
        const sectionAttr = isExpense ? 'expenses' : 'income'

        // If this section will be empty, start collapse animation
        if (sectionWillBeEmpty) {
            setCollapsingSections(prev => new Set(prev).add(sectionAttr))
        }

        // If all sources gone — add spacer and start graph expand immediately (alongside row swipe)
        if (willBeEmpty && el && el.scrollTop > 0) {
            const spacer = document.createElement('div')
            spacer.style.height = (el.scrollTop + 200) + 'px'
            spacer.style.flexShrink = '0'
            el.appendChild(spacer)
            isAnimatingRef.current = true
            animateScroll(el, 0, 600, () => {
                spacer.remove()
            })
        }

        // Delay state removal so the row collapse animation plays out
        const removeFromState = () => {
            setHiddenSources(prev => {
                if (!prev.has(sourceId)) return prev
                const next = new Set(prev)
                next.delete(sourceId)
                localStorage.setItem('budgeup_hidden_sources', JSON.stringify([...next]))
                return next
            })
            if (isExpense) {
                updateField('expenseSources', remainingSources)
            } else {
                updateField('incomeSources', remainingSources)
            }
            if (isOtherIncome) {
                setFormData(prev => ({ ...prev, otherIncomes: (prev.otherIncomes || []).filter(i => i.id !== sourceId) }))
            } else if (isOtherExpense) {
                setFormData(prev => ({ ...prev, otherExpenses: (prev.otherExpenses || []).filter(i => i.id !== sourceId) }))
            } else {
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
        }

        // Wait for row swipe animation before removing from state
        setTimeout(() => {
            removeFromState()
            // If section will be empty, remove from DOM after collapse animation
            if (sectionWillBeEmpty) {
                setTimeout(() => {
                    setCollapsingSections(prev => {
                        const next = new Set(prev)
                        next.delete(sectionAttr)
                        return next
                    })
                }, 400)
            }
        }, 500)
    }

    const [collapsingSections, setCollapsingSections] = useState(new Set()) // 'income' | 'expenses'

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
            height: '100%', background: '#fff', overflowX: 'hidden',
            fontFamily: 'Nunito, sans-serif',
        }}>
            {/* Scrollable content */}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                style={{
                    flex: 1,
                    overflowY: showInitialBalancePopup ? 'hidden' : 'auto',
                    overflowX: 'hidden',
                    WebkitOverflowScrolling: 'touch',
                    overscrollBehavior: 'none',
                    paddingBottom: 'calc(120px + env(safe-area-inset-bottom))',
                    background: '#f0f4f4',
                }}
            >
                {/* Graph + tabs — sticky, shrinks on scroll */}
                <div data-sticky-header ref={stickyHeaderRef} style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 0 }}>

                    {/* Graph area — clips when covered, blocks scroll */}
                    <div ref={graphCardRef} onTouchMove={e => e.preventDefault()} style={{
                        margin: '0 8px',
                        overflow: 'hidden',
                        touchAction: 'none',
                    }}>

                        {/* Balance entry banner — shown when no balance in user_profiles */}
                        {showInitialBalancePopup && (
                            <div style={{
                                margin: '8px 12px 8px', padding: balanceBannerDismissing ? 0 : '14px 16px 16px',
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

                        {/* Balance hero header */}
                        <div ref={heroHeaderRef} style={{
                            padding: '4px 18px 6px',
                            opacity: showInitialBalancePopup ? 0.35 : 1,
                            pointerEvents: showInitialBalancePopup ? 'none' : 'auto',
                        }}>
                            {/* Row 1: Balance + filter button */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                    <p style={{
                                        margin: 0, fontSize: 30, fontWeight: 800,
                                        fontFamily: 'Nunito, sans-serif',
                                        color: balanceNum < 0 ? '#e06470' : '#1a1a1a',
                                        lineHeight: 1,
                                    }}>
                                        {balanceNum < 0 ? '\u2212' : ''}{getCurrencySymbol()}{Math.abs(balanceNum).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                    <p style={{
                                        margin: 0, fontSize: 10, fontWeight: 600,
                                        fontFamily: 'Nunito, sans-serif',
                                        color: '#b0b0b0',
                                    }}>
                                        {(() => {
                                            if (!balanceHistory.length) return ''
                                            const recordedDate = balanceHistory[0].recorded_date
                                            const today = toLocalDate(new Date())
                                            if (recordedDate === today) return 'today'
                                            const days = daysBetween(recordedDate, today)
                                            if (days === 1) return 'yesterday'
                                            return `${days}d ago`
                                        })()}
                                    </p>
                                </div>
                                {/* Zoom out + Filter buttons */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {/* Zoom out button */}
                                    <button
                                        onClick={() => zoomOutRef.current?.()}
                                        style={{
                                            background: '#f0f4f4',
                                            border: 'none',
                                            borderRadius: '50%', cursor: 'pointer',
                                            width: 34, height: 34,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            opacity: graphIsZoomed ? 1 : 0,
                                            pointerEvents: graphIsZoomed ? 'auto' : 'none',
                                            transform: graphIsZoomed ? 'scale(1)' : 'scale(0.85)',
                                            transition: 'all 0.25s ease',
                                        }}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="11" cy="11" r="8" />
                                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                            <line x1="8" y1="11" x2="14" y2="11" />
                                        </svg>
                                    </button>
                                    {/* Filter button */}
                                    <div ref={graphFilterRef} style={{ position: 'relative' }}>
                                        <button
                                            onClick={() => showGraphFilter ? closeGraphFilter() : setShowGraphFilter(true)}
                                            style={{
                                                background: showGraphFilter ? 'rgba(236,140,23,0.12)' : '#f5f5f5',
                                                border: 'none',
                                                borderRadius: '50%', cursor: 'pointer',
                                                width: 34, height: 34,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                transition: 'all 0.18s ease',
                                                position: 'relative',
                                            }}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={showGraphFilter ? '#EC8C17' : '#999'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="4" y1="6" x2="20" y2="6" />
                                                <line x1="8" y1="12" x2="16" y2="12" />
                                                <line x1="11" y1="18" x2="13" y2="18" />
                                            </svg>
                                            {(showIncome || showExpenses || showBalanceHistory) && (
                                                <div style={{
                                                    position: 'absolute', top: 0, right: 0,
                                                    width: 7, height: 7, borderRadius: '50%',
                                                    background: '#EC8C17', border: '1.5px solid #fff',
                                                }} />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>

                        </div>

                        <div style={{ position: 'relative', opacity: showInitialBalancePopup ? 0.35 : 1, pointerEvents: showInitialBalancePopup ? 'none' : 'auto' }}>
                            {!dbLoaded && (
                                <div style={{
                                    position: 'absolute', inset: 0, zIndex: 20,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'rgba(255,255,255,0.7)',
                                    borderRadius: 8,
                                }}>
                                    <div style={{
                                        width: 24, height: 24, borderRadius: '50%',
                                        border: '2.5px solid #e8e8e8', borderTopColor: '#147b75',
                                        animation: 'spin 0.7s linear infinite',
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
                                    ...(!showFlexible ? [...(formData.flexIncomeSources || []), ...(formData.flexExpenseSources || [])] : []),
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
                                onZeroDate={setGraphZeroDate}
                                onOverdraftBreachDate={setGraphOverdraftDate}
                                showHolidays={showHolidays}
                                onZoomChange={setGraphIsZoomed}
                                zoomOutRef={zoomOutRef}
                                footer={<div ref={footerRef} style={{ height: 0 }} />}
                            />
                        </div>
                    </div>{/* end graph card */}

                    {/* Handle + tabs — inside sticky header so they stick */}
                    <div style={{ background: '#f0f4f4', borderRadius: '20px 20px 0 0', padding: '0 10px 0', marginBottom: -1 }}>
                        {/* Drag handle line — drag to collapse/cover graph */}
                        <div
                            onPointerDown={onHandlePointerDown}
                            style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px', cursor: 'pointer', touchAction: 'none' }}
                        >
                            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#d0d0d0' }} />
                        </div>
                        <div ref={cardDetailsRef} onPointerDown={onHandlePointerDown} style={{
                            padding: '0 6px 6px',
                            zIndex: 12,
                            background: '#f0f4f4',
                            touchAction: 'none',
                            opacity: showInitialBalancePopup ? 0.35 : 1,
                            pointerEvents: showInitialBalancePopup ? 'none' : 'auto',
                        }}>
                            {(() => {
                                const tabs = [
                                    { key: 'fixed', label: 'Regular', Icon: PiCalendarBlank, ActiveIcon: PiCalendarBlankFill },
                                    { key: 'goals', label: 'Insights', Icon: PiLightbulb, ActiveIcon: PiLightbulbFill },
                                    { key: 'variable', label: 'Flexible', Icon: PiShuffle, ActiveIcon: PiShuffleBold },
                                ]
                                const activeIndex = tabs.findIndex(t => t.key === activeTab)
                                return (
                                    <div style={{
                                        display: 'flex', width: '100%', position: 'relative',
                                        background: '#fff', borderRadius: 50, padding: 3,
                                    }}>
                                        <div style={{
                                            position: 'absolute', top: 3, bottom: 3,
                                            left: `calc(${(activeIndex / 3) * 100}% + 3px)`,
                                            width: `calc(${100 / 3}% - 4px)`,
                                            background: '#147b75', borderRadius: 50,
                                            transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        }} />
                                        {tabs.map(tab => {
                                            const isActive = activeTab === tab.key
                                            return (
                                                <div
                                                    key={tab.key}
                                                    onClick={() => handleTabChange(tab.key)}
                                                    style={{
                                                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        padding: '8px 0', borderRadius: 50, cursor: 'pointer',
                                                        position: 'relative', zIndex: 1,
                                                        color: isActive ? '#fff' : '#1a1a1a',
                                                        transition: isActive ? 'color 0.12s ease 0.12s' : 'color 0.15s ease 0.15s',
                                                    }}
                                                >
                                                    <tab.Icon size={15} style={{ flexShrink: 0 }} />
                                                    <span style={{
                                                        fontSize: 14, fontWeight: 700,
                                                        fontFamily: 'Nunito, sans-serif', marginLeft: 5,
                                                    }}>{tab.label}</span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )
                            })()}
                        </div>
                    </div>{/* end handle area */}
                </div>{/* end sticky header */}

                {/* Content below */}
                <div ref={contentWrapRef} style={{
                    minHeight: '60vh',
                    background: '#f0f4f4',
                    opacity: showInitialBalancePopup ? 0.35 : 1,
                    pointerEvents: showInitialBalancePopup ? 'none' : 'auto',
                }}>
                    <div style={{
                        background: '#f0f4f4',
                        padding: '8px 16px 16px',
                        minHeight: '50vh',
                    }}>

                        {activeTab === 'fixed' && (<div style={{ paddingBottom: 40 }}>
                            {/* Income vs Spend summary card */}
                            {(() => {
                                const inc = Math.round(yearlyIncome * freqMultiplier[freqView])
                                const exp = Math.round(yearlyExpense * freqMultiplier[freqView])
                                const total = inc + exp
                                const spendPct = total > 0 ? Math.round((exp / total) * 100) : 50
                                return (
                                    <div style={{ padding: '16px 16px', background: '#fff', borderRadius: 14, marginBottom: 10 }}>
                                        {/* Title row */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                            <p style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a', margin: 0 }}>
                                                Regular Spending Overview
                                            </p>
                                            <span style={{
                                                fontSize: 15, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
                                                color: (inc - exp) >= 0 ? '#147b75' : '#e06470',
                                            }}>
                                                {(inc - exp) >= 0 ? '+' : '\u2212'}{getCurrencySymbol()}{Math.abs(inc - exp).toLocaleString()}{freqSuffix[freqView]}
                                            </span>
                                        </div>
                                        {/* Progress bar — red (spend) to green (income) */}
                                        <div style={{ height: 16, borderRadius: 8, overflow: 'hidden', background: '#e06470', marginBottom: 10 }}>
                                            <div style={{
                                                height: '100%',
                                                width: `${100 - spendPct}%`,
                                                background: '#147b75',
                                                transition: 'width 0.4s ease',
                                            }} />
                                        </div>
                                        {/* Labels row */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#147b75' }}>
                                                Income {getCurrencySymbol()}{inc.toLocaleString()}{freqSuffix[freqView]}
                                            </span>
                                            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#e06470' }}>
                                                Spend {getCurrencySymbol()}{exp.toLocaleString()}{freqSuffix[freqView]}
                                            </span>
                                        </div>
                                    </div>
                                )
                            })()}

                            {/* Empty state when no regular sources */}
                            {INCOME_SOURCES.filter(s => isSourceVisible(s.id, formData.incomeSources)).length === 0 &&
                                EXPENSE_SOURCES.filter(s => isSourceVisible(s.id, formData.expenseSources)).length === 0 && (
                                    <div style={{
                                        textAlign: 'center',
                                        padding: '24px 40px',
                                    }}>
                                        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#999' }}>
                                            No regular income or expenses yet
                                        </p>
                                        <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#bbb' }}>
                                            Tap + to add
                                        </p>
                                    </div>
                                )}

                            {/* Regular Income Section */}
                            {(INCOME_SOURCES.filter(source => isSourceVisible(source.id, formData.incomeSources)).length > 0 || addingSourceType === 'income' || collapsingSections.has('income')) && (
                                <div data-section="income" style={{
                                    margin: collapsingSections.has('income') ? '0' : '0 0 10px',
                                    background: '#fff', borderRadius: 14,
                                    padding: collapsingSections.has('income') ? 0 : '0 0 8px',
                                    overflow: 'hidden',
                                    maxHeight: collapsingSections.has('income') ? 0 : 2000,
                                    opacity: collapsingSections.has('income') ? 0 : 1,
                                    transition: collapsingSections.has('income')
                                        ? 'max-height 0.4s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.3s ease, margin 0.4s ease, padding 0.4s ease'
                                        : undefined,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
                                        <span style={{
                                            fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a',
                                        }}>Regular Income</span>
                                        {INCOME_SOURCES.filter(source => isSourceVisible(source.id, formData.incomeSources)).length > 4 && (
                                            <span
                                                onClick={() => setShowAllIncome(p => !p)}
                                                style={{
                                                    fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#147b75',
                                                    cursor: 'pointer',
                                                }}
                                            >{showAllIncome ? 'Show less' : 'See all'}</span>
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                        {INCOME_SOURCES.filter(source => isSourceVisible(source.id, formData.incomeSources)).slice(0, showAllIncome ? undefined : 4).map(source => {
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

                                        {/* Add income picker (triggered by FAB) */}
                                        {(() => {
                                            const hiddenFixed = FIXED_INCOME_SOURCES.filter(s => !isSourceVisible(s.id, formData.incomeSources))
                                            const pickerOptions = [
                                                ...hiddenFixed,
                                                { id: 'other_income', label: 'Other Regular Income', icon: iconOtherIncome },
                                            ]
                                            return (
                                                <div style={{ position: 'relative' }}>
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
                                                                    {(() => {
                                                                        const si = SOURCE_ICONS[source.id]
                                                                        if (si) { const { Icon: SI, color } = si; return <SI size={20} color={color} /> }
                                                                        return <img src={source.icon} alt="" style={{ width: 24, height: 24, objectFit: 'contain', opacity: 0.7 }} />
                                                                    })()}
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
                                </div>)}

                            {/* Regular Expenses Section */}
                            {(EXPENSE_SOURCES.filter(source => isSourceVisible(source.id, formData.expenseSources)).length > 0 || addingSourceType === 'expense' || collapsingSections.has('expenses')) && (
                                <div data-section="expenses" style={{
                                    margin: collapsingSections.has('expenses') ? '0' : '0 0 10px',
                                    background: '#fff', borderRadius: 14,
                                    padding: collapsingSections.has('expenses') ? 0 : '0 0 8px',
                                    overflow: 'hidden',
                                    maxHeight: collapsingSections.has('expenses') ? 0 : 2000,
                                    opacity: collapsingSections.has('expenses') ? 0 : 1,
                                    transition: collapsingSections.has('expenses')
                                        ? 'max-height 0.4s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.3s ease, margin 0.4s ease, padding 0.4s ease'
                                        : undefined,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
                                        <span style={{
                                            fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a',
                                        }}>Regular Expenses</span>
                                        {EXPENSE_SOURCES.filter(source => isSourceVisible(source.id, formData.expenseSources)).length > 4 && (
                                            <span
                                                onClick={() => setShowAllExpenses(p => !p)}
                                                style={{
                                                    fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#e06470',
                                                    cursor: 'pointer',
                                                }}
                                            >{showAllExpenses ? 'Show less' : 'See all'}</span>
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                        {EXPENSE_SOURCES.filter(source => isSourceVisible(source.id, formData.expenseSources)).slice(0, showAllExpenses ? undefined : 4).map(source => {
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

                                        {/* Add expense picker (triggered by FAB) */}
                                        {(() => {
                                            const hiddenFixed = FIXED_EXPENSE_SOURCES.filter(s => !isSourceVisible(s.id, formData.expenseSources))
                                            const pickerOptions = [
                                                ...hiddenFixed,
                                                { id: 'other_expense', label: 'Other Regular Expense', icon: iconOtherExpense },
                                            ]
                                            return (
                                                <div style={{ position: 'relative' }}>
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
                                                                    {(() => {
                                                                        const si = SOURCE_ICONS[source.id]
                                                                        if (si) { const { Icon: SI, color } = si; return <SI size={20} color={color} /> }
                                                                        return <img src={source.icon} alt="" style={{ width: 24, height: 24, objectFit: 'contain', opacity: 0.7 }} />
                                                                    })()}
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
                                </div>)}
                        </div>)}

                        {activeTab === 'goals' && !dbLoaded && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '40px 0' }}>
                                <div style={{
                                    width: 28, height: 28, borderRadius: '50%',
                                    border: '3px solid #f0f0f0', borderTopColor: '#147b75',
                                    animation: 'spin 0.7s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                                }} />
                                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                            </div>
                        )}
                        {activeTab === 'goals' && dbLoaded && (() => {
                            const sym = getCurrencySymbol()
                            const today = new Date()
                            today.setHours(0, 0, 0, 0)
                            const todayStr = toLocalDate(today)

                            const graphStart = getGraphStart()
                            const sortedEvents = [...events].filter(e => !e.removed).sort((a, b) => a.date.localeCompare(b.date))
                            // Only count events from signup date onward (pre-signup recurring events
                            // are already reflected in the entered balance)
                            const futureEvts = sortedEvents.filter(e => e.date >= todayStr && e.date >= graphStart)

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
                            const upcoming = sortedEvents.filter(e => e.date > todayStr && e.date >= graphStart && e.date <= inRangeStr && e.editType !== 'weeklySpend')
                            const weeklySpendIn90 = sortedEvents.filter(e => e.date > todayStr && e.date >= graphStart && e.date <= inRangeStr && e.editType === 'weeklySpend').reduce((s, e) => s + e.amount, 0)
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
                                padding: '16px 16px',
                                background: '#fff', borderRadius: 14,
                                marginBottom: 10,
                            }
                            const cardTitle = {
                                fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                                color: '#1a1a1a',
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
                                                background: '#f0f4f4', cursor: 'pointer',
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
                                <div style={{ padding: '0 0 40px' }} >

                                    {/* Am I on track? */}
                                    {balanceHistory.length > 0 && (() => {
                                        const latestActual = balanceHistory[0]
                                        const actualBal = Number(latestActual.balance)
                                        const forecastBal = projectionBalance
                                        const diff = actualBal - forecastBal
                                        const absDiff = Math.abs(diff)
                                        const isAhead = diff > 0
                                        const isClose = absDiff < 50
                                        const weeksLeft2 = Math.max(1, Math.ceil(termDaysLeft / 7))
                                        const weeklyAdj = Math.round(absDiff / Math.min(weeksLeft2, 4))
                                        const pct = forecastBal !== 0 ? Math.round((diff / Math.abs(forecastBal)) * 100) : 0
                                        const clampedPct = Math.max(-100, Math.min(100, pct))
                                        const sliderPos = Math.max(3, Math.min(97, 50 + clampedPct / 2))
                                        const isDanger = clampedPct < -30
                                        const isWarning2 = clampedPct < -10 && clampedPct >= -30
                                        const statusText = isDanger ? 'NEEDS ATTENTION' : isWarning2 ? 'WATCH SPENDING' : 'HEALTHY'
                                        const healthColor = isDanger ? '#e06470' : isWarning2 ? '#EC8C17' : '#147b75'
                                        const healthBg = isDanger ? '#fdf0f1' : isWarning2 ? 'rgba(236,140,23,0.1)' : '#f0faf9'

                                        // Gauge: pointer shows position on arc
                                        // Left = behind (-), center = on track (0), right = ahead (+)
                                        const gW = 240
                                        const strokeW = 16
                                        const r = (gW - strokeW) / 2
                                        const cx = gW / 2
                                        const cy = r + strokeW / 2
                                        // Map clampedPct (-100..+100) to arc position (0..1), center = 0.5
                                        const arcPos = Math.max(0.02, Math.min(0.98, (clampedPct + 100) / 200))
                                        // Pointer on the arc edge
                                        const pointerAngle = Math.PI * (1 - arcPos)
                                        const dotX = cx + r * Math.cos(pointerAngle)
                                        const dotY = cy - r * Math.sin(pointerAngle)

                                        return (
                                            <div style={cardStyle}>
                                                <p style={cardTitle}>Am I On Track?</p>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                    <div style={{ position: 'relative', width: gW, height: cy + 24 }}>
                                                        <svg width={gW} height={cy + 24} viewBox={`0 0 ${gW} ${cy + 24}`} style={{ overflow: 'visible' }}>
                                                            <defs>
                                                                <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                                                    <stop offset="0%" stopColor="#e06470" />
                                                                    <stop offset="20%" stopColor="#EC8C17" />
                                                                    <stop offset="40%" stopColor="#d4b44a" />
                                                                    <stop offset="50%" stopColor="#147b75" />
                                                                    <stop offset="100%" stopColor="#147b75" />
                                                                </linearGradient>
                                                            </defs>
                                                            {/* Full gradient arc */}
                                                            <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                                                                fill="none" stroke="url(#gaugeGrad)" strokeWidth={strokeW} strokeLinecap="round" />
                                                            {/* White dot on the arc */}
                                                            <circle cx={dotX} cy={dotY} r={strokeW / 2 + 2}
                                                                fill="#fff" stroke={healthColor} strokeWidth={2.5}
                                                                style={{ transition: 'cx 0.6s ease, cy 0.6s ease' }} />
                                                        </svg>
                                                        {/* Content inside the arc */}
                                                        <div style={{
                                                            position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)',
                                                            textAlign: 'center', whiteSpace: 'nowrap',
                                                        }}>
                                                            <p style={{ margin: 0, fontSize: 30, fontWeight: 800, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a', lineHeight: 1 }}>
                                                                {clampedPct >= 0 ? '+' : ''}{clampedPct}%
                                                            </p>
                                                            <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: healthColor }}>
                                                                {isAhead ? 'Ahead!' : isClose ? 'On Track' : statusText === 'WATCH SPENDING' ? 'Watch Spending' : 'Needs Attention'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    {/* Subtitle */}
                                                    <p style={{ margin: '-30px 0 0', fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#999', textAlign: 'center' }}>
                                                        {isClose ? '' : isAhead
                                                            ? <>{sym}{absDiff.toLocaleString()} above forecast</>
                                                            : <>{sym}{absDiff.toLocaleString()} below forecast</>
                                                        }
                                                    </p>
                                                </div>
                                                {!isAhead && absDiff > 50 && (
                                                    <div style={{ background: '#f8f8f8', borderRadius: 10, padding: '12px 14px' }}>
                                                        <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#555' }}>
                                                            To get back on track:
                                                        </p>
                                                        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#888' }}>
                                                            {'\u2022'} Spend <span style={{ color: '#e06470', fontWeight: 700 }}>{sym}{weeklyAdj}/wk</span> less or earn <span style={{ color: '#147b75', fontWeight: 700 }}>{sym}{weeklyAdj}/wk</span> more
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })()}

                                    {/* Will I run out? */}
                                    {(() => {
                                        const od = overdraftNum || 0
                                        const limit = od > 0 ? -od : 0
                                        const zeroDate = graphZeroDate
                                        const overdraftDate = graphOverdraftDate
                                        const willRunOut = zeroDate || overdraftDate || projectionBalance <= limit
                                        if (!willRunOut) return null

                                        const targetDate = overdraftDate || zeroDate
                                        const daysUntil = targetDate ? daysBetween(todayStr, targetDate) : 0
                                        const alreadyOut = projectionBalance <= limit

                                        const weeklyAmt2 = parseFloat(String(formData.weeklySpend || '0').replace(/,/g, ''))
                                        const weeksLeft3 = Math.max(1, Math.ceil(termDaysLeft / 7))

                                        let evtsToDate = 0
                                        if (targetDate) {
                                            const relevantEvts = sortedEvents.filter(e => e.date >= todayStr && e.date <= targetDate)
                                            for (const evt of relevantEvts) {
                                                if (evt.editType === 'weeklySpend') evtsToDate -= evt.amount
                                                else evtsToDate += evt.type === 'income' ? evt.amount : -evt.amount
                                            }
                                        }
                                        const shortfall = Math.abs(Math.min(0, projectionBalance + evtsToDate - limit))
                                        const weeksToDate = targetDate ? Math.max(1, Math.ceil(daysBetween(todayStr, targetDate) / 7)) : weeksLeft3
                                        const spendLess = Math.round(shortfall / weeksToDate)

                                        return (
                                            <div style={{
                                                background: 'linear-gradient(135deg, #e8838e, #d4566a)',
                                                borderRadius: 14, padding: warningMinimised ? '12px 18px' : '20px 18px', marginBottom: 10,
                                                color: '#fff', position: 'relative', overflow: 'hidden',
                                                transition: 'padding 0.25s ease',
                                            }}>
                                                {/* Decorative circle */}
                                                <div style={{
                                                    position: 'absolute', top: -20, right: -20,
                                                    width: 80, height: 80, borderRadius: '50%',
                                                    background: 'rgba(255,255,255,0.08)',
                                                }} />
                                                <div style={{
                                                    position: 'absolute', bottom: -30, left: -10,
                                                    width: 60, height: 60, borderRadius: '50%',
                                                    background: 'rgba(255,255,255,0.05)',
                                                }} />

                                                {/* Header with minimise toggle */}
                                                <div
                                                    onClick={() => setWarningMinimised(m => !m)}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: warningMinimised ? 0 : 12, transition: 'margin 0.25s ease' }}
                                                >
                                                    <AlertTriangle size={20} color="#fff" strokeWidth={2.5} />
                                                    <p style={{ margin: 0, fontSize: 15, fontWeight: 800, fontFamily: 'Nunito, sans-serif', flex: 1 }}>
                                                        {alreadyOut ? 'You\'ve run out' : 'Running out warning'}
                                                    </p>
                                                    {warningMinimised && (
                                                        <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'Nunito, sans-serif', opacity: 0.9 }}>
                                                            {alreadyOut
                                                                ? (od > 0 ? 'Past overdraft' : `Below ${sym}0`)
                                                                : daysUntil === 0 ? 'Today'
                                                                : daysUntil === 1 ? 'Tomorrow'
                                                                : `${daysUntil}d`
                                                            }
                                                        </span>
                                                    )}
                                                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{
                                                        transform: warningMinimised ? 'rotate(0deg)' : 'rotate(180deg)',
                                                        transition: 'transform 0.25s ease', flexShrink: 0,
                                                    }}>
                                                        <path d="M4.5 7L9 11.5L13.5 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                </div>

                                                {/* Collapsible content */}
                                                <div style={{
                                                    maxHeight: warningMinimised ? 0 : 300,
                                                    opacity: warningMinimised ? 0 : 1,
                                                    overflow: 'hidden',
                                                    transition: 'max-height 0.3s ease, opacity 0.2s ease',
                                                }}>
                                                    {/* Big stat */}
                                                    <p style={{ margin: '0 0 4px', fontSize: 28, fontWeight: 800, fontFamily: 'Nunito, sans-serif', lineHeight: 1 }}>
                                                        {alreadyOut
                                                            ? `${od > 0 ? 'Past overdraft' : 'Below ' + sym + '0'}`
                                                            : daysUntil === 0 ? 'Today'
                                                            : daysUntil === 1 ? 'Tomorrow'
                                                            : `${daysUntil} days`
                                                        }
                                                    </p>
                                                    <p style={{ margin: '0 0 16px', fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', opacity: 0.8 }}>
                                                        {alreadyOut
                                                            ? 'Your balance is already past the limit'
                                                            : `until your forecast hits ${sym}0${od > 0 ? ' / overdraft' : ''}`
                                                        }
                                                    </p>

                                                    {/* Suggestions */}
                                                    <div style={{
                                                        background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '12px 14px',
                                                        backdropFilter: 'blur(4px)',
                                                    }}>
                                                        <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, fontFamily: 'Nunito, sans-serif', opacity: 0.9 }}>
                                                            To avoid running out:
                                                        </p>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                                            {spendLess > 0 && (
                                                                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', opacity: 0.85 }}>
                                                                    {'\u2022'} Spend {sym}{spendLess}/wk less
                                                                </p>
                                                            )}
                                                            {spendLess > 0 && (
                                                                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', opacity: 0.85 }}>
                                                                    {'\u2022'} Or earn {sym}{spendLess}/wk more
                                                                </p>
                                                            )}
                                                            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', opacity: 0.85 }}>
                                                                {'\u2022'} Ask family for a top-up
                                                            </p>
                                                            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', opacity: 0.85 }}>
                                                                {'\u2022'} Check uni hardship funding
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })()}

                                    {/* Upcoming Transactions */}
                                    {(() => {
                                        const thirtyDays = new Date(today)
                                        thirtyDays.setDate(thirtyDays.getDate() + 30)
                                        const thirtyStr = toLocalDate(thirtyDays)
                                        const allUpcoming = [...upcomingIncomeList, ...upcomingPayments].sort((a, b) => a.date.localeCompare(b.date))
                                        const next30 = allUpcoming.filter(e => e.date <= thirtyStr)
                                        const shown = goalsShowMore ? next30 : allUpcoming.slice(0, 5)
                                        if (allUpcoming.length === 0) return null
                                        return (
                                            <div style={cardStyle}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                                    <p style={{ ...cardTitle, margin: 0 }}>Upcoming Transactions</p>
                                                    {allUpcoming.length > 5 && (
                                                        <span onClick={() => setGoalsShowMore(p => !p)} style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#147b75', cursor: 'pointer' }}>
                                                            {goalsShowMore ? 'Show less' : 'Show all'}
                                                        </span>
                                                    )}
                                                </div>
                                                {shown.map((evt, i) => renderEventRow(evt, i, shown, evt.type === 'income' ? '#147b75' : '#e06470'))}
                                            </div>
                                        )
                                    })()}

                                    
                                    {/* Spend & Income Breakdown */}
                                    {(() => {
                                        const activeEvents = events.filter(e => !e.removed && !e.noDot)
                                        // Group by label for expenses
                                        const expenseGroups = {}
                                        const incomeGroups = {}
                                        for (const e of activeEvents) {
                                            const map = e.type === 'expense' ? expenseGroups : incomeGroups
                                            const key = e.label || e.editType
                                            map[key] = (map[key] || 0) + e.amount
                                        }
                                        const expEntries = Object.entries(expenseGroups).sort((a, b) => b[1] - a[1])
                                        const incEntries = Object.entries(incomeGroups).sort((a, b) => b[1] - a[1])
                                        const totalExp = expEntries.reduce((s, [, v]) => s + v, 0)
                                        const totalInc = incEntries.reduce((s, [, v]) => s + v, 0)

                                        const expColors = ['#e06470', '#EC8C17', '#d4b44a', '#8b5cf6', '#3b82a0', '#999']
                                        const incColors = ['#147b75', '#1a9e97', '#5a7c4f', '#3b82a0', '#6366f1', '#999']

                                        const net = totalInc - totalExp
                                        const total = totalInc + totalExp

                                        if (totalInc === 0 && totalExp === 0) return null

                                        // Simple two-segment donut: income vs expense
                                        const donutSize = 130
                                        const strokeWidth = 16
                                        const radius = (donutSize - strokeWidth) / 2
                                        const circumference = 2 * Math.PI * radius
                                        const incLength = total > 0 ? (totalInc / total) * circumference : circumference / 2
                                        const expLength = circumference - incLength
                                        const gap = total > 0 ? 4 : 0

                                        const renderBreakdown = (entries, totalAmt, colors, type) => {
                                            if (totalAmt === 0) return null
                                            const key = type
                                            const showTip = tappedSegment && tappedSegment.type === key
                                            let tipLeft = 50
                                            if (showTip) {
                                                let cum = 0
                                                for (const [label, amt] of entries) {
                                                    const pct = (amt / totalAmt) * 100
                                                    if (label === tappedSegment.label) { tipLeft = cum + pct / 2; break }
                                                    cum += pct
                                                }
                                            }
                                            return (
                                                <>
                                                    <div style={{ position: 'relative', marginBottom: 8 }}>
                                                        {showTip && (
                                                            <div style={{
                                                                position: 'absolute', bottom: '100%', marginBottom: 4,
                                                                left: `clamp(30px, ${tipLeft}%, calc(100% - 30px))`,
                                                                transform: 'translateX(-50%)',
                                                                background: tappedSegment.color, borderRadius: 6, padding: '3px 8px',
                                                                whiteSpace: 'nowrap', zIndex: 1,
                                                                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                                            }}>
                                                                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#fff' }}>
                                                                    {tappedSegment.label} · {sym}{Math.round(tappedSegment.amt).toLocaleString()}
                                                                </span>
                                                                <div style={{
                                                                    position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
                                                                    borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
                                                                    borderTop: `4px solid ${tappedSegment.color}`,
                                                                }} />
                                                            </div>
                                                        )}
                                                        <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', cursor: 'pointer' }}>
                                                        {entries.map(([label, amt], i) => {
                                                            const color = colors[Math.min(i, colors.length - 1)]
                                                            const isTapped = tappedSegment?.label === label && tappedSegment?.type === key
                                                            return (
                                                                <div key={label}
                                                                    onClick={() => setTappedSegment(isTapped ? null : { label, amt, color, type: key })}
                                                                    style={{
                                                                        width: `${(amt / totalAmt) * 100}%`,
                                                                        background: color, minWidth: 2,
                                                                        opacity: showTip && !isTapped ? 0.35 : 1,
                                                                        transition: 'opacity 0.2s ease',
                                                                    }}
                                                                />
                                                            )
                                                        })}
                                                    </div>
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                                                        {entries.map(([label, amt], i) => {
                                                            const color = colors[Math.min(i, colors.length - 1)]
                                                            const isTapped = tappedSegment?.label === label && tappedSegment?.type === key
                                                            return (
                                                                <div key={label}
                                                                    onClick={() => setTappedSegment(isTapped ? null : { label, amt, color, type: key })}
                                                                    style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                                                                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                                                    <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: isTapped ? '#333' : '#888' }}>
                                                                        {label}
                                                                    </span>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </>
                                            )
                                        }

                                        return (
                                            <div style={cardStyle}>
                                                {/* Donut + summary */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 14 }}>
                                                    <div style={{ position: 'relative', width: donutSize, height: donutSize, flexShrink: 0 }}>
                                                        <svg width={donutSize} height={donutSize} viewBox={`0 0 ${donutSize} ${donutSize}`}>
                                                            {/* Income arc */}
                                                            <circle
                                                                cx={donutSize / 2} cy={donutSize / 2} r={radius}
                                                                fill="none" stroke="#147b75"
                                                                strokeWidth={strokeWidth}
                                                                strokeDasharray={`${Math.max(0, incLength - gap)} ${circumference - Math.max(0, incLength - gap)}`}
                                                                strokeDashoffset={0}
                                                                strokeLinecap="round"
                                                                transform={`rotate(-90 ${donutSize / 2} ${donutSize / 2})`}
                                                            />
                                                            {/* Expense arc */}
                                                            <circle
                                                                cx={donutSize / 2} cy={donutSize / 2} r={radius}
                                                                fill="none" stroke="#e06470"
                                                                strokeWidth={strokeWidth}
                                                                strokeDasharray={`${Math.max(0, expLength - gap)} ${circumference - Math.max(0, expLength - gap)}`}
                                                                strokeDashoffset={-incLength}
                                                                strokeLinecap="round"
                                                                transform={`rotate(-90 ${donutSize / 2} ${donutSize / 2})`}
                                                            />
                                                        </svg>
                                                        <div style={{
                                                            position: 'absolute', inset: 0,
                                                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                        }}>
                                                            <span style={{ fontSize: 18, fontWeight: 800, fontFamily: 'Nunito, sans-serif', color: net >= 0 ? '#147b75' : '#e06470', lineHeight: 1 }}>
                                                                {net >= 0 ? '+' : '\u2212'}{sym}{Math.abs(Math.round(net)).toLocaleString()}
                                                            </span>
                                                            <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#bbb', marginTop: 2 }}>net / year</span>
                                                        </div>
                                                    </div>

                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ marginBottom: 10 }}>
                                                            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#147b75' }}>INCOME</p>
                                                            <p style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 800, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a', lineHeight: 1 }}>
                                                                {sym}{Math.round(totalInc).toLocaleString()}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#e06470' }}>EXPENSES</p>
                                                            <p style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 800, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a', lineHeight: 1 }}>
                                                                {sym}{Math.round(totalExp).toLocaleString()}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Income breakdown */}
                                                {incEntries.length > 0 && (
                                                    <div style={{ marginBottom: expEntries.length > 0 ? 14 : 0 }}>
                                                        <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#147b75' }}>Income breakdown</p>
                                                        {renderBreakdown(incEntries, totalInc, incColors, 'income')}
                                                    </div>
                                                )}

                                                {/* Expense breakdown */}
                                                {expEntries.length > 0 && (
                                                    <div>
                                                        <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#e06470' }}>Expense breakdown</p>
                                                        {renderBreakdown(expEntries, totalExp, expColors, 'expense')}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })()}

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
                                        const allPastEvts = sortedEvents.filter(e => e.date <= todayStr && e.date >= graphStart)
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
                                            </div>
                                        )
                                    })()}

                                    {/* Academic Year Progress */}
                                    <div style={cardStyle}>
                                        <p style={cardTitle}>Academic Year Progress</p>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                            <p style={{ ...bigNum, fontSize: 32, color: yearProgress < 33 ? '#e06470' : yearProgress < 66 ? '#EC8C17' : '#147b75' }}>{yearProgress}%</p>
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
                            <div style={{ padding: '0 0 40px' }}>

                                {/* Flexible Spend Overview */}
                                {(() => {
                                    const flexEvents = events.filter(e => !e.removed && (e.editType?.startsWith('flex_') || e.editType === 'oneOffIncome' || e.editType === 'oneOffExpense' || e.editType === 'weeklySpend'))
                                    const flexIn = flexEvents.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
                                    const flexOut = flexEvents.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
                                    const flexNet = flexIn - flexOut
                                    const total = flexIn + flexOut
                                    const inPct = total > 0 ? Math.round((flexIn / total) * 100) : 50
                                    return (
                                        <div style={{ padding: '16px 16px', background: '#fff', borderRadius: 14, marginBottom: 10 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                                <p style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a', margin: 0 }}>
                                                    Flexible Spending Overview
                                                </p>
                                                <span style={{
                                                    fontSize: 15, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
                                                    color: flexNet >= 0 ? '#147b75' : '#e06470',
                                                }}>
                                                    {flexNet >= 0 ? '+' : '\u2212'}{getCurrencySymbol()}{Math.abs(Math.round(flexNet)).toLocaleString()}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', background: '#e06470', marginBottom: 10 }}>
                                                <div style={{
                                                    height: '100%', width: `${inPct}%`,
                                                    background: '#147b75',
                                                    transition: 'width 0.4s ease',
                                                }} />
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#147b75' }}>
                                                    Income {getCurrencySymbol()}{Math.round(flexIn).toLocaleString()}
                                                </span>
                                                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#e06470' }}>
                                                    Spend {getCurrencySymbol()}{Math.round(flexOut).toLocaleString()}
                                                </span>
                                            </div>
                                        </div>
                                    )
                                })()}

                                {/* Weekly Spend Card */}
                                <div style={{
                                    padding: '14px 16px 8px', background: '#fff', borderRadius: 14, marginBottom: 10,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a' }}>
                                            Weekly Spend
                                        </span>
                                        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#e06470' }}>
                                            {getCurrencySymbol()}{Math.round(weeklySpendTotal).toLocaleString()}/yr
                                        </span>
                                    </div>
                                    <WeeklySpendStep compact
                                        weeklySpend={formData.weeklySpend}
                                        updateWeeklySpend={(val) => updateField('weeklySpend', val)}
                                        weeklySpendNonTerm={formData.weeklySpendNonTerm}
                                        updateWeeklySpendNonTerm={(val) => updateField('weeklySpendNonTerm', val)}
                                        weeklySpendVariesByTerm={formData.weeklySpendVariesByTerm}
                                        updateWeeklySpendVariesByTerm={(val) => updateField('weeklySpendVariesByTerm', val)}
                                    />
                                </div>

                                {/* Flex Income Section */}
                                {(formData.flexIncomeSources || []).length > 0 && (
                                    <div data-section="flex-income" style={{ background: '#fff', borderRadius: 14, padding: '0 0 8px', marginBottom: 10 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
                                            <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a' }}>Flexible Income</span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                            {(formData.flexIncomeSources || []).map(srcId => {
                                                const src = FLEX_INCOME_SOURCES.find(s => s.id === srcId)
                                                if (!src) return null
                                                const srcData = formData.flexSourceData?.[srcId] || { frequency: src.defaultFreq }
                                                const si = SOURCE_ICONS[srcId]
                                                const amt = parseFloat(String(srcData.amount || '0').replace(/,/g, ''))
                                                return (
                                                    <FlexRow key={srcId} srcId={srcId} label={src.label} amt={amt} frequency={srcData.frequency} si={si}
                                                        isExpense={false} expanded={expandedSources.has(srcId)}
                                                        active={!hiddenSources.has(srcId)}
                                                        onToggleVisibility={() => toggleSourceVisibility(srcId)}
                                                        onExpandToggle={() => handleExpandToggle(srcId)}
                                                        onDelete={() => {
                                                            setFormData(prev => ({
                                                                ...prev,
                                                                flexIncomeSources: (prev.flexIncomeSources || []).filter(s => s !== srcId),
                                                                flexSourceData: { ...prev.flexSourceData, [srcId]: undefined },
                                                            }))
                                                            setExpandedSources(prev => { const n = new Set(prev); n.delete(srcId); return n })
                                                        }}
                                                    >
                                                        <FlexSourceStep
                                                            data={srcData}
                                                            onChange={(val) => setFormData(prev => ({ ...prev, flexSourceData: { ...prev.flexSourceData, [srcId]: val } }))}
                                                            isExpense={false}
                                                        />
                                                    </FlexRow>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Flex Expense Section */}
                                {(formData.flexExpenseSources || []).length > 0 && (
                                    <div data-section="flex-expenses" style={{ background: '#fff', borderRadius: 14, padding: '0 0 8px', marginBottom: 10 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
                                            <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a' }}>Flexible Expenses</span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                            {(formData.flexExpenseSources || []).map(srcId => {
                                                const src = FLEX_EXPENSE_SOURCES.find(s => s.id === srcId)
                                                if (!src) return null
                                                const srcData = formData.flexSourceData?.[srcId] || { frequency: src.defaultFreq }
                                                const si = SOURCE_ICONS[srcId]
                                                const amt = parseFloat(String(srcData.amount || '0').replace(/,/g, ''))
                                                return (
                                                    <FlexRow key={srcId} srcId={srcId} label={src.label} amt={amt} frequency={srcData.frequency} si={si}
                                                        isExpense={true} expanded={expandedSources.has(srcId)}
                                                        active={!hiddenSources.has(srcId)}
                                                        onToggleVisibility={() => toggleSourceVisibility(srcId)}
                                                        onExpandToggle={() => handleExpandToggle(srcId)}
                                                        onDelete={() => {
                                                            setFormData(prev => ({
                                                                ...prev,
                                                                flexExpenseSources: (prev.flexExpenseSources || []).filter(s => s !== srcId),
                                                                flexSourceData: { ...prev.flexSourceData, [srcId]: undefined },
                                                            }))
                                                            setExpandedSources(prev => { const n = new Set(prev); n.delete(srcId); return n })
                                                        }}
                                                    >
                                                        <FlexSourceStep
                                                            data={srcData}
                                                            onChange={(val) => setFormData(prev => ({ ...prev, flexSourceData: { ...prev.flexSourceData, [srcId]: val } }))}
                                                            isExpense={true}
                                                        />
                                                    </FlexRow>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Empty state when no flex sources */}
                                {(formData.flexIncomeSources || []).length === 0 &&
                                    (formData.flexExpenseSources || []).length === 0 && (
                                        <div style={{
                                            textAlign: 'center',
                                            padding: '24px 40px',
                                        }}>
                                            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#999' }}>
                                                No flexible income or expenses yet
                                            </p>
                                            <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#bbb' }}>
                                                Tap + to add
                                            </p>
                                        </div>
                                    )}
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
                                            background: '#f0f4f4', borderRadius: 5,
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
                                    background: '#f0f4f4', borderRadius: 5,
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

            {/* FAB Balance Update Popup */}
            {fabBalanceOpen && (() => {
                const sym = getCurrencySymbol()
                const lastDate = balanceHistory.length > 0 ? balanceHistory[0].recorded_date : null
                const today = toLocalDate(new Date())
                const isToday = lastDate === today
                return (
                    <>
                        <div data-balance-overlay onClick={() => closeFabBalance()} style={{
                            position: 'fixed', inset: 0, zIndex: 1200,
                            background: 'rgba(0,0,0,0.25)',
                            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
                            opacity: fabBalanceClosing ? 0 : 1,
                            transition: 'opacity 0.25s ease',
                        }} />
                        <div data-balance-popup onClick={(e) => e.stopPropagation()} style={{
                            position: 'fixed', top: '15%',
                            left: '50%', transform: 'translateX(-50%)',
                            zIndex: 1201, width: 'calc(100% - 48px)', maxWidth: 320,
                            background: '#fff', borderRadius: 24,
                            boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
                            padding: '32px 28px 28px',
                            animation: fabBalanceClosing
                                ? 'balanceContractOut 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards'
                                : 'balanceExpandIn 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
                            transformOrigin: 'center bottom',
                        }}>
                            <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#999', textAlign: 'center', letterSpacing: 0.3 }}>
                                {isToday ? 'Updating today\u2019s balance' : `Last recorded ${lastDate ? (() => { const d = daysBetween(lastDate, today); return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago` })() : 'never'}`}
                            </p>

                            <BalancePillInline
                                value={balanceNum}
                                sym={sym}
                                onSave={(val) => {
                                    const newVal = parseFloat(String(val || '0').replace(/,/g, '')) || 0
                                    const today = toLocalDate(new Date())
                                    const lastRecorded = localStorage.getItem('budgeup_balance_last_date')
                                    const isUpdate = lastRecorded === today
                                    if (!originSetRef.current) {
                                        originSetRef.current = true
                                        updateField('balance', val)
                                    }
                                    if (userIdRef.current) {
                                        saveBalanceHistory(userIdRef.current, newVal)
                                    }
                                    analytics.track(DASHBOARD_EVENTS.BALANCE_RECORDED, {
                                        balance_range: getBalanceRange(newVal),
                                        is_first_recording: !originSetRef.current,
                                        is_update: isUpdate,
                                        entry_method: 'fab_button',
                                    })
                                    localStorage.setItem('budgeup_balance_last_date', today)
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
                                    if (balanceNum !== newVal) {
                                        if (balanceToastTimer.current) clearTimeout(balanceToastTimer.current)
                                        setBalanceToast(isUpdate ? 'Updated today\u2019s balance' : 'Recorded balance for today')
                                        balanceToastTimer.current = setTimeout(() => setBalanceToast(null), 2500)
                                    }
                                    closeFabBalance()
                                }}
                                onCancel={closeFabBalance}
                            />
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

            {/* Graph filter dropdown — rendered at root to avoid overflow clipping */}
            {showGraphFilter && (() => {
                const rect = graphFilterRef.current?.getBoundingClientRect()
                const items = [
                    { label: 'Expenses', active: showExpenses, color: '#e06470', toggle: () => setShowExpenses(prev => { localStorage.setItem('budgeup_show_expenses', String(!prev)); return !prev }) },
                    { label: 'Income', active: showIncome, color: '#147b75', toggle: () => setShowIncome(prev => { localStorage.setItem('budgeup_show_income', String(!prev)); return !prev }) },
                    { label: 'History', active: showBalanceHistory, color: '#EC8C17', toggle: () => { setShowBalanceHistory(prev => { analytics.track(DASHBOARD_EVENTS.BALANCE_HISTORY_TOGGLED, { visible: !prev }); localStorage.setItem('budgeup_show_balance_history', String(!prev)); return !prev }) } },
                    { label: 'Overdraft', active: showOverdraft, color: '#c0392b', toggle: () => setShowOverdraft(prev => { localStorage.setItem('budgeup_show_overdraft', String(!prev)); return !prev }) },
                    { label: 'Flexible', active: showFlexible, color: '#1a9e97', toggle: () => setShowFlexible(prev => { localStorage.setItem('budgeup_show_flexible', String(!prev)); return !prev }) },
                    { label: 'Breaks', active: showHolidays, color: '#7c8ab8', toggle: () => setShowHolidays(prev => { localStorage.setItem('budgeup_show_holidays', String(!prev)); return !prev }) },
                ]
                return (
                    <div ref={graphFilterDropdownRef} style={{
                        position: 'fixed',
                        top: rect ? rect.bottom + 6 : 0,
                        right: rect ? window.innerWidth - rect.right : 0,
                        background: '#fff', borderRadius: 12,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
                        padding: 6, zIndex: 2000,
                        display: 'flex', flexDirection: 'column', gap: 2,
                        transformOrigin: 'top right',
                        animation: graphFilterClosing
                            ? 'filterDropdownOut 0.18s ease forwards'
                            : 'filterDropdownIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    }}>
                        {items.map((item, i) => (
                            <button
                                key={item.label}
                                onClick={item.toggle}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '6px 14px', borderRadius: 20,
                                    background: item.active ? `${item.color}12` : 'transparent',
                                    border: 'none', cursor: 'pointer',
                                    transition: 'background 0.15s ease, opacity 0.2s ease, transform 0.2s ease',
                                    minWidth: 0,
                                    opacity: graphFilterClosing ? 0 : 1,
                                    transform: graphFilterClosing ? 'translateY(-4px)' : 'translateY(0)',
                                    transitionDelay: graphFilterClosing ? `${(items.length - 1 - i) * 0.02}s` : `${i * 0.03}s`,
                                }}
                            >
                                <div style={{
                                    width: 9, height: 9, borderRadius: '50%',
                                    background: item.active ? item.color : '#ddd',
                                    transition: 'background 0.2s ease',
                                    flexShrink: 0,
                                }} />
                                <span style={{
                                    fontSize: 12, fontWeight: 600,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: item.active ? '#555' : '#bbb',
                                    transition: 'color 0.15s ease',
                                    letterSpacing: 0.2,
                                }}>{item.label}</span>
                            </button>
                        ))}
                    </div>
                )
            })()}


        </div>
    )
}
