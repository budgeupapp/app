import { useState, useEffect, useRef, useCallback } from 'react'
import { Button, Input, Modal, Radio, Typography, message } from 'antd'
import StepProgress from '../components/StepProgress'
import NativeSelect from '../components/NativeSelect'
import universityIllustration from '../assets/university-illustration.svg'
import TermDatesStep from './TermDatesStep'
import TermGraph from '../components/TermGraph'
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
    INITIAL_FORM_DATA
} from '../config/onboardingConfig'

const { Title, Text } = Typography

const STORAGE_KEY = 'budgeup_onboarding_state'

/* ---------- HELPERS ---------- */

const formatMoney = raw => {
    const cleaned = raw.replace(/[^0-9.]/g, '')
    const parts = cleaned.split('.')
    const whole = parts[0] || ''
    const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return parts.length > 1 ? `${formatted}.${parts[1]}` : formatted
}

/* ---------- GRAPH EVENT HELPERS ---------- */

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
    const ayStart = new Date(2025, 8, 1) // Sept 1 2025
    const ayEnd = new Date(2026, 7, 31)

    if (!frequency) return dates

    // For weekly: generate actual weekly dates
    if (frequency === 'weekly') {
        let d = nextDate ? new Date(nextDate + 'T00:00:00') : new Date(2025, 8, 1)
        // Walk back to find the first weekly date on or after ayStart
        while (d > ayStart) d = new Date(d.getTime() - 7 * 24 * 60 * 60 * 1000)
        while (d < ayStart) d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
        while (d <= ayEnd) {
            dates.push(d.toISOString().split('T')[0])
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

    // Quarterly: use exact dates if provided, otherwise generate
    if (frequency === 'quarterly' && formData.rentQuarterlyDates) {
        const qDates = formData.rentQuarterlyDates
        for (const date of Object.values(qDates)) {
            if (!date) continue
            const d = new Date(date + 'T00:00:00')
            if (d >= ayStart && d <= ayEnd) {
                dates.push(date)
            }
        }
        dates.sort()
        return dates
    }

    // Monthly / quarterly fallback — start from Sept 2025 or next date
    let current = nextDate ? new Date(nextDate + 'T00:00:00') : new Date(2025, 8, 1)
    const maxEvents = 12
    let count = 0
    while (current <= ayEnd && count < maxEvents) {
        if (current >= ayStart) {
            dates.push(current.toISOString().split('T')[0])
            count++
        }
        switch (frequency) {
            case 'monthly':
                current = new Date(current.getFullYear(), current.getMonth() + 1, current.getDate()); break
            case 'quarterly':
                current = new Date(current.getFullYear(), current.getMonth() + 3, current.getDate()); break
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

// Distribute total evenly across count instalments, ensuring they sum exactly to total
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

    // Maintenance loan income events
    if (formData.incomeSources?.includes('maintenance_loan')) {
        const months = formData.loanMonths || DEFAULT_LOAN_MONTHS
        const totalAmount = parseFloat(String(formData.loanAmount || '0').replace(/,/g, ''))

        const loanAmounts = distributeEvenly(totalAmount, months.length)
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

        const bursaryAmounts = distributeEvenly(totalAmount, months.length)
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
        const famAmt = parseFloat(String(formData.familyAmount || '0').replace(/,/g, ''))
        const famNonTermAmt = formData.familyVariesByTerm ? parseFloat(String(formData.familyNonTermAmount || '0').replace(/,/g, '')) : famAmt
        const freq = formData.familyFrequency
        if ((famAmt > 0 || famNonTermAmt > 0) && freq) {
            const ayStart = new Date(2025, 8, 1)
            const ayEnd = new Date(2026, 7, 31)
            const getFamAmt = (dateStr) => formData.familyVariesByTerm ? (isInTerm(dateStr, terms) ? famAmt : famNonTermAmt) : famAmt
            if (freq === 'weekly') {
                let d = formData.familyNextDate ? new Date(formData.familyNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                while (d > ayStart) d = new Date(d.getTime() - 7 * 24 * 60 * 60 * 1000)
                while (d < ayStart) d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
                while (d <= ayEnd) {
                    const dateStr = d.toISOString().split('T')[0]
                    const amt = getFamAmt(dateStr)
                    if (amt > 0) {
                        events.push({
                            date: dateStr, amount: amt, type: 'income',
                            label: 'Family/Friends', sublabel: 'Weekly support',
                            editType: 'family',
                        })
                    }
                    d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
                }
            } else if (freq === 'monthly') {
                let d = formData.familyNextDate ? new Date(formData.familyNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                while (d > ayEnd) d = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
                while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
                const dayOfMonth = d.getDate()
                while (d <= ayEnd) {
                    const dateStr = d.toISOString().split('T')[0]
                    const amt = getFamAmt(dateStr)
                    if (amt > 0) {
                        events.push({
                            date: dateStr, amount: amt, type: 'income',
                            label: 'Family/Friends', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} support`,
                            editType: 'family',
                        })
                    }
                    d = new Date(d.getFullYear(), d.getMonth() + 1, dayOfMonth)
                }
            } else if (freq === 'termly') {
                const overrides = formData.familyTermDates || {}
                for (const term of terms) {
                    const date = overrides[term.id] || term.start
                    if (!date) continue
                    events.push({
                        date, amount: famAmt, type: 'income',
                        label: 'Family/Friends', sublabel: `${term.name} support`,
                        editType: 'family',
                    })
                }
            } else if (freq === 'quarterly') {
                const qDates = formData.familyQuarterlyDates || {}
                const QUARTER_DEFAULTS = ['2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01']
                for (let i = 0; i < 4; i++) {
                    const date = qDates[i] || QUARTER_DEFAULTS[i]
                    const amt = getFamAmt(date)
                    if (amt > 0) {
                        events.push({
                            date, amount: amt, type: 'income',
                            label: 'Family/Friends', sublabel: `Q${i + 1} support`,
                            editType: 'family',
                        })
                    }
                }
            }
        }
    }

    // Work events
    if (formData.incomeSources?.includes('work')) {
        const workAmt = parseFloat(String(formData.workAmount || '0').replace(/,/g, ''))
        const workNonTermAmt = formData.workVariesByTerm ? parseFloat(String(formData.workNonTermAmount || '0').replace(/,/g, '')) : workAmt
        const workMode = formData.workEntryMode || 'yearly'

        if (workAmt > 0) {
            const ayStart = new Date(2025, 8, 1)
            const ayEnd = new Date(2026, 7, 31)

            if (workMode === 'yearly') {
                // Year total: distribute based on chosen frequency
                const freq = formData.workFrequency || 'monthly'
                if (freq === 'weekly') {
                    let d = formData.workNextDate ? new Date(formData.workNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 24 * 60 * 60 * 1000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
                    let count = 0
                    let tmp = new Date(d)
                    while (tmp <= ayEnd) { count++; tmp = new Date(tmp.getTime() + 7 * 24 * 60 * 60 * 1000) }
                    const amounts = distributeEvenly(workAmt, count)
                    let idx = 0
                    while (d <= ayEnd) {
                        const dateStr = d.toISOString().split('T')[0]
                        events.push({
                            date: dateStr, amount: amounts[idx++], type: 'income',
                            label: 'Work', sublabel: 'Weekly income',
                            editType: 'work',
                        })
                        d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
                    }
                } else if (freq === 'monthly') {
                    let d = formData.workNextDate ? new Date(formData.workNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayEnd) d = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
                    const dayOfMonth = d.getDate()
                    let mCount = 0; let mt = new Date(d)
                    while (mt <= ayEnd) { mCount++; mt = new Date(mt.getFullYear(), mt.getMonth() + 1, dayOfMonth) }
                    const amounts = distributeEvenly(workAmt, mCount)
                    let idx = 0
                    while (d <= ayEnd) {
                        events.push({
                            date: d.toISOString().split('T')[0], amount: amounts[idx++], type: 'income',
                            label: 'Work', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} income`,
                            editType: 'work',
                        })
                        d = new Date(d.getFullYear(), d.getMonth() + 1, dayOfMonth)
                    }
                } else if (freq === 'termly') {
                    const overrides = formData.workTermDates || {}
                    const amounts = distributeEvenly(workAmt, terms.length)
                    for (let ti = 0; ti < terms.length; ti++) {
                        const term = terms[ti]
                        const date = overrides[term.id] || term.start
                        if (!date) continue
                        events.push({
                            date, amount: amounts[ti], type: 'income',
                            label: 'Work', sublabel: `${term.name} income`,
                            editType: 'work',
                        })
                    }
                } else if (freq === 'yearly') {
                    events.push({
                        date: formData.workNextDate || '2025-09-01', amount: workAmt, type: 'income',
                        label: 'Work', sublabel: 'Yearly income',
                        editType: 'work',
                    })
                }
            } else {
                // Per instalment: frequency-based with optional term/non-term amounts
                const freq = formData.workFrequency
                const getWorkAmt = (dateStr) => formData.workVariesByTerm ? (isInTerm(dateStr, terms) ? workAmt : workNonTermAmt) : workAmt
                if (freq) {
                    if (freq === 'weekly') {
                        let d = formData.workNextDate ? new Date(formData.workNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                        while (d > ayStart) d = new Date(d.getTime() - 7 * 24 * 60 * 60 * 1000)
                        while (d < ayStart) d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
                        while (d <= ayEnd) {
                            const dateStr = d.toISOString().split('T')[0]
                            const amt = getWorkAmt(dateStr)
                            if (amt > 0) {
                                events.push({
                                    date: dateStr, amount: amt, type: 'income',
                                    label: 'Work', sublabel: 'Weekly income',
                                    editType: 'work',
                                })
                            }
                            d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
                        }
                    } else if (freq === 'monthly') {
                        let d = formData.workNextDate ? new Date(formData.workNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                        while (d > ayEnd) d = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
                        while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
                        const dayOfMonth = d.getDate()
                        while (d <= ayEnd) {
                            const dateStr = d.toISOString().split('T')[0]
                            const amt = getWorkAmt(dateStr)
                            if (amt > 0) {
                                events.push({
                                    date: dateStr, amount: amt, type: 'income',
                                    label: 'Work', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} income`,
                                    editType: 'work',
                                })
                            }
                            d = new Date(d.getFullYear(), d.getMonth() + 1, dayOfMonth)
                        }
                    } else if (freq === 'termly') {
                        const overrides = formData.workTermDates || {}
                        for (const term of terms) {
                            const date = overrides[term.id] || term.start
                            if (!date) continue
                            events.push({
                                date, amount: workAmt, type: 'income',
                                label: 'Work', sublabel: `${term.name} income`,
                                editType: 'work',
                            })
                        }
                    } else if (freq === 'yearly') {
                        if (workAmt > 0) {
                            events.push({
                                date: formData.workNextDate || '2025-09-01', amount: workAmt, type: 'income',
                                label: 'Work', sublabel: 'Yearly income',
                                editType: 'work',
                            })
                        }
                    }
                }
            }
        }
    }



    // Other income events
    if (formData.incomeSources?.includes('other_income')) {
        const otherAmt = parseFloat(String(formData.otherIncomeAmount || '0').replace(/,/g, ''))
        const otherNonTermAmt = formData.otherIncomeVariesByTerm ? parseFloat(String(formData.otherIncomeNonTermAmount || '0').replace(/,/g, '')) : otherAmt
        const freq = formData.otherIncomeFrequency
        const lbl = formData.otherIncomeLabel || 'Other Income'
        const otherMode = formData.otherIncomeEntryMode || 'yearly'
        const getOtherAmt = (dateStr) => formData.otherIncomeVariesByTerm ? (isInTerm(dateStr, terms) ? otherAmt : otherNonTermAmt) : otherAmt

        if (otherAmt > 0 && freq) {
            const ayStart = new Date(2025, 8, 1)
            const ayEnd = new Date(2026, 7, 31)

            if (otherMode === 'yearly') {
                // Year total: distribute based on chosen frequency
                if (freq === 'weekly') {
                    let d = formData.otherIncomeNextDate ? new Date(formData.otherIncomeNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 24 * 60 * 60 * 1000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
                    let count = 0
                    let tmp = new Date(d)
                    while (tmp <= ayEnd) { count++; tmp = new Date(tmp.getTime() + 7 * 24 * 60 * 60 * 1000) }
                    const amounts = distributeEvenly(otherAmt, count)
                    let idx = 0
                    while (d <= ayEnd) {
                        const dateStr = d.toISOString().split('T')[0]
                        events.push({
                            date: dateStr, amount: amounts[idx++], type: 'income',
                            label: lbl, sublabel: 'Weekly',
                            editType: 'otherIncome',
                        })
                        d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
                    }
                } else if (freq === 'monthly') {
                    let d = formData.otherIncomeNextDate ? new Date(formData.otherIncomeNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayEnd) d = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
                    const dayOfMonth = d.getDate()
                    let mCount = 0; let mt = new Date(d)
                    while (mt <= ayEnd) { mCount++; mt = new Date(mt.getFullYear(), mt.getMonth() + 1, dayOfMonth) }
                    const amounts = distributeEvenly(otherAmt, mCount)
                    let idx = 0
                    while (d <= ayEnd) {
                        events.push({
                            date: d.toISOString().split('T')[0], amount: amounts[idx++], type: 'income',
                            label: lbl, sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })}`,
                            editType: 'otherIncome',
                        })
                        d = new Date(d.getFullYear(), d.getMonth() + 1, dayOfMonth)
                    }
                } else if (freq === 'termly') {
                    const overrides = formData.otherIncomeTermDates || {}
                    const amounts = distributeEvenly(otherAmt, terms.length)
                    for (let ti = 0; ti < terms.length; ti++) {
                        const term = terms[ti]
                        const date = overrides[term.id] || term.start
                        if (!date) continue
                        events.push({
                            date, amount: amounts[ti], type: 'income',
                            label: lbl, sublabel: `${term.name}`,
                            editType: 'otherIncome',
                        })
                    }
                } else if (freq === 'yearly') {
                    events.push({
                        date: formData.otherIncomeNextDate || '2025-09-01', amount: otherAmt, type: 'income',
                        label: lbl, sublabel: 'Yearly income',
                        editType: 'otherIncome',
                    })
                }
            } else {
                // Per instalment: frequency-based with optional term/non-term amounts
                if (freq === 'weekly') {
                    let d = formData.otherIncomeNextDate ? new Date(formData.otherIncomeNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 24 * 60 * 60 * 1000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
                    while (d <= ayEnd) {
                        const dateStr = d.toISOString().split('T')[0]
                        const amt = getOtherAmt(dateStr)
                        if (amt > 0) {
                            events.push({
                                date: dateStr, amount: amt, type: 'income',
                                label: lbl, sublabel: 'Weekly',
                                editType: 'otherIncome',
                            })
                        }
                        d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
                    }
                } else if (freq === 'monthly') {
                    let d = formData.otherIncomeNextDate ? new Date(formData.otherIncomeNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayEnd) d = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
                    const dayOfMonth = d.getDate()
                    while (d <= ayEnd) {
                        const dateStr = d.toISOString().split('T')[0]
                        const amt = getOtherAmt(dateStr)
                        if (amt > 0) {
                            events.push({
                                date: dateStr, amount: amt, type: 'income',
                                label: lbl, sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })}`,
                                editType: 'otherIncome',
                            })
                        }
                        d = new Date(d.getFullYear(), d.getMonth() + 1, dayOfMonth)
                    }
                } else if (freq === 'termly') {
                    const overrides = formData.otherIncomeTermDates || {}
                    for (const term of terms) {
                        const date = overrides[term.id] || term.start
                        if (!date) continue
                        events.push({
                            date, amount: otherAmt, type: 'income',
                            label: lbl, sublabel: `${term.name}`,
                            editType: 'otherIncome',
                        })
                    }
                } else if (freq === 'yearly') {
                    if (otherAmt > 0) {
                        events.push({
                            date: formData.otherIncomeNextDate || '2025-09-01', amount: otherAmt, type: 'income',
                            label: lbl, sublabel: 'Yearly income',
                            editType: 'otherIncome',
                        })
                    }
                }
            }
        }
    }

    // Rent expense events
    const rentAmt = parseFloat(String(formData.rentAmount || '0').replace(/,/g, ''))
    if (rentAmt > 0 && formData.rentFrequency) {
        const rentDates = generateRentDates(formData.rentFrequency, formData.rentNextDate, formData)
        const isYearly = formData.rentEntryMode === 'yearly'
        const rentAmounts = isYearly ? distributeEvenly(rentAmt, rentDates.length) : rentDates.map(() => rentAmt)

        for (let ri = 0; ri < rentDates.length; ri++) {
            const date = rentDates[ri]
            const dt = new Date(date + 'T00:00:00')
            const monthName = dt.toLocaleDateString('en-GB', { month: 'long' })
            events.push({
                date,
                amount: rentAmounts[ri],
                type: 'expense',
                label: 'Rent',
                sublabel: `${monthName} rent`,
                editType: 'rent',
            })
        }
    }

    // Bills expense events
    const billsAmt = parseFloat(String(formData.billsAmount || '0').replace(/,/g, ''))
    if (billsAmt > 0 && formData.billsFrequency) {
        const billsMode = formData.billsEntryMode || 'yearly'
        const freq = formData.billsFrequency
        const ayStart = new Date(2025, 8, 1)
        const ayEnd = new Date(2026, 7, 31)

        if (billsMode === 'yearly') {
            // Year total: distribute based on chosen frequency
            if (freq === 'weekly') {
                let d = formData.billsNextDate ? new Date(formData.billsNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                while (d > ayStart) d = new Date(d.getTime() - 7 * 24 * 60 * 60 * 1000)
                while (d < ayStart) d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
                let count = 0
                let tmp = new Date(d)
                while (tmp <= ayEnd) { count++; tmp = new Date(tmp.getTime() + 7 * 24 * 60 * 60 * 1000) }
                const amounts = distributeEvenly(billsAmt, count)
                let idx = 0
                while (d <= ayEnd) {
                    events.push({
                        date: d.toISOString().split('T')[0], amount: amounts[idx++], type: 'expense',
                        label: 'Bills', sublabel: 'Weekly bills',
                        editType: 'bills',
                    })
                    d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
                }
            } else if (freq === 'monthly') {
                let d = formData.billsNextDate ? new Date(formData.billsNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                while (d > ayEnd) d = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
                while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
                const dayOfMonth = d.getDate()
                let mCount = 0; let mt = new Date(d)
                while (mt <= ayEnd) { mCount++; mt = new Date(mt.getFullYear(), mt.getMonth() + 1, dayOfMonth) }
                const amounts = distributeEvenly(billsAmt, mCount)
                let idx = 0
                while (d <= ayEnd) {
                    events.push({
                        date: d.toISOString().split('T')[0], amount: amounts[idx++], type: 'expense',
                        label: 'Bills', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} bills`,
                        editType: 'bills',
                    })
                    d = new Date(d.getFullYear(), d.getMonth() + 1, dayOfMonth)
                }
            } else if (freq === 'termly') {
                const overrides = formData.billsTermDates || {}
                const amounts = distributeEvenly(billsAmt, terms.length)
                for (let ti = 0; ti < terms.length; ti++) {
                    const term = terms[ti]
                    const date = overrides[term.id] || term.start
                    if (!date) continue
                    events.push({
                        date, amount: amounts[ti], type: 'expense',
                        label: 'Bills', sublabel: `${term.name} bills`,
                        editType: 'bills',
                    })
                }
            } else if (freq === 'yearly') {
                events.push({
                    date: formData.billsNextDate || '2025-09-01', amount: billsAmt, type: 'expense',
                    label: 'Bills', sublabel: 'Yearly bills',
                    editType: 'bills',
                })
            }
        } else {
            // Per instalment
            if (freq === 'weekly') {
                let d = formData.billsNextDate ? new Date(formData.billsNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                while (d > ayStart) d = new Date(d.getTime() - 7 * 24 * 60 * 60 * 1000)
                while (d < ayStart) d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
                while (d <= ayEnd) {
                    events.push({
                        date: d.toISOString().split('T')[0], amount: billsAmt, type: 'expense',
                        label: 'Bills', sublabel: 'Weekly bills',
                        editType: 'bills',
                    })
                    d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
                }
            } else if (freq === 'monthly') {
                let d = formData.billsNextDate ? new Date(formData.billsNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                while (d > ayEnd) d = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
                while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
                const dayOfMonth = d.getDate()
                while (d <= ayEnd) {
                    events.push({
                        date: d.toISOString().split('T')[0], amount: billsAmt, type: 'expense',
                        label: 'Bills', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} bills`,
                        editType: 'bills',
                    })
                    d = new Date(d.getFullYear(), d.getMonth() + 1, dayOfMonth)
                }
            } else if (freq === 'termly') {
                const overrides = formData.billsTermDates || {}
                for (const term of terms) {
                    const date = overrides[term.id] || term.start
                    if (!date) continue
                    events.push({
                        date, amount: billsAmt, type: 'expense',
                        label: 'Bills', sublabel: `${term.name} bills`,
                        editType: 'bills',
                    })
                }
            } else if (freq === 'yearly') {
                events.push({
                    date: formData.billsNextDate || '2025-09-01', amount: billsAmt, type: 'expense',
                    label: 'Bills', sublabel: 'Yearly bills',
                    editType: 'bills',
                })
            }
        }
    }

    // University fees events
    if (formData.expenseSources?.includes('uni_fees')) {
        const uniAmt = parseFloat(String(formData.uniFeesAmount || '0').replace(/,/g, ''))
        if (uniAmt > 0) {
            const uniFreq = formData.uniFeesFrequency || 'yearly'
            const uniMode = formData.uniFeesEntryMode || 'yearly'
            const ayStart = new Date(2025, 8, 1), ayEnd = new Date(2026, 7, 31)
            if (uniFreq === 'yearly') {
                events.push({ date: formData.uniFeesNextDate || '2025-10-27', amount: uniAmt, type: 'expense', label: 'University Fees', sublabel: 'Yearly tuition', editType: 'uniFees' })
            } else if (uniFreq === 'monthly') {
                if (uniMode === 'yearly') {
                    let d = formData.uniFeesNextDate ? new Date(formData.uniFeesNextDate + 'T00:00:00') : new Date('2025-10-27T00:00:00')
                    while (d > ayEnd) d = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
                    const dom = d.getDate()
                    let mCount = 0; let mt = new Date(d)
                    while (mt <= ayEnd) { mCount++; mt = new Date(mt.getFullYear(), mt.getMonth() + 1, dom) }
                    const amounts = distributeEvenly(uniAmt, mCount)
                    let idx = 0
                    while (d <= ayEnd) {
                        events.push({ date: d.toISOString().split('T')[0], amount: amounts[idx++], type: 'expense', label: 'University Fees', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} fees`, editType: 'uniFees' })
                        d = new Date(d.getFullYear(), d.getMonth() + 1, dom)
                    }
                } else {
                    let d = formData.uniFeesNextDate ? new Date(formData.uniFeesNextDate + 'T00:00:00') : new Date('2025-10-27T00:00:00')
                    while (d > ayEnd) d = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
                    const dom = d.getDate()
                    while (d <= ayEnd) {
                        events.push({ date: d.toISOString().split('T')[0], amount: uniAmt, type: 'expense', label: 'University Fees', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} fees`, editType: 'uniFees' })
                        d = new Date(d.getFullYear(), d.getMonth() + 1, dom)
                    }
                }
            } else if (uniFreq === 'termly') {
                const overrides = formData.uniFeesTermDates || {}
                if (uniMode === 'yearly') {
                    const amounts = distributeEvenly(uniAmt, terms.length)
                    for (let ti = 0; ti < terms.length; ti++) {
                        const term = terms[ti]
                        const date = overrides[term.id] || term.start
                        if (date) events.push({ date, amount: amounts[ti], type: 'expense', label: 'University Fees', sublabel: `${term.name} fees`, editType: 'uniFees' })
                    }
                } else {
                    for (const term of terms) {
                        const date = overrides[term.id] || term.start
                        if (date) events.push({ date, amount: uniAmt, type: 'expense', label: 'University Fees', sublabel: `${term.name} fees`, editType: 'uniFees' })
                    }
                }
            }
        }
    }

    // Savings & Investments events
    if (formData.expenseSources?.includes('savings_investments')) {
        const savAmt = parseFloat(String(formData.savingsInvAmount || '0').replace(/,/g, ''))
        if (savAmt > 0 && formData.savingsInvFrequency) {
            const savMode = formData.savingsInvEntryMode || 'yearly'
            const freq = formData.savingsInvFrequency
            const ayStart = new Date(2025, 8, 1), ayEnd = new Date(2026, 7, 31)
            if (savMode === 'yearly') {
                if (freq === 'weekly') {
                    let d = formData.savingsInvNextDate ? new Date(formData.savingsInvNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 24 * 60 * 60 * 1000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
                    let count = 0; let tmp = new Date(d)
                    while (tmp <= ayEnd) { count++; tmp = new Date(tmp.getTime() + 7 * 24 * 60 * 60 * 1000) }
                    const amounts = distributeEvenly(savAmt, count)
                    let idx = 0
                    while (d <= ayEnd) {
                        events.push({ date: d.toISOString().split('T')[0], amount: amounts[idx++], type: 'expense', label: 'Savings', sublabel: 'Weekly savings', editType: 'savingsInv' })
                        d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
                    }
                } else if (freq === 'monthly') {
                    let d = formData.savingsInvNextDate ? new Date(formData.savingsInvNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayEnd) d = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
                    const dom = d.getDate()
                    let mCount = 0; let mt = new Date(d)
                    while (mt <= ayEnd) { mCount++; mt = new Date(mt.getFullYear(), mt.getMonth() + 1, dom) }
                    const amounts = distributeEvenly(savAmt, mCount)
                    let idx = 0
                    while (d <= ayEnd) {
                        events.push({ date: d.toISOString().split('T')[0], amount: amounts[idx++], type: 'expense', label: 'Savings', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} savings`, editType: 'savingsInv' })
                        d = new Date(d.getFullYear(), d.getMonth() + 1, dom)
                    }
                } else if (freq === 'termly') {
                    const overrides = formData.savingsInvTermDates || {}
                    const amounts = distributeEvenly(savAmt, terms.length)
                    for (let ti = 0; ti < terms.length; ti++) {
                        const term = terms[ti]
                        const date = overrides[term.id] || term.start
                        if (date) events.push({ date, amount: amounts[ti], type: 'expense', label: 'Savings', sublabel: `${term.name} savings`, editType: 'savingsInv' })
                    }
                } else if (freq === 'quarterly') {
                    const qDates = formData.savingsInvQuarterlyDates || {}
                    const QUARTER_DEFAULTS = ['2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01']
                    const amounts = distributeEvenly(savAmt, 4)
                    for (let i = 0; i < 4; i++) {
                        const date = qDates[i] || QUARTER_DEFAULTS[i]
                        events.push({ date, amount: amounts[i], type: 'expense', label: 'Savings', sublabel: `Q${i + 1} savings`, editType: 'savingsInv' })
                    }
                }
            } else {
                // Per payment mode
                if (freq === 'weekly') {
                    let d = formData.savingsInvNextDate ? new Date(formData.savingsInvNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 24 * 60 * 60 * 1000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
                    while (d <= ayEnd) {
                        events.push({ date: d.toISOString().split('T')[0], amount: savAmt, type: 'expense', label: 'Savings', sublabel: 'Weekly savings', editType: 'savingsInv' })
                        d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
                    }
                } else if (freq === 'monthly') {
                    let d = formData.savingsInvNextDate ? new Date(formData.savingsInvNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayEnd) d = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
                    const dom = d.getDate()
                    while (d <= ayEnd) {
                        events.push({ date: d.toISOString().split('T')[0], amount: savAmt, type: 'expense', label: 'Savings', sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} savings`, editType: 'savingsInv' })
                        d = new Date(d.getFullYear(), d.getMonth() + 1, dom)
                    }
                } else if (freq === 'termly') {
                    const overrides = formData.savingsInvTermDates || {}
                    for (const term of terms) {
                        const date = overrides[term.id] || term.start
                        if (date) events.push({ date, amount: savAmt, type: 'expense', label: 'Savings', sublabel: `${term.name} savings`, editType: 'savingsInv' })
                    }
                } else if (freq === 'quarterly') {
                    const qDates = formData.savingsInvQuarterlyDates || {}
                    const QUARTER_DEFAULTS = ['2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01']
                    for (let i = 0; i < 4; i++) {
                        const date = qDates[i] || QUARTER_DEFAULTS[i]
                        events.push({ date, amount: savAmt, type: 'expense', label: 'Savings', sublabel: `Q${i + 1} savings`, editType: 'savingsInv' })
                    }
                }
            }
        }
    }

    // Other expense events
    if (formData.expenseSources?.includes('other_expense')) {
        const otherExpAmt = parseFloat(String(formData.otherExpenseAmount || '0').replace(/,/g, ''))
        const freq = formData.otherExpenseFrequency
        const lbl = formData.otherExpenseLabel || 'Other Expense'
        const otherExpMode = formData.otherExpenseEntryMode || 'yearly'

        if (otherExpAmt > 0 && freq) {
            const ayStart = new Date(2025, 8, 1)
            const ayEnd = new Date(2026, 7, 31)

            if (otherExpMode === 'yearly') {
                if (freq === 'weekly') {
                    let d = formData.otherExpenseNextDate ? new Date(formData.otherExpenseNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    let count = 0; let tmp = new Date(d)
                    while (tmp <= ayEnd) { count++; tmp = new Date(tmp.getTime() + 7 * 86400000) }
                    const amounts = distributeEvenly(otherExpAmt, count); let idx = 0
                    while (d <= ayEnd) {
                        events.push({ date: d.toISOString().split('T')[0], amount: amounts[idx++], type: 'expense', label: lbl, sublabel: 'Weekly', editType: 'otherExpense' })
                        d = new Date(d.getTime() + 7 * 86400000)
                    }
                } else if (freq === 'monthly') {
                    let d = formData.otherExpenseNextDate ? new Date(formData.otherExpenseNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayEnd) d = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
                    const dayOfMonth = d.getDate()
                    let mCount = 0; let mt = new Date(d)
                    while (mt <= ayEnd) { mCount++; mt = new Date(mt.getFullYear(), mt.getMonth() + 1, dayOfMonth) }
                    const amounts = distributeEvenly(otherExpAmt, mCount); let idx = 0
                    while (d <= ayEnd) {
                        events.push({ date: d.toISOString().split('T')[0], amount: amounts[idx++], type: 'expense', label: lbl, sublabel: d.toLocaleDateString('en-GB', { month: 'long' }), editType: 'otherExpense' })
                        d = new Date(d.getFullYear(), d.getMonth() + 1, dayOfMonth)
                    }
                } else if (freq === 'termly') {
                    const overrides = formData.otherExpenseTermDates || {}
                    const amounts = distributeEvenly(otherExpAmt, terms.length)
                    for (let ti = 0; ti < terms.length; ti++) {
                        const term = terms[ti]
                        const date = overrides[term.id] || term.start
                        if (!date) continue
                        events.push({ date, amount: amounts[ti], type: 'expense', label: lbl, sublabel: term.name, editType: 'otherExpense' })
                    }
                } else if (freq === 'yearly') {
                    events.push({ date: formData.otherExpenseNextDate || '2025-09-01', amount: otherExpAmt, type: 'expense', label: lbl, sublabel: 'Yearly expense', editType: 'otherExpense' })
                }
            } else {
                // Per payment mode
                if (freq === 'weekly') {
                    let d = formData.otherExpenseNextDate ? new Date(formData.otherExpenseNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayStart) d = new Date(d.getTime() - 7 * 86400000)
                    while (d < ayStart) d = new Date(d.getTime() + 7 * 86400000)
                    while (d <= ayEnd) {
                        events.push({ date: d.toISOString().split('T')[0], amount: otherExpAmt, type: 'expense', label: lbl, sublabel: 'Weekly', editType: 'otherExpense' })
                        d = new Date(d.getTime() + 7 * 86400000)
                    }
                } else if (freq === 'monthly') {
                    let d = formData.otherExpenseNextDate ? new Date(formData.otherExpenseNextDate + 'T00:00:00') : new Date(2025, 8, 1)
                    while (d > ayEnd) d = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
                    while (d < ayStart) d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
                    const dayOfMonth = d.getDate()
                    while (d <= ayEnd) {
                        events.push({ date: d.toISOString().split('T')[0], amount: otherExpAmt, type: 'expense', label: lbl, sublabel: d.toLocaleDateString('en-GB', { month: 'long' }), editType: 'otherExpense' })
                        d = new Date(d.getFullYear(), d.getMonth() + 1, dayOfMonth)
                    }
                } else if (freq === 'termly') {
                    const overrides = formData.otherExpenseTermDates || {}
                    for (const term of terms) {
                        const date = overrides[term.id] || term.start
                        if (!date) continue
                        events.push({ date, amount: otherExpAmt, type: 'expense', label: lbl, sublabel: term.name, editType: 'otherExpense' })
                    }
                } else if (freq === 'yearly') {
                    events.push({ date: formData.otherExpenseNextDate || '2025-09-01', amount: otherExpAmt, type: 'expense', label: lbl, sublabel: 'Yearly expense', editType: 'otherExpense' })
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
        const ayStart = new Date(2025, 8, 1)
        const ayEnd = new Date(2026, 7, 31)
        let d = new Date(ayStart)
        // Align to Mondays
        while (d.getDay() !== 1) d = new Date(d.getTime() + 24 * 60 * 60 * 1000)
        while (d <= ayEnd) {
            const dateStr = d.toISOString().split('T')[0]
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
            return ['termDates', 'balance', 'overdraft', 'regularIncome', 'maintenanceLoan', 'bursary', 'familyFriends', 'work', 'otherIncome', 'rent', 'regularExpenses', 'bills', 'uniFees', 'savingsInvestments', 'otherExpense', 'oneOffItems', 'weeklySpend'].includes(saved.currentStepId)
        } catch { return false }
    })
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
        panels.push('oneOffItems')
        panels.push('weeklySpend')
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

    /* --- State with localStorage restore --- */

    const [formData, setFormData] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY)
            if (saved) {
                const parsed = JSON.parse(saved)
                return { ...INITIAL_FORM_DATA, ...parsed.formData }
            }
        } catch {
            /* ignore */
        }
        return { ...INITIAL_FORM_DATA }
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

    const PANEL_RESET_FIELDS = {
        balance: { balance: '' },
        maintenanceLoan: { loanAmount: '', loanMonths: [...DEFAULT_LOAN_MONTHS], loanKnowDates: false, loanDates: {}, instalmentAmounts: {} },
        bursary: { bursaryAmount: '', bursaryDates: [...INITIAL_FORM_DATA.bursaryDates], bursaryMonths: undefined, bursaryInstalmentAmounts: {} },
        familyFriends: { familyAmount: '', familyFrequency: 'monthly', familyNextDate: '', familyTermDates: {}, familyQuarterlyDates: {}, familyVariesByTerm: false, familyNonTermAmount: '' },
        work: { workAmount: '', workFrequency: 'weekly', workEntryMode: 'yearly', workVariesByTerm: false, workNonTermAmount: '', workNextDate: '', workTermDates: {}, workQuarterlyDates: {} },
        otherIncome: { otherIncomeAmount: '', otherIncomeFrequency: 'monthly', otherIncomeEntryMode: 'yearly', otherIncomeLabel: '', otherIncomeNextDate: '', otherIncomeTermDates: {}, otherIncomeVariesByTerm: false, otherIncomeNonTermAmount: '' },
        rent: { rentAmount: '', rentFrequency: 'monthly', rentNextDate: '', rentEntryMode: 'per_payment', rentTermDates: {}, rentQuarterlyDates: {} },
        bills: { billsAmount: '', billsFrequency: 'monthly', billsEntryMode: 'yearly', billsNextDate: '', billsTermDates: {} },
        uniFees: { uniFeesAmount: '9250', uniFeesFrequency: 'yearly', uniFeesEntryMode: 'yearly', uniFeesNextDate: '2025-10-27', uniFeesTermDates: {} },
        savingsInvestments: { savingsInvAmount: '', savingsInvFrequency: 'monthly', savingsInvEntryMode: 'per_payment', savingsInvNextDate: '', savingsInvTermDates: {}, savingsInvQuarterlyDates: {} },
        otherExpense: { otherExpenseAmount: '', otherExpenseFrequency: 'monthly', otherExpenseEntryMode: 'yearly', otherExpenseLabel: '', otherExpenseNextDate: '', otherExpenseTermDates: {} },
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
                return !formData.otherIncomeAmount
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
                return !formData.otherExpenseAmount
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
                if (!formData.familyFrequency) {
                    return 'Please select a frequency'
                }
                break

            case 'work':
                if (!formData.workAmount) {
                    return 'Please enter an amount'
                }
                if (!formData.workFrequency) {
                    return 'Please select a frequency'
                }
                if (formData.workFrequency === 'yearly' && !formData.workNextDate) {
                    return 'Please select a payment date'
                }
                break

            case 'otherIncome':
                if (!formData.otherIncomeAmount) {
                    return 'Please enter an amount'
                }
                if (!formData.otherIncomeFrequency) {
                    return 'Please select a frequency'
                }
                break

            case 'rent':
                if (!formData.rentAmount) {
                    return 'Please enter an amount'
                }
                if (!formData.rentFrequency) {
                    return 'Please select a frequency'
                }
                break

            case 'bills':
                if (!formData.billsAmount) {
                    return 'Please enter an amount'
                }
                if (!formData.billsFrequency) {
                    return 'Please select a frequency'
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
                if (!formData.savingsInvFrequency) {
                    return 'Please select a frequency'
                }
                break

            case 'otherExpense':
                if (!formData.otherExpenseAmount) {
                    return 'Please enter an amount'
                }
                if (!formData.otherExpenseFrequency) {
                    return 'Please select a frequency'
                }
                break

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
            // Remove source and reset panel fields
            setFormData(prev => ({
                ...prev,
                [mapping.key]: (prev[mapping.key] || []).filter(s => s !== mapping.value),
                ...(PANEL_RESET_FIELDS[panelId] || {}),
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
        try {
            const {
                data: { user },
                error: userError
            } = await supabase.auth.getUser()

            if (userError || !user) {
                showToast('You must be logged in')
                return
            }

            await saveCashflowForecast(user.id, formData)

            // Save term dates
            await saveTermDates(user.id, formData.termDates)

            // Save initial balance history
            if (formData.balance) {
                await saveBalanceHistory(user.id, formData.balance)
            }

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

            // Keep formData in localStorage for dashboard use

            // Track onboarding completed

            analytics.track(ONBOARDING_EVENTS.COMPLETED, {
                ...getUserProperties({
                    university: formData.university,
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

            // Call onComplete callback to trigger loading screen
            if (onComplete) {
                onComplete()
            }
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

            showToast('Something went wrong saving your data')
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
            <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {toastEl}
                {/* Single TermGraph — props change based on panel */}
                <div style={{
                    height: graphAnimated ? 185 : 0,
                    opacity: graphAnimated ? 1 : 0,
                    transform: graphAnimated ? 'translateY(0)' : 'translateY(-8px)',
                    overflow: 'hidden',
                    flexShrink: 0,
                    transition: graphAnimated
                        ? 'height 0.6s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.45s ease, transform 0.45s cubic-bezier(.22,1,.36,1)'
                        : 'height 0.35s ease, opacity 0.25s ease, transform 0.25s ease',
                }}>
                    <TermGraph
                        terms={terms}
                        expandedTerm={activePanel === 0 ? activeExpanded : undefined}
                        balance={activePanel >= 1 ? balanceNum : undefined}
                        overdraft={formData.overdraft ? parseFloat(String(formData.overdraft || '0').replace(/,/g, '')) : undefined}
                        events={activePanel >= 3 ? buildGraphEvents(formData) : []}
                        hiddenEventTypes={(() => {
                            const panelId = PANEL_STEPS[activePanel]
                            const incomeEditTypes = ['loan', 'bursary', 'family', 'work', 'otherIncome']
                            const expenseEditTypes = ['rent', 'bills', 'uniFees', 'savingsInv', 'otherExpense', 'weeklySpend']
                            const allTypes = [...incomeEditTypes, ...expenseEditTypes, 'oneOff']
                            // On regularIncome: hide all expense types
                            if (panelId === 'regularIncome') return expenseEditTypes
                            // On regularExpenses: hide all income types
                            if (panelId === 'regularExpenses') return incomeEditTypes
                            if (!showAllEvents && activePanel >= 4) {
                                const typeMap = {
                                    maintenanceLoan: 'loan', bursary: 'bursary',
                                    familyFriends: 'family', work: 'work',
                                    otherIncome: 'otherIncome',
                                    rent: 'rent', bills: 'bills', uniFees: 'uniFees',
                                    savingsInvestments: 'savingsInv',
                                    otherExpense: 'otherExpense',
                                    oneOffItems: 'oneOff',
                                    weeklySpend: 'weeklySpend',
                                }
                                const currentType = typeMap[panelId]
                                if (!currentType) return []
                                return allTypes.filter(t => t !== currentType)
                            }
                            return []
                        })()}
                        currentEventType={activePanel >= 4 ? (() => {
                            const panelId = PANEL_STEPS[activePanel]
                            const typeMap = {
                                maintenanceLoan: 'loan', bursary: 'bursary',
                                familyFriends: 'family', work: 'work',
                                otherIncome: 'otherIncome',
                                rent: 'rent', bills: 'bills', uniFees: 'uniFees',
                                savingsInvestments: 'savingsInv',
                                oneOffItems: 'oneOff',
                                weeklySpend: 'weeklySpend',
                            }
                            return typeMap[panelId] || null
                        })() : null}
                        onEventClick={(evt, e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            setEditingEvent({ ...evt, clickX: rect.left + rect.width / 2, clickY: rect.top })
                            setEditAmount(String(evt.amount))
                        }}
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
                    margin: '0px 19px 12px',
                    flex: 1,
                    background: '#fff',
                    borderRadius: 20,
                    boxShadow: '0 0 15px rgba(0,0,0,0.1)',
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
                        const stripColor = incomeTypes.includes(panelId) ? '#147b75'
                            : expenseTypes.includes(panelId) ? '#e06470'
                                : otherTypes.includes(panelId) ? '#EC8C17'
                                    : null
                        return stripColor ? (
                            <div style={{
                                height: 4,
                                background: stripColor,
                                borderRadius: '20px 20px 0 0',
                                flexShrink: 0,
                                transition: 'background 0.3s ease',
                            }} />
                        ) : null
                    })()}

                    {/* Panel content area */}
                    <div style={{ flex: 1, position: 'relative', overflow: 'clip', minHeight: 0 }}>
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
                                {!['termDates', 'balance', 'overdraft', 'regularIncome', 'regularExpenses', 'savingsInvestments', 'otherExpense'].includes(panelId) && new Set(buildGraphEvents(formData).filter(e => !e.removed).map(e => e.editType)).size >= 2 && (() => {
                                    const incPanels = ['maintenanceLoan', 'bursary', 'familyFriends', 'work', 'otherIncome']
                                    const expPanels = ['rent', 'bills', 'uniFees']
                                    const otherPanels = ['oneOffItems', 'weeklySpend']
                                    const btnColor = incPanels.includes(panelId) ? '#147b75'
                                        : expPanels.includes(panelId) ? '#e06470'
                                            : otherPanels.includes(panelId) ? '#EC8C17'
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
                                {panelId === 'otherIncome' && (
                                    <OtherIncomeStep
                                        otherIncomeAmount={formData.otherIncomeAmount}
                                        updateOtherIncomeAmount={(val) => updateField('otherIncomeAmount', val)}
                                        otherIncomeFrequency={formData.otherIncomeFrequency}
                                        updateOtherIncomeFrequency={(val) => updateField('otherIncomeFrequency', val)}
                                        otherIncomeLabel={formData.otherIncomeLabel}
                                        updateOtherIncomeLabel={(val) => updateField('otherIncomeLabel', val)}
                                        otherIncomeNextDate={formData.otherIncomeNextDate}
                                        updateOtherIncomeNextDate={(val) => updateField('otherIncomeNextDate', val)}
                                        terms={formData.termDates?.terms || []}
                                        otherIncomeTermDates={formData.otherIncomeTermDates || {}}
                                        updateOtherIncomeTermDates={(val) => updateField('otherIncomeTermDates', val)}
                                        otherIncomeVariesByTerm={formData.otherIncomeVariesByTerm}
                                        updateOtherIncomeVariesByTerm={(val) => updateField('otherIncomeVariesByTerm', val)}
                                        otherIncomeNonTermAmount={formData.otherIncomeNonTermAmount}
                                        updateOtherIncomeNonTermAmount={(val) => updateField('otherIncomeNonTermAmount', val)}
                                        otherIncomeEntryMode={formData.otherIncomeEntryMode}
                                        updateOtherIncomeEntryMode={(val) => updateField('otherIncomeEntryMode', val)}
                                    />
                                )}
                                {panelId === 'rent' && (
                                    <RentStep
                                        rentAmount={formData.rentAmount}
                                        updateRentAmount={(val) => updateField('rentAmount', val)}
                                        rentFrequency={formData.rentFrequency}
                                        updateRentFrequency={(val) => updateField('rentFrequency', val)}
                                        rentNextDate={formData.rentNextDate}
                                        updateRentNextDate={(val) => updateField('rentNextDate', val)}
                                        rentEntryMode={formData.rentEntryMode || 'yearly'}
                                        updateRentEntryMode={(val) => updateField('rentEntryMode', val)}
                                        terms={formData.termDates?.terms || []}
                                        rentTermDates={formData.rentTermDates || {}}
                                        updateRentTermDates={(val) => updateField('rentTermDates', val)}
                                        rentQuarterlyDates={formData.rentQuarterlyDates || {}}
                                        updateRentQuarterlyDates={(val) => updateField('rentQuarterlyDates', val)}

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
                                        billsEntryMode={formData.billsEntryMode}
                                        updateBillsEntryMode={(val) => updateField('billsEntryMode', val)}
                                        billsNextDate={formData.billsNextDate}
                                        updateBillsNextDate={(val) => updateField('billsNextDate', val)}
                                        terms={formData.termDates?.terms || []}
                                        billsTermDates={formData.billsTermDates || {}}
                                        updateBillsTermDates={(val) => updateField('billsTermDates', val)}
                                    />
                                )}
                                {panelId === 'uniFees' && (
                                    <UniFeesStep
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
                                {panelId === 'savingsInvestments' && (
                                    <SavingsInvestmentsStep
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
                                {panelId === 'otherExpense' && (
                                    <OtherExpenseStep
                                        otherExpenseAmount={formData.otherExpenseAmount}
                                        updateOtherExpenseAmount={(val) => updateField('otherExpenseAmount', val)}
                                        otherExpenseFrequency={formData.otherExpenseFrequency}
                                        updateOtherExpenseFrequency={(val) => updateField('otherExpenseFrequency', val)}
                                        otherExpenseLabel={formData.otherExpenseLabel}
                                        updateOtherExpenseLabel={(val) => updateField('otherExpenseLabel', val)}
                                        otherExpenseNextDate={formData.otherExpenseNextDate}
                                        updateOtherExpenseNextDate={(val) => updateField('otherExpenseNextDate', val)}
                                        otherExpenseEntryMode={formData.otherExpenseEntryMode}
                                        updateOtherExpenseEntryMode={(val) => updateField('otherExpenseEntryMode', val)}
                                        terms={formData.termDates?.terms || []}
                                        otherExpenseTermDates={formData.otherExpenseTermDates || {}}
                                        updateOtherExpenseTermDates={(val) => updateField('otherExpenseTermDates', val)}
                                    />
                                )}
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
                            </div>
                        ))}
                    </div>

                    {/* Bottom buttons — hidden during uni overlay transition to avoid double-render jitter */}
                    <div style={{
                        flexShrink: 0,
                        padding: '10px 19px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        borderTop: '1px solid #f3f3f3',
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
                            {PANEL_LABELS[activePanel]}
                        </button>
                        <div style={{
                            overflow: 'hidden', flexShrink: 0,
                            width: PANEL_TO_SOURCE[PANEL_STEPS[activePanel]] ? 36 : 0,
                            opacity: PANEL_TO_SOURCE[PANEL_STEPS[activePanel]] ? 1 : 0,
                            transition: 'width 0.3s ease, opacity 0.2s ease',
                            marginLeft: PANEL_TO_SOURCE[PANEL_STEPS[activePanel]] ? 0 : -12,
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
                        {/* White backdrop — only in steady-state university step, not during reverse slide */}
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
                            top: uniSlideOut ? 185 : 10,
                            left: 19,
                            right: 19,
                            bottom: 12,
                            zIndex: 6,
                            overflow: 'hidden',
                            borderRadius: 20,
                            boxShadow: '0 0 15px rgba(0,0,0,0.1)',
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
                                        Where do you go to university?
                                    </h2>
                                    <p style={{
                                        fontSize: 15,
                                        fontFamily: 'Nunito, sans-serif',
                                        color: '#5e5e5e',
                                        margin: '0 0 24px',
                                        lineHeight: 1.5,
                                    }}>
                                        This helps us match your budget to your term dates and connect you with university support if needed.
                                    </p>
                                    <NativeSelect
                                        value={formData.university}
                                        onChange={(value) => updateField('university', value)}
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
                                            opacity: imgLoaded ? 1 : 0,
                                            transition: 'opacity 0.35s ease'
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
                                                } else if (editingEvent.editType === 'otherIncome') {
                                                    updateField('otherIncomeAmount', val)
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
                                        }}>£</span>
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
