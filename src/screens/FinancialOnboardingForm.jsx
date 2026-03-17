import { useState, useEffect, useRef, useCallback } from 'react'
import { toLocalDate, makeOtherInstance, MONTH_KEY_TO_DATE, MONTH_SHORT, isInTerm, distributeEvenly, addMonths } from '../lib/helpers'
import { getCurrencySymbol, getGraphStart, setGraphStart } from '../lib/settings'
import { Button, Input, Modal, Radio, Typography, message } from 'antd'
import StepProgress from '../components/StepProgress'
import NativeSelect from '../components/NativeSelect'
import variableWeeklySpend from '../assets/variable-weekly-spend.svg'
import variableOneOff from '../assets/variable-one-off.svg'
import TermDatesStep from './TermDatesStep'
import TermGraph, { refreshAY, AY_START, AY_END } from '../components/TermGraph'
import BankBalanceStep from './BankBalanceStep'
import RegularIncomeStep from './RegularIncomeStep'
import CategoryStep from './CategoryStep'
import RegularExpensesStep from './RegularExpensesStep'
import OverdraftStep from './OverdraftStep'
import WeeklySpendStep from './WeeklySpendStep'
import { SOURCE_ICONS } from '../config/categories'
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES, CATEGORY_MAP, SOURCE_ICONS as CATEGORY_SOURCE_ICONS } from '../config/categories'
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
    const ayEnd = AY_END

    // Generic category events (income + expense)
    const ALL_CATS = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]
    for (const cat of ALL_CATS) {
        const isIncome = INCOME_CATEGORIES.includes(cat)
        const sourceList = isIncome ? formData.incomeSources : formData.expenseSources
        if (!sourceList?.includes(cat.id)) continue

        const entries = formData[cat.formKey] || []
        const hasMultiple = entries.filter(e => parseFloat(String(e.amount || '0').replace(/,/g, '')) > 0).length > 1
        let entryNum = 0
        for (const entry of entries) {
            const amt = parseFloat(String(entry.amount || '0').replace(/,/g, ''))
            if (amt <= 0) continue
            entryNum++
            const type = isIncome ? 'income' : 'expense'
            const freq = entry.frequency || cat.defaultFrequency
            const entryLabel = hasMultiple ? `${cat.label} ${entryNum}` : cat.label
            const entryEditType = hasMultiple ? `${cat.id}:${entry.id || entryNum}` : cat.id

            if (freq === 'irregular') {
                const months = (entry.months || []).sort((a, b) => ALL_MONTH_KEYS.indexOf(a) - ALL_MONTH_KEYS.indexOf(b))
                if (months.length === 0) continue
                const dateObjs = months.map(m => ({ date: entry.dates?.[m] || MONTH_KEY_TO_DATE[m] }))
                const amounts = distributeExcludingRemoved(amt, dateObjs, entryEditType, removedSet)
                for (let mi = 0; mi < months.length; mi++) {
                    const month = months[mi]
                    const date = entry.dates?.[month] || MONTH_KEY_TO_DATE[month]
                    if (!date) continue
                    const instAmt = parseFloat(String(entry.instalmentAmounts?.[month] || '0').replace(/,/g, ''))
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
                const startDate = entry.nextDate ? new Date(entry.nextDate + 'T00:00:00') : new Date(AY_START)
                let d = new Date(startDate)
                if (!entry.nextDate) {
                    while (d > AY_START) d = new Date(d.getTime() - interval * 86400000)
                    while (d < AY_START) d = new Date(d.getTime() + interval * 86400000)
                }
                const nonTermAmt = entry.variesByTerm ? parseFloat(String(entry.nonTermAmount || '0').replace(/,/g, '')) : amt
                const endDate = entry.endDate ? new Date(entry.endDate + 'T00:00:00') : ayEnd
                while (d <= endDate) {
                    if (d >= AY_START) {
                        const dateStr = toLocalDate(d)
                        const eventAmt = entry.variesByTerm ? (isInTerm(dateStr, terms) ? amt : nonTermAmt) : amt
                        if (eventAmt > 0) {
                            events.push({ date: dateStr, amount: eventAmt, type, label: entryLabel, sublabel: `${freq === 'weekly' ? 'Weekly' : 'Fortnightly'} ${entryLabel.toLowerCase()}`, editType: entryEditType })
                        }
                    }
                    d = new Date(d.getTime() + interval * 86400000)
                }
            } else if (freq === 'monthly') {
                const domRaw = entry.dayOfMonth || '1'
                const isLast = domRaw === 'last'
                const domTarget = isLast ? 31 : parseInt(domRaw) || 1
                const startFrom = entry.nextDate ? new Date(entry.nextDate + 'T00:00:00') : AY_START
                const earliest = startFrom > AY_START ? startFrom : AY_START
                const endDate = entry.endDate ? new Date(entry.endDate + 'T00:00:00') : ayEnd
                const nonTermAmt = entry.variesByTerm ? parseFloat(String(entry.nonTermAmount || '0').replace(/,/g, '')) : amt
                let month = AY_START.getMonth()
                let year = AY_START.getFullYear()
                for (let i = 0; i < 13; i++) {
                    const lastDay = new Date(year, month + 1, 0).getDate()
                    const day = Math.min(domTarget, lastDay)
                    const d = new Date(year, month, day)
                    if (d >= earliest && d <= endDate) {
                        const dateStr = toLocalDate(d)
                        const eventAmt = entry.variesByTerm ? (isInTerm(dateStr, terms) ? amt : nonTermAmt) : amt
                        if (eventAmt > 0) {
                            events.push({ date: dateStr, amount: eventAmt, type, label: entryLabel, sublabel: `${d.toLocaleDateString('en-GB', { month: 'long' })} ${entryLabel.toLowerCase()}`, editType: entryEditType })
                        }
                    }
                    month++
                    if (month > 11) { month = 0; year++ }
                }
            } else if (freq === 'yearly') {
                events.push({ date: entry.nextDate || ayStartStr(), amount: amt, type, label: entryLabel, sublabel: `Yearly ${entryLabel.toLowerCase()}`, editType: entryEditType })
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
                            style={{ width: '100%', background: '#fff' }}
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
                                    boxShadow: 'none',
                                    background: '#fff'
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
                                    boxShadow: 'none',
                                    background: '#fff'
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
                            style={{ width: '100%', background: '#fff' }}
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
                            style={{ width: '100%', background: '#fff' }}
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
                                    boxShadow: 'none',
                                    background: '#fff'
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

    const [editingEvent, setEditingEvent] = useState(null)  // { ...event, clickX, clickY }
    const [editAmount, setEditAmount] = useState('')
    const [nearbyEvents, setNearbyEvents] = useState([])   // events on same date as editingEvent
    const [nearbyIdx, setNearbyIdx] = useState(0)           // which nearby event is active
    const [showDotHint, setShowDotHint] = useState(false)
    const dotHintShownRef = useRef(false)
    const [editingBalance, setEditingBalance] = useState(false)
    const [editBalanceAmount, setEditBalanceAmount] = useState('')
    const transitionRef = useRef(null) // guards against overlapping transitions
    const sheetRef = useRef(null)
    const graphWrapRef = useRef(null)
    const sheetDragRef = useRef({ dragging: false, startY: 0, startTop: 0 })
    const [sheetExpanded, setSheetExpanded] = useState(false)
    const [titleBorderVisible, setTitleBorderVisible] = useState(false)
    const [graphAnimated, setGraphAnimated] = useState(() => {
        return true
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
        for (const cat of INCOME_CATEGORIES) {
            if (s.includes(cat.id)) panels.push(cat.panelId)
        }
        panels.push('regularExpenses')
        const e = expSources || []
        for (const cat of EXPENSE_CATEGORIES) {
            if (e.includes(cat.id)) panels.push(cat.panelId)
        }
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
    const [expandedTerms, setExpandedTerms] = useState(new Set())
    const [showAllEvents, setShowAllEvents] = useState(false)
    useEffect(() => {
        if (activePanel === 4 && !dotHintShownRef.current) {
            dotHintShownRef.current = true
            setShowDotHint(true)
        } else if (activePanel !== 4) {
            setShowDotHint(false)
        }
    }, [activePanel])
    const defaultTermDatesRef = useRef(null)
    const prevActivePanelRef = useRef(0)
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
            defaultTermDatesRef.current = JSON.parse(JSON.stringify(data.termDates))
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
    }
    // Generate reset fields for all category panels
    for (const cat of [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]) {
        PANEL_RESET_FIELDS[cat.panelId] = { [cat.formKey]: [] }
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
        const stepId = currentStep.id
        switch (stepId) {
            case 'university':
                return !formData.university
            case 'termDates':
                return false
            case 'balance':
                return !formData.balance
            case 'regularIncome':
                return false
            case 'regularExpenses':
                return false
            case 'weeklySpend':
                return !formData.weeklySpend
            default: {
                // Check generic category panels
                const cat = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].find(c => c.panelId === stepId)
                if (cat) {
                    const entries = formData[cat.formKey] || []
                    return !entries.some(e => e.amount)
                }
                return false
            }
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

        // Generic category panel validation
        const cat = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].find(c => c.panelId === currentStep.id)
        if (cat) {
            const entries = formData[cat.formKey] || []
            if (!entries.some(e => e.amount)) {
                return 'Please enter an amount'
            }
            for (const entry of entries) {
                if (!entry.amount) continue
                const freq = entry.frequency || cat.defaultFrequency
                if (freq === 'irregular' && (!entry.months || entry.months.length === 0)) {
                    return 'Please select at least one month'
                }
                if (freq === 'one-off' && !entry.nextDate) {
                    return 'Please select a date'
                }
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
        setExpandedTerms(new Set())
        setTitleBorderVisible(false)
        const panels = buildPanelSteps(formData.incomeSources, formData.expenseSources)
        if (returnToSummaryRef.current) {
            returnToSummaryRef.current = false
            const summaryIdx = panels.indexOf('summary')
            if (summaryIdx >= 0) {
                setActivePanel(summaryIdx)
                setCurrentStepId('summary')
                return
            }
        }
        let prev = activePanel - 1
        if (prev < 0) prev = 0
        setActivePanel(prev)
        setCurrentStepId(panels[prev])
    }

    const PANEL_TO_SOURCE = {}
    for (const cat of INCOME_CATEGORIES) {
        PANEL_TO_SOURCE[cat.panelId] = { key: 'incomeSources', value: cat.id }
    }
    for (const cat of EXPENSE_CATEGORIES) {
        PANEL_TO_SOURCE[cat.panelId] = { key: 'expenseSources', value: cat.id }
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
            const allCats = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]
            const matchedCat = allCats.find(c => c.id === mapping.value)
            const resetPanelId = matchedCat ? matchedCat.panelId : mapping.value
            const resetFields = PANEL_RESET_FIELDS[resetPanelId] || {}
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
        // If on summary panel, always submit
        if (PANEL_STEPS[activePanel] === 'summary') {
            submit()
            return
        }
        const error = checkRequiredFields()
        if (error) {
            showToast(error)
            return
        }
        setExpandedTerms(new Set())
        setTitleBorderVisible(false)
        const panels = buildPanelSteps(formData.incomeSources, formData.expenseSources)
        if (returnToSummaryRef.current && PANEL_STEPS[activePanel] !== 'summary') {
            returnToSummaryRef.current = false
            const summaryIdx = panels.indexOf('summary')
            if (summaryIdx >= 0) {
                setActivePanel(summaryIdx)
                setCurrentStepId('summary')
                requestAnimationFrame(() => {
                    document.querySelector('[data-active-panel]')?.parentElement?.scrollTo({ top: 0 })
                })
                return
            }
        }
        returnToSummaryRef.current = false
        const nextPanelIdx = activePanel + 1
        if (nextPanelIdx < panels.length) {
            // Still in panel group — advance to next panel step
            setCurrentStepId(panels[nextPanelIdx])
            setTimeout(() => {
                setActivePanel(nextPanelIdx)
                requestAnimationFrame(() => {
                    document.querySelector('[data-active-panel]')?.parentElement?.scrollTo({ top: 0 })
                })
            }, 16)
        } else {
            // Last panel reached — submit and go to dashboard
            submit()
        }
    }


    /* --- Submit --- */

    const submit = async () => {
        setSubmitting(true)

        // Start saving and pass the promise to the loading screen
        const savePromise = (async () => {
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
        })()

        // Show loading screen immediately, passing the save promise
        if (onComplete) {
            onComplete(savePromise)
        }
    }


    /* ---------- RENDER ---------- */



    // university + termDates share a single render block so TermDatesStep stays
    // mounted throughout the transition — prevents the flash on step switch
    const PANEL_STEPS = buildPanelSteps(formData.incomeSources, formData.expenseSources)
    const PANEL_LABEL_MAP = {
        termDates: 'Confirm Term Dates',
        balance: 'Confirm Bank Balance',
        overdraft: 'Confirm Overdraft',
        regularIncome: 'Confirm Income',
        regularExpenses: 'Confirm Expenses',
        weeklySpend: 'Confirm Weekly Spend',
        summary: 'Predict My Financial Future',
    }
    for (const cat of [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]) {
        PANEL_LABEL_MAP[cat.panelId] = `Confirm ${cat.label}`
    }
    const PANEL_LABELS = PANEL_STEPS.map(id => PANEL_LABEL_MAP[id])
    const PANEL_HEADING_MAP = {
        termDates: 'University Term Dates', balance: 'Bank Balance', overdraft: 'Overdraft Limit',
        regularIncome: 'Income', regularExpenses: 'Expenses',
        weeklySpend: 'Weekly Spend', summary: 'Your Budget',
    }
    for (const cat of [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]) {
        PANEL_HEADING_MAP[cat.panelId] = cat.label
    }
    const inPanelGroup = PANEL_STEPS.includes(currentStep.id) || activePanel > 0

    if (inPanelGroup) {
        const terms = formData.termDates?.terms || []
        const balanceNum = parseFloat(String(formData.balance || '0').replace(/,/g, '')) || 0
        const activeExpanded = expandedTerms

        // Determine which handler to use based on active panel
        const panelOnNext = activePanel === 0 ? handleTermDatesNext : handlePanelNext
        const panelOnBack = handlePanelBack

        const toastEl = toast && (
            <>
                <div
                    onClick={dismissToast}
                    style={{
                        position: 'fixed', bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))', left: '50%', transform: 'translateX(-50%)',
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

        const GRAPH_HEIGHT = 210
        const SAFE_AREA_TOP = 'env(safe-area-inset-top, 0px)'
        const COLLAPSED_TOP = `calc(${SAFE_AREA_TOP} + ${GRAPH_HEIGHT}px)`
        const EXPANDED_TOP = `calc(${SAFE_AREA_TOP} + 8px)`

        const handleSheetDragStart = (clientY) => {
            const s = sheetDragRef.current
            if (!sheetRef.current) return
            s.dragging = true
            s.startY = clientY
            s.startTop = sheetRef.current.getBoundingClientRect().top
            sheetRef.current.style.transition = 'none'
            if (graphWrapRef.current) graphWrapRef.current.style.transition = 'none'
        }
        const handleSheetDragMove = (clientY) => {
            const s = sheetDragRef.current
            if (!s.dragging || !sheetRef.current) return
            const safeTop = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sat') || '0')
            const minTop = safeTop + 20
            const maxTop = safeTop + GRAPH_HEIGHT
            const delta = clientY - s.startY
            const newTop = Math.max(minTop, Math.min(maxTop, s.startTop + delta))
            sheetRef.current.style.top = newTop + 'px'
            // Scale graph opacity based on position
            if (graphWrapRef.current) {
                const progress = (newTop - minTop) / (maxTop - minTop)
                graphWrapRef.current.style.opacity = Math.max(0.3, progress)
                graphWrapRef.current.style.transform = `scale(${0.95 + 0.05 * progress})`
            }
        }
        const handleSheetDragEnd = () => {
            const s = sheetDragRef.current
            if (!s.dragging || !sheetRef.current) return
            s.dragging = false
            const currentTop = sheetRef.current.getBoundingClientRect().top
            const safeTop = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sat') || '0')
            const midpoint = safeTop + GRAPH_HEIGHT / 2
            const shouldExpand = currentTop < midpoint
            sheetRef.current.style.transition = 'top 0.35s cubic-bezier(.25,1,.5,1)'
            if (graphWrapRef.current) graphWrapRef.current.style.transition = 'opacity 0.35s ease, transform 0.35s ease'
            if (shouldExpand) {
                sheetRef.current.style.top = EXPANDED_TOP
                if (graphWrapRef.current) { graphWrapRef.current.style.opacity = '0.3'; graphWrapRef.current.style.transform = 'scale(0.95)' }
                setSheetExpanded(true)
            } else {
                sheetRef.current.style.top = COLLAPSED_TOP
                if (graphWrapRef.current) { graphWrapRef.current.style.opacity = '1'; graphWrapRef.current.style.transform = 'scale(1)' }
                setSheetExpanded(false)
            }
        }

        return (
            <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#fff' }}>
                <style>{`:root { --sat: 0px; } @supports (padding-top: env(safe-area-inset-top)) { :root { --sat: env(safe-area-inset-top, 0px); } }`}</style>
                {toastEl}
                {/* Safe area spacer for notch */}
                <div style={{ paddingTop: 'env(safe-area-inset-top, 0px)', background: '#fff' }} />
                <div ref={graphWrapRef} style={{
                    height: 200,
                    overflow: 'hidden',
                    margin: '0 8px',
                    transition: 'opacity 0.35s ease, transform 0.35s ease',
                    position: 'relative', zIndex: 0,
                }}>
                    <TermGraph
                        graphHeight={150}
                        marginTop={8}
                        scrubNearLineOnly
                        terms={terms}
                        expandedTerm={activePanel === 0 && activeExpanded.size === 1 ? [...activeExpanded][0] : undefined}
                        balance={activePanel >= 1 ? balanceNum : undefined}
                        overdraft={formData.overdraft ? parseFloat(String(formData.overdraft || '0').replace(/,/g, '')) : undefined}
                        events={activePanel >= 3 ? buildGraphEvents(formData).filter(e => { const wsIdx = PANEL_STEPS.indexOf('weeklySpend'); return e.editType !== 'weeklySpend' || activePanel >= wsIdx }) : []}
                        hiddenEventTypes={(() => {
                            const panelId = PANEL_STEPS[activePanel]
                            if (panelId === 'summary') return []
                            const incomeEditTypes = INCOME_CATEGORIES.map(c => c.id)
                            const expenseEditTypes = [...EXPENSE_CATEGORIES.map(c => c.id), 'weeklySpend']
                            const allTypes = [...incomeEditTypes, ...expenseEditTypes, 'oneOff']
                            // On regularIncome: hide all expense types + oneOff, and hide unchecked income types
                            if (panelId === 'regularIncome') {
                                const hidden = [...expenseEditTypes, 'oneOff']
                                const selected = formData.incomeSources || []
                                for (const cat of INCOME_CATEGORIES) {
                                    if (!selected.includes(cat.id)) hidden.push(cat.id)
                                }
                                return hidden
                            }
                            // On regularExpenses: hide all income types + oneOff + weeklySpend, and hide unchecked expense types
                            if (panelId === 'regularExpenses') {
                                const hidden = [...incomeEditTypes, 'oneOff', 'weeklySpend']
                                const selected = formData.expenseSources || []
                                for (const cat of EXPENSE_CATEGORIES) {
                                    if (!selected.includes(cat.id)) hidden.push(cat.id)
                                }
                                return hidden
                            }
                            if (!showAllEvents && activePanel >= 4) {
                                // Each category panel: its editType is the category ID
                                const allCats = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]
                                const matchedCat = allCats.find(c => c.panelId === panelId)
                                let currentTypes = matchedCat ? [matchedCat.id] : []
                                if (panelId === 'weeklySpend') currentTypes = ['weeklySpend']
                                if (currentTypes.length === 0) return []
                                return allTypes.filter(t => !currentTypes.includes(t))
                            }
                            return []
                        })()}
                        currentEventType={activePanel >= 4 ? (() => {
                            const panelId = PANEL_STEPS[activePanel]
                            const allCats = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]
                            const matchedCat = allCats.find(c => c.panelId === panelId)
                            if (matchedCat) return matchedCat.id
                            if (panelId === 'weeklySpend') return 'weeklySpend'
                            return null
                        })() : null}
                        onEventClick={(evt, e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            const allEvts = buildGraphEvents(formData)
                            // Find all visible events on the same date
                            const sameDate = allEvts.filter(ev => ev.date === evt.date && !ev.noDot)
                            setNearbyEvents(sameDate.length > 1 ? sameDate : [])
                            setNearbyIdx(sameDate.length > 1 ? sameDate.findIndex(ev => ev.editType === evt.editType && ev.amount === evt.amount) : 0)
                            setEditingEvent({ ...evt, clickX: rect.left + rect.width / 2, clickY: rect.top })
                            setEditAmount(String(evt.amount))
                        }}
                        hideDots={PANEL_STEPS[activePanel] === 'summary'}
                        forceGreenDots={PANEL_STEPS[activePanel] === 'regularIncome'}
                        forceDotColor={PANEL_STEPS[activePanel] === 'regularIncome' ? 'green' : PANEL_STEPS[activePanel] === 'regularExpenses' ? 'red' : null}
                        onTermClick={activePanel === 0 ? (termId) => setExpandedTerms(prev => {
                            const next = new Set(prev)
                            if (next.has(termId)) next.delete(termId); else next.add(termId)
                            return next
                        }) : undefined}
                        onBalanceClick={undefined}
                    />
                </div>

                {/* Opaque backing behind sheet — covers rounded corner gaps and panel transitions */}
                <div style={{
                    position: 'absolute',
                    top: `calc(${COLLAPSED_TOP} + 20px)`,
                    left: 0, right: 0, bottom: 0,
                    background: '#f5f7f7',
                    zIndex: 1,
                    pointerEvents: 'none',
                }} />
                {/* Form card — draggable bottom sheet */}
                <div ref={(el) => { sheetRef.current = el; formCardCallbackRef(el) }} style={{
                    position: 'absolute',
                    top: COLLAPSED_TOP,
                    left: 0, right: 0, bottom: 0,
                    background: '#f5f7f7',
                    borderRadius: '28px 28px 0 0',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '0 -2px 8px rgba(0,0,0,0.15)',
                    transition: 'top 0.35s cubic-bezier(.25,1,.5,1)',
                    zIndex: 2,
                }}>
                    {/* Drag handle — tap to toggle expand/collapse */}
                    <div
                        onTouchStart={(e) => {
                            sheetDragRef.current._tapStartY = e.touches[0].clientY
                            sheetDragRef.current._tapMoved = false
                            handleSheetDragStart(e.touches[0].clientY)
                        }}
                        onTouchMove={(e) => {
                            const dy = Math.abs(e.touches[0].clientY - sheetDragRef.current._tapStartY)
                            if (dy > 5) sheetDragRef.current._tapMoved = true
                            e.preventDefault()
                            handleSheetDragMove(e.touches[0].clientY)
                        }}
                        onTouchEnd={() => {
                            if (!sheetDragRef.current._tapMoved) {
                                // Tap — toggle expand/collapse
                                sheetDragRef.current.dragging = false
                                if (sheetRef.current) {
                                    sheetRef.current.style.transition = 'top 0.35s cubic-bezier(.25,1,.5,1)'
                                    if (graphWrapRef.current) graphWrapRef.current.style.transition = 'opacity 0.35s ease, transform 0.35s ease'
                                    if (sheetExpanded) {
                                        sheetRef.current.style.top = COLLAPSED_TOP
                                        if (graphWrapRef.current) { graphWrapRef.current.style.opacity = '1'; graphWrapRef.current.style.transform = 'scale(1)' }
                                        setSheetExpanded(false)
                                    } else {
                                        sheetRef.current.style.top = EXPANDED_TOP
                                        if (graphWrapRef.current) { graphWrapRef.current.style.opacity = '0.3'; graphWrapRef.current.style.transform = 'scale(0.95)' }
                                        setSheetExpanded(true)
                                    }
                                }
                            } else {
                                handleSheetDragEnd()
                            }
                        }}
                        onMouseDown={(e) => {
                            handleSheetDragStart(e.clientY)
                            const onMove = (ev) => handleSheetDragMove(ev.clientY)
                            const onUp = () => { handleSheetDragEnd(); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
                            document.addEventListener('mousemove', onMove)
                            document.addEventListener('mouseup', onUp)
                        }}
                        style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', cursor: 'grab', touchAction: 'none', flexShrink: 0, background: '#f5f7f7' }}
                    >
                        <div style={{ width: 36, height: 4, borderRadius: 2, background: '#bbb' }} />
                    </div>
                    {/* Fixed title — draggable + tap to toggle */}
                    <div
                        onTouchStart={(e) => {
                            sheetDragRef.current._titleTapY = e.touches[0].clientY
                            sheetDragRef.current._titleMoved = false
                            handleSheetDragStart(e.touches[0].clientY)
                        }}
                        onTouchMove={(e) => {
                            const dy = Math.abs(e.touches[0].clientY - sheetDragRef.current._titleTapY)
                            if (dy > 5) sheetDragRef.current._titleMoved = true
                            e.preventDefault()
                            handleSheetDragMove(e.touches[0].clientY)
                        }}
                        onTouchEnd={() => {
                            if (!sheetDragRef.current._titleMoved) {
                                sheetDragRef.current.dragging = false
                                if (sheetRef.current) {
                                    sheetRef.current.style.transition = 'top 0.35s cubic-bezier(.25,1,.5,1)'
                                    if (graphWrapRef.current) graphWrapRef.current.style.transition = 'opacity 0.35s ease, transform 0.35s ease'
                                    if (sheetExpanded) {
                                        sheetRef.current.style.top = COLLAPSED_TOP
                                        if (graphWrapRef.current) { graphWrapRef.current.style.opacity = '1'; graphWrapRef.current.style.transform = 'scale(1)' }
                                        setSheetExpanded(false)
                                    } else {
                                        sheetRef.current.style.top = EXPANDED_TOP
                                        if (graphWrapRef.current) { graphWrapRef.current.style.opacity = '0.3'; graphWrapRef.current.style.transform = 'scale(0.95)' }
                                        setSheetExpanded(true)
                                    }
                                }
                            } else {
                                handleSheetDragEnd()
                            }
                        }}
                        style={{ touchAction: 'none', cursor: 'grab', flexShrink: 0, background: '#f5f7f7', borderBottom: `1px solid ${titleBorderVisible ? '#e0e0e0' : 'transparent'}`, transition: 'border-color 0.2s ease' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 24px 8px' }}>
                            <h2 style={{
                                fontSize: 22, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                                color: '#000', margin: 0, flex: 1,
                                display: 'flex', alignItems: 'center', gap: 8,
                            }}>
                                {(() => {
                                    const pid = PANEL_STEPS[activePanel]
                                    const cat = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].find(c => c.panelId === pid)
                                    if (cat) {
                                        const isExp = EXPENSE_CATEGORIES.includes(cat)
                                        const iconColor = isExp ? '#e06470' : '#147b75'
                                        return (
                                            <>
                                                <div style={{
                                                    width: 30, height: 30, borderRadius: '50%',
                                                    background: isExp ? 'rgba(224,100,112,0.10)' : 'rgba(20,123,117,0.10)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    flexShrink: 0,
                                                }}>
                                                    <cat.Icon size={17} color={iconColor} />
                                                </div>
                                                {cat.label}
                                            </>
                                        )
                                    }
                                    return PANEL_HEADING_MAP[pid] || ''
                                })()}
                                {activePanel >= 4 && PANEL_STEPS[activePanel] !== 'summary' && (
                                    <div
                                        onTouchStart={(e) => e.stopPropagation()}
                                        onTouchEnd={(e) => e.stopPropagation()}
                                        onTouchMove={(e) => e.stopPropagation()}
                                        onClick={(e) => { e.stopPropagation(); setShowDotHint(p => !p) }}
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer', flexShrink: 0,
                                            padding: 2,
                                        }}
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="10" />
                                            <path d="M12 16v-4M12 8h.01" />
                                        </svg>
                                    </div>
                                )}
                            </h2>
                            {PANEL_STEPS[activePanel] === 'termDates' && defaultTermDatesRef.current &&
                                JSON.stringify(formData.termDates) !== JSON.stringify(defaultTermDatesRef.current) && (
                                <button
                                    onTouchStart={(e) => e.stopPropagation()}
                                    onTouchEnd={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        updateField('termDates', JSON.parse(JSON.stringify(defaultTermDatesRef.current)))
                                        setExpandedTerms(new Set())
                                    }}
                                    style={{
                                        background: 'none', border: '1.5px solid #ddd',
                                        borderRadius: 20, cursor: 'pointer',
                                        padding: '4px 12px',
                                        fontSize: 12, fontWeight: 700,
                                        fontFamily: 'Nunito, sans-serif',
                                        color: '#888', whiteSpace: 'nowrap',
                                        display: 'flex', alignItems: 'center', gap: 4,
                                    }}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M1 4v6h6" />
                                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                                    </svg>
                                    Reset
                                </button>
                            )}
                            {(() => {
                                const pid = PANEL_STEPS[activePanel]
                                const hiddenPanels = ['termDates', 'balance', 'overdraft', 'regularIncome', 'regularExpenses', 'summary']
                                if (hiddenPanels.includes(pid)) return null
                                const incPanelIds = INCOME_CATEGORIES.map(c => c.panelId)
                                const expPanelIds = EXPENSE_CATEGORIES.map(c => c.panelId)
                                const incEditTypes = new Set(INCOME_CATEGORIES.map(c => c.id))
                                const expEditTypes = new Set(EXPENSE_CATEGORIES.map(c => c.id))
                                const isIncPanel = incPanelIds.includes(pid)
                                const isExpPanel = expPanelIds.includes(pid)
                                if (!isIncPanel && !isExpPanel) return null
                                // Show button when 2+ categories selected total (income + expense combined)
                                const totalSelected = (formData.incomeSources || []).length + (formData.expenseSources || []).length
                                if (totalSelected < 2) return null
                                const otherPanels = ['oneOffItems', 'weeklySpend']
                                const btnColor = isIncPanel ? '#147b75'
                                    : isExpPanel ? '#e06470'
                                        : otherPanels.includes(pid) ? '#e06470' : '#147b75'
                                return (
                                    <button
                                        onTouchStart={(e) => e.stopPropagation()}
                                        onTouchEnd={(e) => e.stopPropagation()}
                                        onClick={(e) => { e.stopPropagation(); setShowAllEvents(s => !s) }}
                                        style={{
                                            background: showAllEvents ? btnColor : '#e8e8e8',
                                            border: 'none', borderRadius: 20, cursor: 'pointer',
                                            padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5,
                                            transition: 'background 0.2s ease', flexShrink: 0,
                                        }}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={showAllEvents ? '#fff' : '#777'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
                                            color: showAllEvents ? '#fff' : '#777',
                                        }}>
                                            Show all
                                        </span>
                                    </button>
                                )
                            })()}
                        </div>
                        {/* Dot hint tooltip */}
                        <div style={{
                            display: 'grid',
                            gridTemplateRows: showDotHint ? '1fr' : '0fr',
                            transition: 'grid-template-rows 0.3s ease',
                            overflow: 'hidden',
                        }}>
                            <div style={{ overflow: 'hidden' }}>
                                <p style={{
                                    fontSize: 12, fontFamily: 'Nunito, sans-serif',
                                    color: '#999', margin: 0, lineHeight: 1.4,
                                    padding: '0 24px 8px',
                                }}>
                                    Tap a dot on the graph to change the amount, adjust the date, or skip it.
                                </p>
                            </div>
                        </div>
                    </div>
                    {/* Income/expense indicator strip — draggable + tap to toggle */}
                    <div
                        onTouchStart={(e) => {
                            sheetDragRef.current._tapStartY2 = e.touches[0].clientY
                            sheetDragRef.current._tapMoved2 = false
                            handleSheetDragStart(e.touches[0].clientY)
                        }}
                        onTouchMove={(e) => {
                            const dy = Math.abs(e.touches[0].clientY - sheetDragRef.current._tapStartY2)
                            if (dy > 5) sheetDragRef.current._tapMoved2 = true
                            e.preventDefault()
                            handleSheetDragMove(e.touches[0].clientY)
                        }}
                        onTouchEnd={() => {
                            if (!sheetDragRef.current._tapMoved2) {
                                sheetDragRef.current.dragging = false
                                if (sheetRef.current) {
                                    sheetRef.current.style.transition = 'top 0.35s cubic-bezier(.25,1,.5,1)'
                                    if (graphWrapRef.current) graphWrapRef.current.style.transition = 'opacity 0.35s ease, transform 0.35s ease'
                                    if (sheetExpanded) {
                                        sheetRef.current.style.top = COLLAPSED_TOP
                                        if (graphWrapRef.current) { graphWrapRef.current.style.opacity = '1'; graphWrapRef.current.style.transform = 'scale(1)' }
                                        setSheetExpanded(false)
                                    } else {
                                        sheetRef.current.style.top = EXPANDED_TOP
                                        if (graphWrapRef.current) { graphWrapRef.current.style.opacity = '0.3'; graphWrapRef.current.style.transform = 'scale(0.95)' }
                                        setSheetExpanded(true)
                                    }
                                }
                            } else {
                                handleSheetDragEnd()
                            }
                        }}
                        onMouseDown={(e) => {
                            handleSheetDragStart(e.clientY)
                            const onMove = (ev) => handleSheetDragMove(ev.clientY)
                            const onUp = () => { handleSheetDragEnd(); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
                            document.addEventListener('mousemove', onMove)
                            document.addEventListener('mouseup', onUp)
                        }}
                        style={{ touchAction: 'none', cursor: 'grab', flexShrink: 0 }}
                    >
                    {(() => {
                        const panelId = PANEL_STEPS[activePanel]
                        const incomeTypes = ['regularIncome', ...INCOME_CATEGORIES.map(c => c.panelId)]
                        const expenseTypes = ['regularExpenses', ...EXPENSE_CATEGORIES.map(c => c.panelId)]
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
                                height: 0,
                                background: stripColor || 'transparent',
                                borderRadius: '16px 16px 0 0',
                                flexShrink: 0,
                                transition: 'height 0.3s ease, background 0.3s ease',
                                overflow: 'hidden',
                            }} />
                        )
                    })()}
                    </div>

                    {/* Panel content area */}
                    <div
                        ref={(el) => {
                            if (!el || prevActivePanelRef.current === activePanel) return
                            prevActivePanelRef.current = activePanel
                            // Scroll new active panel to top
                            const panels = el.querySelectorAll('.onboarding-panel')
                            panels.forEach(p => { p.scrollTop = 0 })
                            setTitleBorderVisible(false)
                        }}
                        style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#f5f7f7' }}>
                        {PANEL_STEPS.map((panelId, i) => (
                            <div key={panelId} data-active-panel={i === activePanel ? '' : undefined} className="onboarding-panel"
                                onScroll={i === activePanel ? (e) => setTitleBorderVisible(e.target.scrollTop > 2) : undefined}
                                style={{
                                position: 'absolute', inset: 0,
                                display: 'flex', flexDirection: 'column',
                                overflowY: i === activePanel ? 'auto' : 'hidden',
                                overflowX: 'hidden',
                                WebkitOverflowScrolling: 'touch',
                                opacity: 1,
                                zIndex: i === activePanel ? 2 : 1,
                                pointerEvents: i === activePanel ? 'auto' : 'none',
                                background: '#f5f7f7',
                                paddingBottom: 'calc(90px + env(safe-area-inset-bottom, 0px))',
                            }}>
                                {panelId === 'termDates' && (
                                    <TermDatesStep
                                        termData={formData.termDates}
                                        updateTermDates={(data) => updateField('termDates', data)}
                                        expandedTerms={activeExpanded}
                                        onExpandedTermChange={(termId) => setExpandedTerms(prev => {
                                            const next = new Set(prev)
                                            if (next.has(termId)) next.delete(termId); else next.add(termId)
                                            return next
                                        })}
                                        subtitle={formData.university === 'University of Bristol'
                                            ? "These are the correct dates for the University of Bristol."
                                            : "Enter your term dates and any holidays or breaks you'd like to add."}
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
                                {/* ── Generic category steps (all income & expense) ── */}
                                {(() => {
                                    const cat = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].find(c => c.panelId === panelId)
                                    if (!cat) return null
                                    const formKey = cat.formKey
                                    let entries = formData[formKey] || []
                                    if (entries.length === 0) {
                                        const defaultEntry = {
                                            id: `${cat.id}_0`,
                                            amount: '',
                                            frequency: cat.defaultFrequency,
                                            nextDate: '',
                                            months: [...(cat.defaultMonths || [])],
                                            dates: { ...(cat.defaultDates || {}) },
                                            instalmentAmounts: {},
                                        }
                                        entries = [defaultEntry]
                                        // Persist to formData so addEntry works correctly
                                        setTimeout(() => setFormData(prev => prev[formKey]?.length ? prev : { ...prev, [formKey]: [defaultEntry] }), 0)
                                    }
                                    return (
                                        <CategoryStep
                                            categoryId={cat.id}
                                            entries={entries}
                                            updateEntries={(entriesOrFn) => {
                                                setFormData(prev => {
                                                    const prevEntries = prev[formKey] || entries
                                                    const newEntries = typeof entriesOrFn === 'function' ? entriesOrFn(prevEntries) : entriesOrFn
                                                    return { ...prev, [formKey]: newEntries }
                                                })
                                            }}
                                        />
                                    )
                                })()}
                                {panelId === 'regularExpenses' && (
                                    <RegularExpensesStep
                                        expenseSources={formData.expenseSources || []}
                                        updateExpenseSources={(val) => updateField('expenseSources', val)}
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

                                    const INCOME_SOURCE_MAP = INCOME_CATEGORIES.map(cat => ({
                                        id: cat.id, label: cat.label, editType: cat.id, panelId: cat.panelId
                                    }))
                                    const EXPENSE_SOURCE_MAP = EXPENSE_CATEGORIES.map(cat => ({
                                        id: cat.id, label: cat.label, editType: cat.id, panelId: cat.panelId
                                    }))

                                    const getYearly = (editTypes, includeNoDot = false) => allEvts.filter(e => editTypes.includes(e.editType) && !e.removed && (includeNoDot || !e.noDot)).reduce((s, e) => s + e.amount, 0)

                                    const incomeSources = INCOME_SOURCE_MAP.filter(s => (formData.incomeSources || []).includes(s.id))
                                    const expenseSources = EXPENSE_SOURCE_MAP.filter(s => (formData.expenseSources || []).includes(s.id))
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

                                    const EXTRA_ICONS = { weeklySpend: { Icon: PiShoppingCart, color: '#e06470' } }
                                    const SummaryRow = ({ sourceId, label, amount, color, isExpense, onTap }) => {
                                        const si = SOURCE_ICONS[sourceId] || EXTRA_ICONS[sourceId]
                                        const IconComp = si?.Icon
                                        const iconColor = isExpense ? '#e06470' : '#147b75'
                                        return (
                                            <div onClick={onTap} style={{
                                                display: 'flex', alignItems: 'center', padding: '10px 14px', gap: 10,
                                                cursor: onTap ? 'pointer' : 'default',
                                                background: '#fff', borderRadius: 12, marginBottom: 6,
                                            }}>
                                                <div style={{
                                                    width: 30, height: 30, borderRadius: '50%',
                                                    background: `${iconColor}12`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    flexShrink: 0,
                                                }}>
                                                    {IconComp && <IconComp size={16} color={iconColor} />}
                                                </div>
                                                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, fontFamily: F, color: '#333' }}>{label}</span>
                                                <span style={{ fontSize: 14, fontWeight: 700, fontFamily: F, color }}>{fmtK(amount)}/yr</span>
                                                {onTap && chevron}
                                            </div>
                                        )
                                    }

                                    const F = 'Nunito, sans-serif'
                                    const cardStyle = {
                                        background: '#fff', borderRadius: 12, padding: '10px 14px',
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        cursor: 'pointer', marginBottom: 6,
                                    }
                                    const sectionHeader = (icon, label, color) => (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 4px 6px' }}>
                                            {icon}
                                            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: F, color: '#333' }}>{label}</span>
                                        </div>
                                    )

                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                                            <div style={{ padding: '18px 24px 0', flexShrink: 0 }}>
                                                <h2 style={{ fontSize: 25, fontWeight: 700, fontFamily: F, color: '#000', margin: '0 0 4px', lineHeight: 1.3 }}>Your Budget</h2>
                                                <p style={{ fontSize: 14, fontFamily: F, color: '#444', margin: '0 0 16px', lineHeight: 1.5 }}>Here's a summary of your finances for the year.</p>
                                            </div>
                                            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', padding: '0 24px 16px' }}>
                                                {/* Bank balance & overdraft */}
                                                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                                    <div onClick={() => goToPanel('balance')} style={{ ...cardStyle, flex: 1, marginBottom: 0 }}>
                                                        <div style={{ flex: 1 }}>
                                                            <p style={{ fontSize: 11, fontWeight: 600, fontFamily: F, color: '#999', margin: 0 }}>Balance</p>
                                                            <p style={{ fontSize: 16, fontWeight: 800, fontFamily: F, color: '#333', margin: '2px 0 0' }}>{sym}{Math.round(parseFloat(String(formData.balance || '0').replace(/,/g, ''))).toLocaleString()}</p>
                                                        </div>
                                                        {chevron}
                                                    </div>
                                                    <div onClick={() => goToPanel('overdraft')} style={{ ...cardStyle, flex: 1, marginBottom: 0 }}>
                                                        <div style={{ flex: 1 }}>
                                                            <p style={{ fontSize: 11, fontWeight: 600, fontFamily: F, color: '#999', margin: 0 }}>Overdraft</p>
                                                            <p style={{ fontSize: 16, fontWeight: 800, fontFamily: F, color: '#333', margin: '2px 0 0' }}>{formData.overdraft ? `${sym}${Math.round(parseFloat(String(formData.overdraft).replace(/,/g, ''))).toLocaleString()}` : 'None'}</p>
                                                        </div>
                                                        {chevron}
                                                    </div>
                                                </div>

                                                {/* Yearly Overview */}
                                                {(() => {
                                                    const total = totalIncome + totalExpense
                                                    const spendPct = total > 0 ? Math.round((totalExpense / total) * 100) : 50
                                                    return (
                                                        <div style={{ marginBottom: 8, background: '#fff', borderRadius: 12, padding: '12px 14px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                                                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: F, color: '#333' }}>
                                                                    Yearly Overview
                                                                </span>
                                                                <span style={{
                                                                    fontSize: 14, fontWeight: 800, fontFamily: F,
                                                                    color: net >= 0 ? '#147b75' : '#e06470',
                                                                }}>
                                                                    {net >= 0 ? '+' : '\u2212'}{sym}{Math.abs(Math.round(net)).toLocaleString()}
                                                                </span>
                                                            </div>
                                                            <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: '#f0f0f0', marginBottom: 8 }}>
                                                                <div style={{ height: '100%', width: `${100 - spendPct}%`, background: '#147b75', borderRadius: spendPct <= 0 ? 3 : '3px 0 0 3px', transition: 'width 0.4s ease' }} />
                                                                <div style={{ height: '100%', width: `${spendPct}%`, background: '#e06470', borderRadius: spendPct >= 100 ? 3 : '0 3px 3px 0', transition: 'width 0.4s ease' }} />
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: F, color: '#147b75' }}>Income {sym}{Math.round(totalIncome).toLocaleString()}</span>
                                                                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: F, color: '#e06470' }}>Spend {sym}{Math.round(totalExpense).toLocaleString()}</span>
                                                            </div>
                                                        </div>
                                                    )
                                                })()}

                                                {/* Income section */}
                                                {incomeSources.length > 0 && (
                                                    <div style={{ marginBottom: 4 }}>
                                                        {sectionHeader(<PiTrendUp size={15} color="#147b75" />, 'Income')}
                                                        {incomeSources.map(s => <SummaryRow key={s.id} sourceId={s.id} label={s.label} amount={getYearly([s.editType])} color="rgba(20,123,117,0.8)" onTap={() => goToPanel(s.panelId)} />)}
                                                    </div>
                                                )}

                                                {/* Expense section */}
                                                {expenseSources.length > 0 && (
                                                    <div style={{ marginBottom: 4 }}>
                                                        {sectionHeader(<PiTrendDown size={15} color="#e06470" />, 'Expenses')}
                                                        {expenseSources.map(s => <SummaryRow key={s.id} sourceId={s.id} label={s.label} amount={getYearly([s.editType])} color="rgba(224,100,112,0.8)" isExpense onTap={() => goToPanel(s.panelId)} />)}
                                                        {weeklySpendAmt > 0 && (
                                                            <SummaryRow sourceId="weeklySpend" label="Weekly Spend" amount={getYearly(['weeklySpend'], true)} color="rgba(224,100,112,0.8)" isExpense onTap={() => goToPanel('weeklySpend')} />
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })()}

                            </div>
                        ))}
                    </div>

                </div>

                {/* Floating bottom buttons — solid blocker + gradient fade */}
                <div style={{
                    position: 'absolute',
                    bottom: 0, left: 0, right: 0,
                    zIndex: 5,
                    display: 'flex', flexDirection: 'column',
                }}>
                    {/* Transparent gradient — allows scroll through */}
                    <div style={{ height: 24, background: 'linear-gradient(to bottom, rgba(255,255,255,0), #fff)', pointerEvents: 'none' }} />
                    {/* Solid area — blocks clicks to content behind */}
                    <div style={{
                        background: '#fff',
                        padding: '4px 24px calc(14px + env(safe-area-inset-bottom, 0px))',
                        display: 'flex', alignItems: 'center', gap: 0,
                    }}>
                    <button
                        onClick={panelOnBack}
                        style={{
                            width: activePanel > 0 ? 48 : 0,
                            height: 48, borderRadius: 50,
                            border: 'none', background: '#e8e8e8',
                            cursor: 'pointer', padding: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, overflow: 'hidden',
                            marginRight: activePanel > 0 ? 12 : 0,
                            opacity: activePanel > 0 ? 1 : 0,
                            transition: 'width 0.3s cubic-bezier(.25,1,.5,1), opacity 0.2s ease, margin-right 0.3s cubic-bezier(.25,1,.5,1)',
                            pointerEvents: 'auto',
                        }}
                    >
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
                            <path d="M12 15L7 10L12 5" stroke="#4b4a4a"
                                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                    <button
                        onClick={panelOnNext}
                        style={{
                            flex: 1, height: 48,
                            background: '#147b75',
                            color: '#fff',
                            border: 'none', borderRadius: 50,
                            fontSize: 16, fontWeight: 700,
                            fontFamily: 'Nunito, sans-serif',
                            cursor: 'pointer', letterSpacing: 0.3,
                            overflow: 'hidden', whiteSpace: 'nowrap',
                        }}
                    >
                        {returnToSummaryRef.current ? 'Save' : PANEL_LABELS[activePanel]}
                    </button>
                    <button
                        onClick={handlePanelSkip}
                        style={{
                            background: 'none', border: 'none',
                            cursor: 'pointer', padding: '0 4px',
                            fontSize: 13, fontWeight: 600,
                            fontFamily: 'Nunito, sans-serif',
                            color: '#888', whiteSpace: 'nowrap',
                            flexShrink: 0, overflow: 'hidden',
                            width: (PANEL_TO_SOURCE[PANEL_STEPS[activePanel]] || PANEL_STEPS[activePanel] === 'oneOffItems') ? 36 : 0,
                            opacity: (PANEL_TO_SOURCE[PANEL_STEPS[activePanel]] || PANEL_STEPS[activePanel] === 'oneOffItems') ? 1 : 0,
                            marginLeft: (PANEL_TO_SOURCE[PANEL_STEPS[activePanel]] || PANEL_STEPS[activePanel] === 'oneOffItems') ? 12 : 0,
                            transition: 'width 0.3s cubic-bezier(.25,1,.5,1), opacity 0.2s ease, margin-left 0.3s cubic-bezier(.25,1,.5,1)',
                        }}
                    >
                        Skip
                    </button>
                    </div>
                </div>

                {/* Event edit modal */}
                {editingEvent && (() => {
                    const isIncome = editingEvent.type === 'income'
                    const color = isIncome ? '#147b75' : '#e06470'
                    const lightBg = isIncome ? 'rgba(20,123,117,0.06)' : 'rgba(224,100,112,0.06)'
                    return (
                        <>
                            <div
                                onClick={() => { setEditingEvent(null); setNearbyEvents([]); setNearbyIdx(0) }}
                                style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.15)' }}
                            />
                            <div style={{
                                position: 'fixed',
                                left: Math.max(8, Math.min(editingEvent.clickX - 135, window.innerWidth - 278)),
                                top: editingEvent.clickY + 18,
                                width: 270,
                                background: '#fff',
                                borderRadius: 14,
                                zIndex: 101,
                                boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
                                padding: '12px 14px',
                            }}>
                                {/* Close button — top right */}
                                <div
                                    onClick={() => { setEditingEvent(null); setNearbyEvents([]); setNearbyIdx(0) }}
                                    style={{
                                        position: 'absolute', top: 10, right: 10,
                                        width: 28, height: 28, borderRadius: '50%',
                                        background: '#f0f0f0',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', zIndex: 1,
                                    }}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2.5" strokeLinecap="round">
                                        <path d="M18 6L6 18M6 6l12 12" />
                                    </svg>
                                </div>

                                {/* Nearby event pills */}
                                {nearbyEvents.length > 1 && (
                                    <div style={{ display: 'flex', gap: 5, marginBottom: 10, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingRight: 36 }}>
                                        {nearbyEvents.map((ev, idx) => {
                                            const active = idx === nearbyIdx
                                            const evColor = ev.type === 'income' ? '#147b75' : '#e06470'
                                            return (
                                                <button key={`${ev.editType}-${idx}`}
                                                    onClick={() => {
                                                        setNearbyIdx(idx)
                                                        setEditingEvent(prev => ({ ...prev, ...ev, removed: !!ev.removed }))
                                                        setEditAmount(String(ev.amount))
                                                    }}
                                                    style={{
                                                        padding: '4px 10px', borderRadius: 16, border: 'none',
                                                        fontSize: 11, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                                                        background: active ? evColor : `${evColor}10`,
                                                        color: active ? '#fff' : evColor,
                                                        cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                                                        transition: 'all 0.15s ease',
                                                    }}
                                                >
                                                    {ev.label || ev.sublabel}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}

                                {/* Header */}
                                <div style={{ marginBottom: 12, paddingRight: 36 }}>
                                    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#222', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                        {editingEvent.label || editingEvent.sublabel}
                                    </div>
                                    <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#999', marginTop: 2 }}>
                                        {editingEvent.date ? new Date(editingEvent.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
                                    </div>
                                </div>

                                {editingEvent.removed ? (
                                    <button
                                        onClick={() => {
                                            const key = `${editingEvent.editType}:${editingEvent.date}`
                                            updateField('removedEvents', (formData.removedEvents || []).filter(k => k !== key))
                                            setEditingEvent(null)
                                        }}
                                        style={{
                                            width: '100%', height: 40, border: 'none', borderRadius: 10,
                                            background: color,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#fff' }}>Restore</span>
                                    </button>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {/* Balance after — live updated, same width as input */}
                                        {editingEvent.balanceAfter != null && (() => {
                                            const origAmt = editingEvent.amount || 0
                                            const newAmt = parseFloat(editAmount.replace(/[^0-9.]/g, '')) || 0
                                            const diff = editingEvent.type === 'income' ? (newAmt - origAmt) : (origAmt - newAmt)
                                            const liveBalance = editingEvent.balanceAfter + diff
                                            const balColor = liveBalance >= 0 ? '#147b75' : '#e06470'
                                            const balBg = liveBalance >= 0 ? 'rgba(20,123,117,0.06)' : 'rgba(224,100,112,0.06)'
                                            return (
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    background: balBg, borderRadius: 10,
                                                    padding: '6px 12px', marginBottom: 4,
                                                }}>
                                                    <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#999' }}>
                                                        Balance after
                                                    </span>
                                                    <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: balColor }}>
                                                        {liveBalance < 0 ? '-' : ''}{getCurrencySymbol()}{Math.abs(Math.round(liveBalance)).toLocaleString()}
                                                    </span>
                                                </div>
                                            )
                                        })()}
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            {/* Amount input */}
                                            <div style={{
                                                flex: 1, minWidth: 0, display: 'flex', alignItems: 'center',
                                                border: '1px solid #e8e8e8', borderRadius: 8,
                                                padding: '0 8px', height: 34, gap: 3, background: '#fff', minWidth: 0, flexShrink: 0,
                                            }}>
                                                <span style={{ fontSize: 15, fontWeight: 600, color: '#999', fontFamily: 'Nunito, sans-serif' }}>{getCurrencySymbol()}</span>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={formatMoney(editAmount)}
                                                    onChange={(e) => setEditAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                                                    ref={(el) => el && setTimeout(() => el.focus({ preventScroll: true }), 50)}
                                                    style={{
                                                        flex: 1, border: 'none', background: 'transparent',
                                                        fontSize: 16, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                                                        color: '#000', outline: 'none', padding: 0, minWidth: 0,
                                                    }}
                                                />
                                            </div>

                                            {/* Save button */}
                                            <button
                                                onClick={() => {
                                                    const val = editAmount.replace(/[^0-9.]/g, '')
                                                    const cat = CATEGORY_MAP[editingEvent.editType]
                                                    if (cat) {
                                                        const formKey = cat.formKey
                                                        setFormData(prev => {
                                                            const entries = prev[formKey] || []
                                                            if (editingEvent.editMonth) {
                                                                // Irregular: update instalment amount for this month
                                                                return { ...prev, [formKey]: entries.map(e => ({
                                                                    ...e,
                                                                    instalmentAmounts: { ...(e.instalmentAmounts || {}), [editingEvent.editMonth]: val }
                                                                }))}
                                                            } else {
                                                                // Single-amount entries: update first entry's amount
                                                                // (for multi-entry, match by date if possible)
                                                                const matchIdx = entries.findIndex(e => {
                                                                    if (e.nextDate === editingEvent.date) return true
                                                                    return false
                                                                })
                                                                const idx = matchIdx >= 0 ? matchIdx : 0
                                                                return { ...prev, [formKey]: entries.map((e, i) => i === idx ? { ...e, amount: val } : e) }
                                                            }
                                                        })
                                                    }
                                                    setEditingEvent(null)
                                                }}
                                                style={{
                                                    height: 38, borderRadius: 10, border: 'none',
                                                    background: color, padding: '0 16px',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: 'pointer', flexShrink: 0,
                                                }}
                                            >
                                                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#fff' }}>Save</span>
                                            </button>
                                            {/* Skip button */}
                                            <button
                                                onClick={() => {
                                                    const key = `${editingEvent.editType}:${editingEvent.date}`
                                                    updateField('removedEvents', [...(formData.removedEvents || []), key])
                                                    setEditingEvent(null)
                                                }}
                                                style={{
                                                    height: 38, borderRadius: 10, border: 'none',
                                                    background: 'rgba(224,100,112,0.08)', padding: '0 12px',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
                                                }}
                                            >
                                                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#e06470' }}>
                                                    Skip {(() => {
                                                        if (!editingEvent.date) return ''
                                                        const cat = CATEGORY_MAP[editingEvent.editType]
                                                        const freq = cat ? (formData[cat.formKey]?.[0]?.frequency || cat.defaultFrequency) : 'monthly'
                                                        if (freq === 'weekly') return 'week'
                                                        if (freq === 'fortnightly') return 'fortnight'
                                                        return new Date(editingEvent.date + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long' })
                                                    })()}
                                                </span>
                                            </button>
                                        </div>
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
