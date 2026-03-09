import { useState, useEffect, useRef, useCallback } from 'react'
import TermGraph from '../components/TermGraph'
import { supabase } from '../lib/supabaseClient'
import { fetchUserData, saveCashflowForecast, saveUserFinances, saveTermDates, saveBalanceHistory } from '../lib/api'
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

const INCOME_SOURCES = [
    { id: 'maintenance_loan', label: 'Maintenance Loan', icon: incomeLoan, panelId: 'maintenanceLoan', editable: true },
    { id: 'bursary', label: 'Bursary', icon: incomeFamily, panelId: 'bursary' },
    { id: 'family_friends', label: 'Family & Friends', icon: incomeFriends, panelId: 'familyFriends' },
    { id: 'work', label: 'Work', icon: incomeWork, panelId: 'work' },
    { id: 'other_income', label: 'Other', icon: iconOtherIncome, panelId: 'otherIncome' },
]

const EXPENSE_SOURCES = [
    { id: 'rent', label: 'Rent', icon: expenseRent, panelId: 'rent' },
    { id: 'bills', label: 'Bills & Utilities', icon: expenseBills, panelId: 'bills' },
    { id: 'uni_fees', label: 'University Fees', icon: expenseUnifees, panelId: 'uniFees' },
    { id: 'savings_investments', label: 'Savings & Investments', icon: expenseSavings, panelId: 'savingsInvestments' },
]


/* ---------- GRAPH EVENT HELPERS (same as onboarding) ---------- */

const MONTH_KEY_TO_DATE = {
    september: '2025-09-01', october: '2025-10-01', november: '2025-11-01', december: '2025-12-01',
    january: '2026-01-01', february: '2026-02-01', march: '2026-03-01', april: '2026-04-01',
    may: '2026-05-01', june: '2026-06-01', july: '2026-07-01', august: '2026-08-01',
}

const MONTH_SHORT = {
    september: 'September', october: 'October', november: 'November', december: 'December',
    january: 'January', february: 'February', march: 'March', april: 'April',
    may: 'May', june: 'June', july: 'July', august: 'August',
}

function generateRentDates(frequency, nextDate, formData = {}) {
    const dates = []
    const ayStart = new Date(2025, 8, 1)
    const ayEnd = new Date(2026, 7, 31)
    if (!frequency) return dates
    if (frequency === 'weekly') {
        let d = nextDate ? new Date(nextDate + 'T00:00:00') : new Date(2025, 8, 1)
        while (d > ayStart) d = new Date(d.getTime() - 7 * 24 * 60 * 60 * 1000)
        while (d < ayStart) d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
        while (d <= ayEnd) { dates.push(d.toISOString().split('T')[0]); d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000) }
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
    let current = nextDate ? new Date(nextDate + 'T00:00:00') : new Date(2025, 8, 1)
    let count = 0
    while (current <= ayEnd && count < 12) {
        if (current >= ayStart) { dates.push(current.toISOString().split('T')[0]); count++ }
        switch (frequency) {
            case 'monthly': current = new Date(current.getFullYear(), current.getMonth() + 1, current.getDate()); break
            case 'quarterly': current = new Date(current.getFullYear(), current.getMonth() + 3, current.getDate()); break
            default: return dates
        }
    }
    return dates
}

function isInTerm(dateStr, terms) {
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

function distributeEvenly(total, count) {
    if (count <= 0) return []
    const per = Math.round(total / count)
    const amounts = Array(count).fill(per)
    amounts[count - 1] = total - per * (count - 1)
    return amounts
}

function buildGraphEvents(formData) {
    const events = []
    const terms = formData.termDates?.terms || []

    // Maintenance loan
    if (formData.incomeSources?.includes('maintenance_loan')) {
        const months = formData.loanMonths || DEFAULT_LOAN_MONTHS
        const totalAmount = parseFloat(String(formData.loanAmount || '0').replace(/,/g, ''))
        let runningTotal = 0
        for (let mi = 0; mi < months.length; mi++) {
            const month = months[mi]
            const date = formData.loanDates?.[month] || MONTH_KEY_TO_DATE[month]
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
        const famAmt = parseFloat(String(formData.familyAmount || '0').replace(/,/g, ''))
        const famNonTermAmt = formData.familyVariesByTerm ? parseFloat(String(formData.familyNonTermAmount || '0').replace(/,/g, '')) : famAmt
        const freq = formData.familyFrequency
        if ((famAmt > 0 || famNonTermAmt > 0) && freq) {
            const ayStart = new Date(2025, 8, 1), ayEnd = new Date(2026, 7, 31)
            const getFamAmt = (ds) => formData.familyVariesByTerm ? (isInTerm(ds, terms) ? famAmt : famNonTermAmt) : famAmt
            if (freq === 'weekly') {
                let d = formData.familyNextDate ? new Date(formData.familyNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                while (d <= ayEnd) { const ds = d.toISOString().split('T')[0]; const a = getFamAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'income', label: 'Family/Friends', sublabel: 'Weekly support', editType: 'family' }); d = new Date(d.getTime() + 7 * 86400000) }
            } else if (freq === 'monthly') {
                let d = formData.familyNextDate ? new Date(formData.familyNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                while (d > ayEnd) d = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
                while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
                const dom = d.getDate()
                while (d <= ayEnd) { const ds = d.toISOString().split('T')[0]; const a = getFamAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'income', label: 'Family/Friends', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} support`, editType: 'family' }); d = new Date(d.getFullYear(), d.getMonth() + 1, dom) }
            } else if (freq === 'termly') {
                const overrides = formData.familyTermDates || {}
                for (const term of terms) { const date = overrides[term.id] || term.start; if (date) events.push({ date, amount: famAmt, type: 'income', label: 'Family/Friends', sublabel: `${term.name} support`, editType: 'family' }) }
            } else if (freq === 'quarterly') {
                const qDates = formData.familyQuarterlyDates || {}
                const QUARTER_DEFAULTS = ['2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01']
                for (let i = 0; i < 4; i++) { const date = qDates[i] || QUARTER_DEFAULTS[i]; const a = getFamAmt(date); if (a > 0) events.push({ date, amount: a, type: 'income', label: 'Family/Friends', sublabel: `Q${i + 1} support`, editType: 'family' }) }
            }
        }
    }

    // Work
    if (formData.incomeSources?.includes('work')) {
        const workAmt = parseFloat(String(formData.workAmount || '0').replace(/,/g, ''))
        const workNonTermAmt = formData.workVariesByTerm ? parseFloat(String(formData.workNonTermAmount || '0').replace(/,/g, '')) : workAmt
        const workMode = formData.workEntryMode || 'yearly'
        if (workAmt > 0) {
            const ayStart = new Date(2025, 8, 1), ayEnd = new Date(2026, 7, 31)
            const freq = formData.workFrequency || 'monthly'
            const getWorkAmt = (ds) => formData.workVariesByTerm ? (isInTerm(ds, terms) ? workAmt : workNonTermAmt) : workAmt
            if (workMode === 'yearly') {
                if (freq === 'weekly') {
                    let d = formData.workNextDate ? new Date(formData.workNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    let count = 0; let tmp = new Date(d); while (tmp <= ayEnd) { count++; tmp = new Date(tmp.getTime() + 7 * 86400000) }
                    const amounts = distributeEvenly(workAmt, count); let idx = 0
                    while (d <= ayEnd) { events.push({ date: d.toISOString().split('T')[0], amount: amounts[idx++], type: 'income', label: 'Work', sublabel: 'Weekly income', editType: 'work' }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (freq === 'monthly') {
                    let d = formData.workNextDate ? new Date(formData.workNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayEnd) d = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
                    const dom = d.getDate()
                    let mCount = 0; let mt = new Date(d); while (mt <= ayEnd) { mCount++; mt = new Date(mt.getFullYear(), mt.getMonth() + 1, dom) }
                    const amounts = distributeEvenly(workAmt, mCount); let idx = 0
                    while (d <= ayEnd) { events.push({ date: d.toISOString().split('T')[0], amount: amounts[idx++], type: 'income', label: 'Work', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} income`, editType: 'work' }); d = new Date(d.getFullYear(), d.getMonth() + 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = formData.workTermDates || {}; const amounts = distributeEvenly(workAmt, terms.length)
                    for (let ti = 0; ti < terms.length; ti++) { const term = terms[ti]; const date = overrides[term.id] || term.start; if (date) events.push({ date, amount: amounts[ti], type: 'income', label: 'Work', sublabel: `${term.name} income`, editType: 'work' }) }
                } else if (freq === 'yearly') {
                    events.push({ date: formData.workNextDate || '2025-09-01', amount: workAmt, type: 'income', label: 'Work', sublabel: 'Yearly income', editType: 'work' })
                }
            } else {
                if (freq === 'weekly') {
                    let d = formData.workNextDate ? new Date(formData.workNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) { const ds = d.toISOString().split('T')[0]; const a = getWorkAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'income', label: 'Work', sublabel: 'Weekly income', editType: 'work' }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (freq === 'monthly') {
                    let d = formData.workNextDate ? new Date(formData.workNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayEnd) d = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
                    const dom = d.getDate()
                    while (d <= ayEnd) { const ds = d.toISOString().split('T')[0]; const a = getWorkAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'income', label: 'Work', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} income`, editType: 'work' }); d = new Date(d.getFullYear(), d.getMonth() + 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = formData.workTermDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) events.push({ date, amount: workAmt, type: 'income', label: 'Work', sublabel: `${term.name} income`, editType: 'work' }) }
                } else if (freq === 'yearly') {
                    if (workAmt > 0) events.push({ date: formData.workNextDate || '2025-09-01', amount: workAmt, type: 'income', label: 'Work', sublabel: 'Yearly income', editType: 'work' })
                }
            }
        }
    }

    // Other income
    if (formData.incomeSources?.includes('other_income')) {
        const otherAmt = parseFloat(String(formData.otherIncomeAmount || '0').replace(/,/g, ''))
        const otherNonTermAmt = formData.otherIncomeVariesByTerm ? parseFloat(String(formData.otherIncomeNonTermAmount || '0').replace(/,/g, '')) : otherAmt
        const freq = formData.otherIncomeFrequency
        const lbl = formData.otherIncomeLabel || 'Other Income'
        const otherMode = formData.otherIncomeEntryMode || 'yearly'
        const getOtherAmt = (ds) => formData.otherIncomeVariesByTerm ? (isInTerm(ds, terms) ? otherAmt : otherNonTermAmt) : otherAmt
        if (otherAmt > 0 && freq) {
            const ayStart = new Date(2025, 8, 1), ayEnd = new Date(2026, 7, 31)
            if (otherMode === 'yearly') {
                if (freq === 'weekly') {
                    let d = formData.otherIncomeNextDate ? new Date(formData.otherIncomeNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    let count = 0; let tmp = new Date(d); while (tmp <= ayEnd) { count++; tmp = new Date(tmp.getTime() + 7 * 86400000) }
                    const amounts = distributeEvenly(otherAmt, count); let idx = 0
                    while (d <= ayEnd) { events.push({ date: d.toISOString().split('T')[0], amount: amounts[idx++], type: 'income', label: lbl, sublabel: 'Weekly', editType: 'otherIncome' }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (freq === 'monthly') {
                    let d = formData.otherIncomeNextDate ? new Date(formData.otherIncomeNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayEnd) d = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
                    const dom = d.getDate()
                    let mCount = 0; let mt = new Date(d); while (mt <= ayEnd) { mCount++; mt = new Date(mt.getFullYear(), mt.getMonth() + 1, dom) }
                    const amounts = distributeEvenly(otherAmt, mCount); let idx = 0
                    while (d <= ayEnd) { events.push({ date: d.toISOString().split('T')[0], amount: amounts[idx++], type: 'income', label: lbl, sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })}`, editType: 'otherIncome' }); d = new Date(d.getFullYear(), d.getMonth() + 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = formData.otherIncomeTermDates || {}; const amounts = distributeEvenly(otherAmt, terms.length)
                    for (let ti = 0; ti < terms.length; ti++) { const term = terms[ti]; const date = overrides[term.id] || term.start; if (date) events.push({ date, amount: amounts[ti], type: 'income', label: lbl, sublabel: `${term.name}`, editType: 'otherIncome' }) }
                } else if (freq === 'yearly') {
                    events.push({ date: formData.otherIncomeNextDate || '2025-09-01', amount: otherAmt, type: 'income', label: lbl, sublabel: 'Yearly income', editType: 'otherIncome' })
                }
            } else {
                if (freq === 'weekly') {
                    let d = formData.otherIncomeNextDate ? new Date(formData.otherIncomeNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) { const ds = d.toISOString().split('T')[0]; const a = getOtherAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'income', label: lbl, sublabel: 'Weekly', editType: 'otherIncome' }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (freq === 'monthly') {
                    let d = formData.otherIncomeNextDate ? new Date(formData.otherIncomeNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayEnd) d = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
                    const dom = d.getDate()
                    while (d <= ayEnd) { const ds = d.toISOString().split('T')[0]; const a = getOtherAmt(ds); if (a > 0) events.push({ date: ds, amount: a, type: 'income', label: lbl, sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })}`, editType: 'otherIncome' }); d = new Date(d.getFullYear(), d.getMonth() + 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = formData.otherIncomeTermDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) events.push({ date, amount: otherAmt, type: 'income', label: lbl, sublabel: `${term.name}`, editType: 'otherIncome' }) }
                } else if (freq === 'yearly') {
                    if (otherAmt > 0) events.push({ date: formData.otherIncomeNextDate || '2025-09-01', amount: otherAmt, type: 'income', label: lbl, sublabel: 'Yearly income', editType: 'otherIncome' })
                }
            }
        }
    }

    // Rent
    const rentAmt = parseFloat(String(formData.rentAmount || '0').replace(/,/g, ''))
    if (rentAmt > 0 && formData.rentFrequency) {
        const rentDates = generateRentDates(formData.rentFrequency, formData.rentNextDate, formData)
        const isYearly = formData.rentEntryMode === 'yearly'
        const rentAmounts = isYearly ? distributeEvenly(rentAmt, rentDates.length) : rentDates.map(() => rentAmt)
        for (let ri = 0; ri < rentDates.length; ri++) {
            const date = rentDates[ri]; const dt = new Date(date + 'T00:00:00')
            events.push({ date, amount: rentAmounts[ri], type: 'expense', label: 'Rent', sublabel: `${dt.toLocaleDateString('en-GB', { month: 'long' })} rent`, editType: 'rent' })
        }
    }

    // Bills
    const billsAmt = parseFloat(String(formData.billsAmount || '0').replace(/,/g, ''))
    if (billsAmt > 0 && formData.billsFrequency) {
        const billsMode = formData.billsEntryMode || 'yearly'
        const freq = formData.billsFrequency
        const ayStart = new Date(2025, 8, 1), ayEnd = new Date(2026, 7, 31)
        const genBills = (amt) => {
            if (freq === 'weekly') {
                let d = formData.billsNextDate ? new Date(formData.billsNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                if (billsMode === 'yearly') {
                    let count = 0; let tmp = new Date(d); while (tmp <= ayEnd) { count++; tmp = new Date(tmp.getTime() + 7 * 86400000) }
                    const amounts = distributeEvenly(billsAmt, count); let idx = 0
                    while (d <= ayEnd) { events.push({ date: d.toISOString().split('T')[0], amount: amounts[idx++], type: 'expense', label: 'Bills', sublabel: 'Weekly bills', editType: 'bills' }); d = new Date(d.getTime() + 7 * 86400000) }
                } else {
                    while (d <= ayEnd) { events.push({ date: d.toISOString().split('T')[0], amount: amt, type: 'expense', label: 'Bills', sublabel: 'Weekly bills', editType: 'bills' }); d = new Date(d.getTime() + 7 * 86400000) }
                }
            } else if (freq === 'monthly') {
                let d = formData.billsNextDate ? new Date(formData.billsNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                while (d > ayEnd) d = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
                while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
                const dom = d.getDate()
                if (billsMode === 'yearly') {
                    let mCount = 0; let mt = new Date(d); while (mt <= ayEnd) { mCount++; mt = new Date(mt.getFullYear(), mt.getMonth() + 1, dom) }
                    const amounts = distributeEvenly(billsAmt, mCount); let idx = 0
                    while (d <= ayEnd) { events.push({ date: d.toISOString().split('T')[0], amount: amounts[idx++], type: 'expense', label: 'Bills', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} bills`, editType: 'bills' }); d = new Date(d.getFullYear(), d.getMonth() + 1, dom) }
                } else {
                    while (d <= ayEnd) { events.push({ date: d.toISOString().split('T')[0], amount: amt, type: 'expense', label: 'Bills', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} bills`, editType: 'bills' }); d = new Date(d.getFullYear(), d.getMonth() + 1, dom) }
                }
            } else if (freq === 'termly') {
                const overrides = formData.billsTermDates || {}
                if (billsMode === 'yearly') {
                    const amounts = distributeEvenly(billsAmt, terms.length)
                    for (let ti = 0; ti < terms.length; ti++) { const term = terms[ti]; const date = overrides[term.id] || term.start; if (date) events.push({ date, amount: amounts[ti], type: 'expense', label: 'Bills', sublabel: `${term.name} bills`, editType: 'bills' }) }
                } else {
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) events.push({ date, amount: amt, type: 'expense', label: 'Bills', sublabel: `${term.name} bills`, editType: 'bills' }) }
                }
            } else if (freq === 'yearly') {
                events.push({ date: formData.billsNextDate || '2025-09-01', amount: billsAmt, type: 'expense', label: 'Bills', sublabel: 'Yearly bills', editType: 'bills' })
            }
        }
        genBills(billsAmt)
    }

    // University fees
    if (formData.expenseSources?.includes('uni_fees')) {
        const uniAmt = parseFloat(String(formData.uniFeesAmount || '0').replace(/,/g, ''))
        if (uniAmt > 0) {
            const uniFreq = formData.uniFeesFrequency || 'yearly'
            const uniMode = formData.uniFeesEntryMode || 'yearly'
            const ayStart = new Date(2025, 8, 1), ayEnd = new Date(2026, 7, 31)
            if (uniFreq === 'yearly') {
                events.push({ date: formData.uniFeesNextDate || '2025-10-27', amount: uniAmt, type: 'expense', label: 'University Fees', sublabel: 'Yearly tuition', editType: 'uniFees' })
            } else if (uniFreq === 'monthly') {
                let d = formData.uniFeesNextDate ? new Date(formData.uniFeesNextDate + 'T00:00:00') : new Date('2025-10-27T00:00:00')
                while (d > ayEnd) d = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
                while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
                const dom = d.getDate()
                if (uniMode === 'yearly') {
                    let mCount = 0; let mt = new Date(d); while (mt <= ayEnd) { mCount++; mt = new Date(mt.getFullYear(), mt.getMonth() + 1, dom) }
                    const amounts = distributeEvenly(uniAmt, mCount); let idx = 0
                    while (d <= ayEnd) {
                        events.push({ date: d.toISOString().split('T')[0], amount: amounts[idx++], type: 'expense', label: 'University Fees', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} fees`, editType: 'uniFees' })
                        d = new Date(d.getFullYear(), d.getMonth() + 1, dom)
                    }
                } else {
                    while (d <= ayEnd) {
                        events.push({ date: d.toISOString().split('T')[0], amount: uniAmt, type: 'expense', label: 'University Fees', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} fees`, editType: 'uniFees' })
                        d = new Date(d.getFullYear(), d.getMonth() + 1, dom)
                    }
                }
            } else if (uniFreq === 'termly') {
                const overrides = formData.uniFeesTermDates || {}
                if (uniMode === 'yearly') {
                    const amounts = distributeEvenly(uniAmt, terms.length)
                    for (let ti = 0; ti < terms.length; ti++) { const term = terms[ti]; const date = overrides[term.id] || term.start; if (date) events.push({ date, amount: amounts[ti], type: 'expense', label: 'University Fees', sublabel: `${term.name} fees`, editType: 'uniFees' }) }
                } else {
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) events.push({ date, amount: uniAmt, type: 'expense', label: 'University Fees', sublabel: `${term.name} fees`, editType: 'uniFees' }) }
                }
            }
        }
    }

    // Savings & Investments
    if (formData.expenseSources?.includes('savings_investments')) {
        const savAmt = parseFloat(String(formData.savingsInvAmount || '0').replace(/,/g, ''))
        if (savAmt > 0 && formData.savingsInvFrequency) {
            const savMode = formData.savingsInvEntryMode || 'per_payment'
            const freq = formData.savingsInvFrequency
            const ayStart = new Date(2025, 8, 1), ayEnd = new Date(2026, 7, 31)
            if (savMode === 'yearly') {
                if (freq === 'weekly') {
                    let d = formData.savingsInvNextDate ? new Date(formData.savingsInvNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    let count = 0; let tmp = new Date(d)
                    while (tmp <= ayEnd) { count++; tmp = new Date(tmp.getTime() + 7 * 86400000) }
                    const amounts = distributeEvenly(savAmt, count); let idx = 0
                    while (d <= ayEnd) { events.push({ date: d.toISOString().split('T')[0], amount: amounts[idx++], type: 'expense', label: 'Savings', sublabel: 'Weekly savings', editType: 'savingsInv' }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (freq === 'monthly') {
                    let d = formData.savingsInvNextDate ? new Date(formData.savingsInvNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayEnd) d = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
                    const dom = d.getDate()
                    let mCount = 0; let mt = new Date(d); while (mt <= ayEnd) { mCount++; mt = new Date(mt.getFullYear(), mt.getMonth() + 1, dom) }
                    const amounts = distributeEvenly(savAmt, mCount); let idx = 0
                    while (d <= ayEnd) { events.push({ date: d.toISOString().split('T')[0], amount: amounts[idx++], type: 'expense', label: 'Savings', sublabel: 'Monthly savings', editType: 'savingsInv' }); d = new Date(d.getFullYear(), d.getMonth() + 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = formData.savingsInvTermDates || {}
                    const amounts = distributeEvenly(savAmt, terms.length)
                    for (let ti = 0; ti < terms.length; ti++) { const term = terms[ti]; const date = overrides[term.id] || term.start; if (date) events.push({ date, amount: amounts[ti], type: 'expense', label: 'Savings', sublabel: `${term.name} savings`, editType: 'savingsInv' }) }
                } else if (freq === 'quarterly') {
                    const qDates = formData.savingsInvQuarterlyDates || {}
                    const QD = ['2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01']
                    const amounts = distributeEvenly(savAmt, 4)
                    for (let i = 0; i < 4; i++) { events.push({ date: qDates[i] || QD[i], amount: amounts[i], type: 'expense', label: 'Savings', sublabel: `Q${i + 1} savings`, editType: 'savingsInv' }) }
                }
            } else {
                if (freq === 'weekly') {
                    let d = formData.savingsInvNextDate ? new Date(formData.savingsInvNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) { events.push({ date: d.toISOString().split('T')[0], amount: savAmt, type: 'expense', label: 'Savings', sublabel: 'Weekly savings', editType: 'savingsInv' }); d = new Date(d.getTime() + 7 * 86400000) }
                } else if (freq === 'monthly') {
                    let d = formData.savingsInvNextDate ? new Date(formData.savingsInvNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayEnd) d = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
                    const dom = d.getDate()
                    while (d <= ayEnd) { events.push({ date: d.toISOString().split('T')[0], amount: savAmt, type: 'expense', label: 'Savings', sublabel: 'Monthly savings', editType: 'savingsInv' }); d = new Date(d.getFullYear(), d.getMonth() + 1, dom) }
                } else if (freq === 'termly') {
                    const overrides = formData.savingsInvTermDates || {}
                    for (const term of terms) { const date = overrides[term.id] || term.start; if (date) events.push({ date, amount: savAmt, type: 'expense', label: 'Savings', sublabel: `${term.name} savings`, editType: 'savingsInv' }) }
                } else if (freq === 'quarterly') {
                    const qDates = formData.savingsInvQuarterlyDates || {}
                    const QD = ['2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01']
                    for (let i = 0; i < 4; i++) { events.push({ date: qDates[i] || QD[i], amount: savAmt, type: 'expense', label: 'Savings', sublabel: `Q${i + 1} savings`, editType: 'savingsInv' }) }
                }
            }
        }
    }

    // Weekly spend
    const weeklyAmt = parseFloat(String(formData.weeklySpend || '0').replace(/,/g, ''))
    const weeklyNonTermAmt = formData.weeklySpendVariesByTerm ? parseFloat(String(formData.weeklySpendNonTerm || '0').replace(/,/g, '')) : weeklyAmt
    if (weeklyAmt > 0 || weeklyNonTermAmt > 0) {
        const ayStart = new Date(2025, 8, 1), ayEnd = new Date(2026, 7, 31)
        let d = new Date(ayStart)
        while (d.getDay() !== 1) d = new Date(d.getTime() + 86400000)
        while (d <= ayEnd) {
            const ds = d.toISOString().split('T')[0]
            const amt = formData.weeklySpendVariesByTerm ? (isInTerm(ds, terms) ? weeklyAmt : weeklyNonTermAmt) : weeklyAmt
            if (amt > 0) events.push({ date: ds, amount: amt, type: 'expense', label: 'Weekly Spend', sublabel: 'Average weekly spending', editType: 'weeklySpend', noDot: true })
            d = new Date(d.getTime() + 7 * 86400000)
        }
    }

    // One-off items
    for (const item of (formData.oneOffItems || [])) {
        const amt = parseFloat(String(item.amount || '0').replace(/,/g, ''))
        if (amt > 0 && item.date) events.push({ date: item.date, amount: amt, type: (item.direction || 'out') === 'in' ? 'income' : 'expense', label: item.name || 'One-off', sublabel: (item.direction || 'out') === 'in' ? 'One-off income' : 'One-off expense', editType: 'oneOff' })
    }

    const removed = formData.removedEvents || []
    return events.map(e => removed.includes(`${e.editType}:${e.date}`) ? { ...e, removed: true } : e)
}

/* ---------- YEARLY TOTAL HELPER ---------- */

function calcYearlyTotal(events, type) {
    return events.filter(e => e.type === type && !e.removed && !e.noDot).reduce((sum, e) => sum + e.amount, 0)
}

/* ---------- MONEY FORMAT ---------- */

function fmtAmount(val) {
    if (val >= 1000) return `£${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k`
    return `£${Math.round(val).toLocaleString()}`
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

/* ---------- BALANCE EDITOR OVERLAY ---------- */

function BalanceEditor({ value, onSave, onCancel }) {
    const [raw, setRaw] = useState(() => {
        const n = parseFloat(String(value || '').replace(/,/g, ''))
        return n ? String(n) : ''
    })
    const [isNegative, setIsNegative] = useState(() => {
        const n = parseFloat(String(value || '').replace(/,/g, ''))
        return n < 0
    })
    const inputRef = useRef(null)

    useEffect(() => {
        setTimeout(() => inputRef.current?.focus(), 100)
    }, [])

    const handleChange = (e) => {
        let val = e.target.value.replace(/[^0-9.]/g, '')
        const parts = val.split('.')
        if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('')
        if (parseFloat(val) > 500000) val = '500000'
        setRaw(val)
    }

    const handleSave = () => {
        const num = parseFloat(raw || '0')
        onSave(String(isNegative ? -Math.abs(num) : Math.abs(num)))
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
        }} onClick={onCancel}>
            <div onClick={e => e.stopPropagation()} style={{
                background: '#fff', borderRadius: 16, padding: 24,
                width: '100%', maxWidth: 320,
            }}>
                <p style={{
                    fontSize: 18, fontWeight: 700,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#000', margin: '0 0 6px',
                }}>Update Balance</p>
                <p style={{
                    fontSize: 13, fontFamily: 'Nunito, sans-serif',
                    color: '#5e5e5e', margin: '0 0 16px',
                }}>Enter your current bank balance</p>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                    <button onClick={() => setIsNegative(!isNegative)} style={{
                        width: 36, height: 36, borderRadius: 6,
                        border: 'none', cursor: 'pointer',
                        background: isNegative ? '#e06470' : '#147b75',
                        color: '#fff', fontSize: 18, fontWeight: 700,
                        fontFamily: 'Nunito, sans-serif',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{isNegative ? '−' : '+'}</button>
                    <div style={{
                        display: 'flex', alignItems: 'center', flex: 1,
                        border: '1px solid #e8e8e8', borderRadius: 10,
                        padding: '0 14px', height: 44, gap: 6,
                    }}>
                        <span style={{ fontSize: 18, fontWeight: 600, color: '#5e5e5e', fontFamily: 'Nunito, sans-serif' }}>£</span>
                        <input
                            ref={inputRef}
                            type="text"
                            inputMode="decimal"
                            placeholder="0"
                            value={formatDisplay(raw.replace('-', ''))}
                            onChange={handleChange}
                            style={{
                                flex: 1, border: 'none', background: 'transparent',
                                fontSize: 18, fontWeight: 500, fontFamily: 'Nunito, sans-serif',
                                color: '#000', outline: 'none', padding: 0,
                            }}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={onCancel} style={{
                        flex: 1, height: 40, borderRadius: 10,
                        border: '1px solid #e0e0e0', background: '#fff',
                        fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                        color: '#5e5e5e', cursor: 'pointer',
                    }}>Cancel</button>
                    <button onClick={handleSave} style={{
                        flex: 1, height: 40, borderRadius: 10,
                        border: 'none', background: '#147b75',
                        fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                        color: '#fff', cursor: 'pointer',
                    }}>Save</button>
                </div>
            </div>
        </div>
    )
}

/* ---------- INCOME/EXPENSE ROW ---------- */

function SourceRow({ source, active, yearlyAmount, expanded, onToggle, onExpandToggle, scrollContainerRef, formData, updateField, children }) {
    const isInactive = !active
    const rowRef = useRef(null)
    const expandContentRef = useRef(null)
    const [contentHeight, setContentHeight] = useState(0)

    useEffect(() => {
        if (expanded && expandContentRef.current) {
            setContentHeight(expandContentRef.current.scrollHeight)
        } else {
            setContentHeight(0)
        }
    }, [expanded, active])

    useEffect(() => {
        if (expanded && rowRef.current && scrollContainerRef?.current) {
            // Wait for previous dropdown collapse animation (300ms) to finish
            setTimeout(() => {
                const container = scrollContainerRef.current
                if (!container || !rowRef.current) return
                const stickyHeader = container.querySelector('[data-sticky-header]')
                const currentHeaderHeight = stickyHeader ? stickyHeader.offsetHeight : 0
                const SHRINK_DIST = 92
                const currentScroll = container.scrollTop
                const remainingShrink = Math.max(0, SHRINK_DIST - currentScroll)
                const collapsedHeaderHeight = currentHeaderHeight - remainingShrink

                const rowRect = rowRef.current.getBoundingClientRect()
                const containerRect = container.getBoundingClientRect()
                const rowTopInContainer = rowRect.top - containerRect.top + currentScroll
                const targetScroll = rowTopInContainer - collapsedHeaderHeight
                container.scrollTo({ top: targetScroll, behavior: 'smooth' })
            }, 320)
        }
    }, [expanded])

    return (
        <div ref={rowRef} style={{
            border: '1px solid #f3f3f3',
            borderRadius: 10,
            background: isInactive ? '#f9f9f9' : '#fff',
            overflow: 'hidden',
            transition: 'all 0.2s ease',
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
                        color: isInactive ? '#bbb' : 'rgba(20,123,117,0.7)',
                        margin: 0,
                    }}>
                        {yearlyAmount > 0 ? `£${yearlyAmount.toLocaleString()}/yr` : '—'}
                    </p>
                </div>

                {/* Toggle + Chevron */}
                <div onClick={(e) => e.stopPropagation()}>
                    <ToggleSwitch on={active} onChange={onToggle} size="small" />
                </div>
                <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke={isInactive ? '#bbb' : '#999'}
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{
                        flexShrink: 0,
                        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                    }}
                >
                    <path d="M6 9l6 6 6-6" />
                </svg>
            </div>

            {/* Expanded section — animated height */}
            <div style={{
                maxHeight: contentHeight,
                overflow: 'hidden',
                transition: 'max-height 0.3s ease',
            }}>
                <div ref={expandContentRef}>
                    {children && (
                        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8, background: '#fafafa' }}>
                            {children}
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

/* ---------- MAIN DASHBOARD ---------- */

export default function Dashboard() {
    const [formData, setFormData] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY)
            if (saved) {
                const parsed = JSON.parse(saved)
                return { ...INITIAL_FORM_DATA, ...parsed.formData }
            }
        } catch { /* ignore */ }
        return { ...INITIAL_FORM_DATA }
    })

    const [showBalanceEditor, setShowBalanceEditor] = useState(false)
    const [showBalanceHistory, setShowBalanceHistory] = useState(false)
    const [showIncome, setShowIncome] = useState(true)
    const [showExpenses, setShowExpenses] = useState(true)
    const [expandedSource, setExpandedSource] = useState(null)
    const [activeTab, setActiveTab] = useState('fixed')
    const [editingEvent, setEditingEvent] = useState(null)
    const [editAmount, setEditAmount] = useState('')
    const [dbLoaded, setDbLoaded] = useState(false)
    const saveTimerRef = useRef(null)
    const userIdRef = useRef(null)

    // Load data from Supabase on mount
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user || cancelled) return
                userIdRef.current = user.id
                const result = await fetchUserData(user.id)
                if (cancelled) return
                if (result.formData) {
                    setFormData(prev => ({ ...prev, ...result.formData }))
                    // Also update localStorage
                    try {
                        const saved = localStorage.getItem(STORAGE_KEY)
                        const parsed = saved ? JSON.parse(saved) : {}
                        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, formData: { ...INITIAL_FORM_DATA, ...result.formData } }))
                    } catch { /* ignore */ }
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
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(async () => {
            try {
                const userId = userIdRef.current
                await Promise.all([
                    saveCashflowForecast(userId, formData),
                    saveUserFinances(userId, {
                        university: formData.university,
                        balance: formData.balance,
                        overdraft: formData.overdraft,
                        savings: formData.savings,
                        weeklySpend: formData.weeklySpend,
                        weeklySpendNonTerm: formData.weeklySpendNonTerm,
                        weeklySpendVariesByTerm: formData.weeklySpendVariesByTerm,
                    }),
                    saveTermDates(userId, formData.termDates),
                    saveBalanceHistory(userId, formData.balance),
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
    const rafRef = useRef(null)
    const MAX_H = 200
    const MIN_H = 108
    const SHRINK_DIST = MAX_H - MIN_H

    // Keep graphHeight in state for TermGraph prop (initial only matters)
    const [graphHeight, setGraphHeight] = useState(MAX_H)
    const cardDetailsRef = useRef(null)
    const footerRef = useRef(null)

    const handleScroll = useCallback(() => {
        if (rafRef.current) return
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null
            const el = scrollRef.current
            if (!el) return
            const s = el.scrollTop
            // Single unified progress 0→1 for both graph + cards
            const t = Math.min(1, s / SHRINK_DIST)
            const h = MAX_H - t * (MAX_H - MIN_H)
            const offset = Math.min(s, SHRINK_DIST)

            // Direct DOM updates — no re-render
            if (graphContainerRef.current) {
                graphContainerRef.current.style.height = `${h}px`
            }
            if (contentWrapRef.current) {
                contentWrapRef.current.style.transform = `translateY(${offset}px)`
            }
            // Cards collapse in sync — details fade from t=0.3 to t=1
            if (cardDetailsRef.current) {
                const ct = Math.max(0, Math.min(1, (t - 0.3) / 0.7))
                const children = cardDetailsRef.current.querySelectorAll('[data-card-detail]')
                children.forEach(child => {
                    child.style.maxHeight = `${(1 - ct) * 60}px`
                    child.style.opacity = `${1 - ct}`
                })
                const cards = cardDetailsRef.current.querySelectorAll('[data-card]')
                cards.forEach(card => {
                    const py = 10 - ct * 4
                    card.style.padding = `${py}px 12px`
                })
                const headers = cardDetailsRef.current.querySelectorAll('[data-card-header]')
                headers.forEach(header => {
                    header.style.marginBottom = `${(1 - ct) * 6}px`
                })
            }
            // Hide balance footer in sync with graph shrink
            if (footerRef.current) {
                footerRef.current.style.maxHeight = `${(1 - t) * 60}px`
                footerRef.current.style.opacity = `${1 - t}`
                footerRef.current.style.overflow = 'hidden'
            }
        })
    }, [])
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
    const balanceNum = parseFloat(String(formData.balance || '0').replace(/,/g, ''))
    const overdraftNum = formData.overdraft ? parseFloat(String(formData.overdraft || '0').replace(/,/g, '')) : undefined
    const events = buildGraphEvents(formData)

    // Calculate totals
    const yearlyIncome = calcYearlyTotal(events, 'income')
    const yearlyExpense = calcYearlyTotal(events, 'expense')
    const weeklySpendTotal = events.filter(e => e.editType === 'weeklySpend' && !e.removed).reduce((s, e) => s + e.amount, 0)
    const fixedNet = yearlyIncome - yearlyExpense

    // Count active sources
    const activeIncomeCount = (formData.incomeSources || []).length
    const activeExpenseCount = (formData.expenseSources || []).length

    // Frequency multipliers for display
    const freqMultiplier = { Weekly: 1 / 52, Monthly: 1 / 12, Termly: 1 / (terms.length || 2), Yearly: 1 }
    const displayNet = Math.round(fixedNet * freqMultiplier[freqView])
    const freqSuffix = { Weekly: '/wk', Monthly: '/mo', Termly: '/term', Yearly: '/yr' }

    // Calculate per-source yearly amounts
    const getSourceYearly = (editTypes) => {
        return events.filter(e => editTypes.includes(e.editType) && !e.removed && !e.noDot).reduce((s, e) => s + e.amount, 0)
    }

    const toggleIncomeSource = (id) => {
        const sources = formData.incomeSources || []
        const next = sources.includes(id) ? sources.filter(s => s !== id) : [...sources, id]
        updateField('incomeSources', next)
    }

    const toggleExpenseSource = (id) => {
        const sources = formData.expenseSources || []
        const next = sources.includes(id) ? sources.filter(s => s !== id) : [...sources, id]
        updateField('expenseSources', next)
    }

    const handleBalanceSave = (val) => {
        updateField('balance', val)
        setShowBalanceEditor(false)
    }

    // Map source ids to editTypes for yearly calc
    const incomeEditTypeMap = {
        maintenance_loan: ['loan'],
        bursary: ['bursary'],
        family_friends: ['family'],
        work: ['work'],
        other_income: ['otherIncome'],
    }
    const expenseEditTypeMap = {
        rent: ['rent'],
        bills: ['bills'],
        uni_fees: ['uniFees'],
        savings_investments: ['savingsInv'],
    }

    // Map expandedSource to currentEventType for dot highlighting
    const sourceToEditType = { ...incomeEditTypeMap, ...expenseEditTypeMap }
    const currentEventType = expandedSource && sourceToEditType[expandedSource]
        ? sourceToEditType[expandedSource][0]
        : null

    const handleEventClick = useCallback((evt, e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        setEditingEvent({ ...evt, clickX: rect.left + rect.width / 2, clickY: rect.top })
        setEditAmount(String(evt.amount))
    }, [])

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
                    flex: 1, overflowY: activeTab === 'goals' ? 'hidden' : 'auto', overflowX: 'hidden',
                    WebkitOverflowScrolling: 'touch',
                    overscrollBehavior: 'none',
                    paddingBottom: 'calc(400px + env(safe-area-inset-bottom))',
                }}
            >
                {/* Graph + tabs — sticky, shrinks on scroll */}
                <div data-sticky-header style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', paddingTop: 16, paddingBottom: 12 }}>
                    <TermGraph
                        graphHeight={graphHeight}
                        graphHeightRef={graphContainerRef}
                        marginTop={0}
                        terms={terms}
                        balance={balanceNum || undefined}
                        overdraft={overdraftNum}
                        events={events}
                        hiddenEventTypes={[
                            ...(!showIncome ? ['loan', 'bursary', 'family', 'work', 'otherIncome'] : []),
                            ...(!showExpenses ? ['rent', 'bills', 'uniFees', 'savingsInv', 'weeklySpend', 'oneOff'] : []),
                        ].filter(t => t !== currentEventType)}
                        currentEventType={currentEventType}
                        onEventClick={handleEventClick}
                        showIncome={showIncome}
                        onToggleIncome={() => setShowIncome(prev => !prev)}
                        showExpenses={showExpenses}
                        onToggleExpenses={() => setShowExpenses(prev => !prev)}
                        footer={
                            <div ref={footerRef} style={{
                                padding: '6px 0px 4px 10px',
                                display: 'flex', alignItems: 'center',
                                justifyContent: 'space-between',
                            }}>
                                <div>
                                    <p style={{
                                        fontSize: 8, fontWeight: 800,
                                        color: '#838383', margin: 0,
                                        letterSpacing: 0.5,
                                        textTransform: 'uppercase',
                                        fontFamily: 'Nunito, sans-serif',
                                    }}>Current Balance</p>
                                    <p style={{
                                        fontSize: 16, fontWeight: 800,
                                        color: '#000', margin: '2px 0 0',
                                        fontFamily: 'Nunito, sans-serif',
                                    }}>
                                        £{Math.abs(balanceNum).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                                    <button
                                        onClick={() => setShowBalanceEditor(true)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 4,
                                            background: '#147b75', border: 'none',
                                            borderRadius: 8, padding: '5px 10px',
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 10px rgba(20,123,117,0.15)',
                                        }}
                                    >
                                        <RefreshIcon size={9} />
                                        <span style={{
                                            fontSize: 9, fontWeight: 700,
                                            color: '#fff', fontFamily: 'Nunito, sans-serif',
                                        }}>Update Balance</span>
                                    </button>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <span style={{
                                            fontSize: 8, fontWeight: 700,
                                            color: '#5e5e5e', fontFamily: 'Nunito, sans-serif',
                                        }}>Balance History</span>
                                        <ToggleSwitch
                                            on={showBalanceHistory}
                                            onChange={setShowBalanceHistory}
                                            size="tiny"
                                            activeColor="#EC8C17"
                                        />
                                    </div>
                                </div>
                            </div>
                        }
                    />

                {/* Summary cards */}
                <div ref={cardDetailsRef} style={{
                    display: 'flex', gap: 10,
                    padding: '16px 16px 0',
                }}>
                    {/* Fixed card */}
                    <div data-card onClick={() => setActiveTab('fixed')} style={{
                        flex: 1, borderRadius: 10,
                        cursor: 'pointer',
                        background: activeTab === 'fixed' ? '#fff' : '#f3f3f3',
                        borderTop: activeTab === 'fixed' ? '2px solid #7eb6b3' : '0.25px solid #c6c6c6',
                        borderLeft: activeTab === 'fixed' ? '0.25px solid #7eb6b3' : '0.25px solid #c6c6c6',
                        borderRight: activeTab === 'fixed' ? '0.25px solid #7eb6b3' : '0.25px solid #c6c6c6',
                        borderBottom: activeTab === 'fixed' ? '0.25px solid #7eb6b3' : '0.25px solid #c6c6c6',
                        boxShadow: activeTab === 'fixed' ? '0 4px 10px rgba(20,123,117,0.1)' : 'none',
                        padding: '10px 12px',
                        overflow: 'hidden',
                    }}>
                        <div data-card-header style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                <rect x="3" y="4" width="18" height="18" rx="2" stroke={activeTab === 'fixed' ? '#000' : '#838383'} strokeWidth="2" />
                                <path d="M16 2v4M8 2v4M3 10h18" stroke={activeTab === 'fixed' ? '#000' : '#838383'} strokeWidth="2" strokeLinecap="round" />
                            </svg>
                            <span style={{ fontSize: 11, fontWeight: 700, color: activeTab === 'fixed' ? '#000' : '#838383' }}>Fixed</span>
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
                            }}>{activeIncomeCount} income &bull; {activeExpenseCount} expense</p>
                        </div>
                    </div>

                    {/* Variable card */}
                    <div data-card onClick={() => setActiveTab('variable')} style={{
                        flex: 1, borderRadius: 10,
                        cursor: 'pointer',
                        background: activeTab === 'variable' ? '#fff' : '#f3f3f3',
                        borderTop: activeTab === 'variable' ? '2px solid #7eb6b3' : '0.25px solid #c6c6c6',
                        borderLeft: activeTab === 'variable' ? '0.25px solid #7eb6b3' : '0.25px solid #c6c6c6',
                        borderRight: activeTab === 'variable' ? '0.25px solid #7eb6b3' : '0.25px solid #c6c6c6',
                        borderBottom: activeTab === 'variable' ? '0.25px solid #7eb6b3' : '0.25px solid #c6c6c6',
                        boxShadow: activeTab === 'variable' ? '0 4px 10px rgba(20,123,117,0.1)' : 'none',
                        padding: '10px 12px',
                        overflow: 'hidden',
                    }}>
                        <div data-card-header style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                            <svg width="14" height="12" viewBox="0 0 24 20" fill="none">
                                <path d="M1 17L5 9L10 13L15 5L23 1" stroke={activeTab === 'variable' ? '#000' : '#838383'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span style={{ fontSize: 11, fontWeight: 700, color: activeTab === 'variable' ? '#000' : '#838383' }}>Variable</span>
                        </div>
                        <div data-card-detail style={{ overflow: 'hidden' }}>
                            <p style={{
                                fontSize: 18, fontWeight: 700, color: '#147b75', margin: '0 0 2px',
                            }}>
                                -£{Math.round(parseFloat(formData.weeklySpend || '0'))}/wk
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

                    {/* Goals card */}
                    <div data-card onClick={() => setActiveTab('goals')} style={{
                        flex: 1, borderRadius: 10,
                        cursor: 'pointer',
                        background: activeTab === 'goals' ? '#fff' : '#f3f3f3',
                        borderTop: activeTab === 'goals' ? '2px solid #838383' : '0.25px solid #c6c6c6',
                        borderLeft: activeTab === 'goals' ? '0.25px solid #838383' : '0.25px solid #c6c6c6',
                        borderRight: activeTab === 'goals' ? '0.25px solid #838383' : '0.25px solid #c6c6c6',
                        borderBottom: activeTab === 'goals' ? '0.25px solid #838383' : '0.25px solid #c6c6c6',
                        boxShadow: activeTab === 'goals' ? '0 4px 10px rgba(0,0,0,0.05)' : 'none',
                        padding: '10px 12px',
                        overflow: 'hidden',
                    }}>
                        <div data-card-header style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="10" stroke={activeTab === 'goals' ? '#000' : '#838383'} strokeWidth="2" />
                                <circle cx="12" cy="12" r="6" stroke={activeTab === 'goals' ? '#000' : '#838383'} strokeWidth="2" />
                                <circle cx="12" cy="12" r="2" fill={activeTab === 'goals' ? '#000' : '#838383'} />
                            </svg>
                            <span style={{ fontSize: 11, fontWeight: 700, color: activeTab === 'goals' ? '#000' : '#838383' }}>Goals</span>
                        </div>
                        <div data-card-detail style={{ overflow: 'hidden' }}>
                            <p style={{
                                fontSize: 14, fontWeight: 700, color: '#4b4a4a', margin: 0,
                            }}>—</p>
                        </div>
                    </div>
                </div>
                </div>

                {/* Content below — held in place during graph shrink */}
                <div ref={contentWrapRef} style={{ willChange: 'transform' }}>

                {activeTab === 'fixed' && (<>
                {/* Regular Income Section */}
                <div style={{ padding: '20px 16px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <ArrowUpCircle />
                        <span style={{
                            fontSize: 16, fontWeight: 700, color: '#000',
                        }}>Regular Income</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {INCOME_SOURCES.map(source => {
                            const active = (formData.incomeSources || []).includes(source.id)
                            const yearly = getSourceYearly(incomeEditTypeMap[source.id] || [])
                            const isExpanded = expandedSource === source.id

                            return (
                                <SourceRow
                                    key={source.id}
                                    source={source}
                                    active={active}
                                    yearlyAmount={yearly}
                                    expanded={isExpanded}
                                    onToggle={() => toggleIncomeSource(source.id)}
                                    onExpandToggle={() => setExpandedSource(isExpanded ? null : source.id)}
                                    scrollContainerRef={scrollRef}
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
                                        />
                                    )}
                                    {source.id === 'other_income' && (
                                        <OtherIncomeStep compact
                                            otherIncomeAmount={formData.otherIncomeAmount}
                                            updateOtherIncomeAmount={(val) => updateField('otherIncomeAmount', val)}
                                            otherIncomeFrequency={formData.otherIncomeFrequency}
                                            updateOtherIncomeFrequency={(val) => updateField('otherIncomeFrequency', val)}
                                            otherIncomeLabel={formData.otherIncomeLabel}
                                            updateOtherIncomeLabel={(val) => updateField('otherIncomeLabel', val)}
                                            otherIncomeNextDate={formData.otherIncomeNextDate}
                                            updateOtherIncomeNextDate={(val) => updateField('otherIncomeNextDate', val)}
                                            terms={formData.termDates?.terms || []}
                                            otherIncomeTermDates={formData.otherIncomeTermDates}
                                            updateOtherIncomeTermDates={(val) => updateField('otherIncomeTermDates', val)}
                                            otherIncomeVariesByTerm={formData.otherIncomeVariesByTerm}
                                            updateOtherIncomeVariesByTerm={(val) => updateField('otherIncomeVariesByTerm', val)}
                                            otherIncomeNonTermAmount={formData.otherIncomeNonTermAmount}
                                            updateOtherIncomeNonTermAmount={(val) => updateField('otherIncomeNonTermAmount', val)}
                                            otherIncomeEntryMode={formData.otherIncomeEntryMode}
                                            updateOtherIncomeEntryMode={(val) => updateField('otherIncomeEntryMode', val)}
                                        />
                                    )}
                                </SourceRow>
                            )
                        })}
                    </div>
                </div>

                {/* Regular Expenses Section */}
                <div style={{ padding: '20px 16px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <ArrowDownCircle />
                        <span style={{
                            fontSize: 16, fontWeight: 700, color: '#000',
                        }}>Regular Expenses</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {EXPENSE_SOURCES.map(source => {
                            const active = (formData.expenseSources || []).includes(source.id)
                            const yearly = getSourceYearly(expenseEditTypeMap[source.id] || [])

                            return (
                                <SourceRow
                                    key={source.id}
                                    source={source}
                                    active={active}
                                    yearlyAmount={yearly}
                                    expanded={expandedSource === source.id}
                                    onToggle={() => toggleExpenseSource(source.id)}
                                    onExpandToggle={() => setExpandedSource(expandedSource === source.id ? null : source.id)}
                                    scrollContainerRef={scrollRef}
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
                                        />
                                    )}
                                </SourceRow>
                            )
                        })}
                    </div>
                </div>
                {/* Spacer so expanded dropdown can scroll to top */}
                {expandedSource && <div style={{ height: '10vh' }} />}
                </>)}

                {activeTab === 'goals' && (
                <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                    <p style={{
                        fontSize: 15, fontWeight: 600,
                        fontFamily: 'Nunito, sans-serif',
                        color: '#9f9c9c',
                    }}>Goals coming soon</p>
                </div>
                )}

                {activeTab === 'variable' && (
                <div style={{ padding: '20px 16px 0' }}>
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
                        />
                    </div>
                </div>
                )}


                </div>
            </div>

            {/* Balance editor modal */}
            {showBalanceEditor && (
                <BalanceEditor
                    value={formData.balance}
                    onSave={handleBalanceSave}
                    onCancel={() => setShowBalanceEditor(false)}
                />
            )}

            {/* Event edit popup */}
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
                                    New balance: £{Math.round(editingEvent.balanceAfter).toLocaleString()}
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', flex: 1,
                                        background: '#f5f5f5', borderRadius: 5,
                                        padding: '0 6px', height: 24, gap: 2,
                                    }}>
                                        <span style={{
                                            fontSize: 11, fontWeight: 600,
                                            color: '#aaa', fontFamily: 'Nunito, sans-serif',
                                        }}>£</span>
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
                                    <button
                                        onClick={() => {
                                            const key = `${editingEvent.editType}:${editingEvent.date}`
                                            updateField('removedEvents', [...(formData.removedEvents || []), key])
                                            setEditingEvent(null)
                                        }}
                                        style={{
                                            width: 24, height: 24,
                                            border: 'none', borderRadius: 5,
                                            background: '#fee',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer', flexShrink: 0,
                                        }}
                                    >
                                        <svg width="11" height="12" viewBox="0 0 24 24" fill="none" stroke="#e06470" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="3 6 5 6 21 6" />
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                        </svg>
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )
            })()}
        </div>
    )
}
