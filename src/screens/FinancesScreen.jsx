import { useState, useEffect, useRef, useCallback } from 'react'
import { Collapse, Input, Radio, Button, Typography, message, Badge, Modal } from 'antd'
import { ChevronDown } from '@untitledui/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { saveUserFinances, saveCashflowForecast, fetchUserData } from '../lib/api'
import NativeSelect from '../components/NativeSelect'
import {
    analytics,
    FINANCE_EVENTS,
    LOAN_EVENTS,
    TRANSACTION_EVENTS,
    getStudentLoanProperties,
    getBursaryProperties,
    getErrorProperties,
    getFinanceFieldProperties
} from '../lib/analytics/index.js'

import {
    STEPS,
    WEEKLY_SPEND_OPTIONS,
    UK_UNIVERSITIES,
    MONTH_LABELS,
    ALL_MONTH_KEYS,
    OTHER_INCOME_TYPE_OPTIONS,
    OTHER_INCOME_FREQ_OPTIONS,
    REGULAR_FREQ_OPTIONS,
    PAYMENT_TYPE_OPTIONS,
    INITIAL_FORM_DATA,
    DEFAULT_BURSARY_DATES
} from '../config/onboardingConfig'

// Lookup step config by id
const getStep = (id) => STEPS.find(s => s.id === id) || {}

const { Title, Text } = Typography
const { Panel } = Collapse

// Helper to format money
const formatMoney = raw => {
    const cleaned = raw.replace(/[^0-9.]/g, '')
    const parts = cleaned.split('.')
    const whole = parts[0] || ''
    const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return parts.length > 1 ? `${formatted}.${parts[1]}` : formatted
}

// Helper to check if end date is in the past
const isEndDatePast = endDate => {
    if (!endDate) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const end = new Date(endDate)
    return end < today
}

// Helper to sort items - past end dates to bottom
const sortByEndDate = items => {
    return [...items].sort((a, b) => {
        const aIsPast = isEndDatePast(a.endDate)
        const bIsPast = isEndDatePast(b.endDate)
        if (aIsPast && !bIsPast) return 1
        if (!aIsPast && bIsPast) return -1
        return 0
    })
}


// Helper to get default date (15th) for a student loan month
const getDefaultDateForMonth = (monthKey) => {
    const monthIndex = {
        september: 8, october: 9, november: 10, december: 11,
        january: 0, february: 1, march: 2, april: 3,
        may: 4, june: 5, july: 6, august: 7
    }
    const month = monthIndex[monthKey]
    const today = new Date()
    const currentYear = today.getFullYear()
    const currentMonth = today.getMonth()
    const academicYearStart = currentMonth >= 8 ? currentYear : currentYear - 1
    const year = month >= 8 ? academicYearStart : academicYearStart + 1
    const pad = n => String(n).padStart(2, '0')
    return `${year}-${pad(month + 1)}-15`
}

// Helper to extract month key from a date string
const getMonthKeyFromDate = (dateStr) => {
    if (!dateStr) return null
    const date = new Date(dateStr)
    const month = date.getMonth() // 0-11
    const monthKeys = {
        8: 'september', 9: 'october', 10: 'november', 11: 'december',
        0: 'january', 1: 'february', 2: 'march', 3: 'april',
        4: 'may', 5: 'june', 6: 'july', 7: 'august'
    }
    return monthKeys[month] || null
}

// YesNo component
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

export default function FinancesScreen() {
    const navigate = useNavigate()
    const location = useLocation()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [formData, setFormData] = useState({ ...INITIAL_FORM_DATA })
    const [initialFormData, setInitialFormData] = useState({ ...INITIAL_FORM_DATA })
    const [messageApi, contextHolder] = message.useMessage({ maxCount: 1 })

    // Check if there are unsaved changes
    const hasUnsavedChanges = JSON.stringify(formData) !== JSON.stringify(initialFormData)

    const getIncompleteFields = useCallback((data) => {
        const issues = []

        if (data.studentLoan) {
            if (!data.loanAmount) {
                issues.push('Student Loan: please enter your yearly loan amount')
            }
            if (data.loanKnowDates === null) {
                issues.push('Student Loan: please select whether you know the exact instalment dates')
            } else if (data.loanKnowDates === true) {
                const hasEmptyDates = !(data.instalmentDates || []).length || (data.instalmentDates || []).some(d => !d)
                if (hasEmptyDates) {
                    issues.push('Student Loan: missing dates for instalments')
                }
            } else if (data.loanKnowDates === false) {
                if (!data.loanMonths || data.loanMonths.length === 0) {
                    issues.push('Student Loan: please select at least one instalment month')
                }
            }
        }

        if (data.bursary) {
            if (!data.bursaryAmount) {
                issues.push('Bursary: please enter your yearly bursary amount')
            }
            const hasEmptyBursaryDates = !data.bursaryDates.length || data.bursaryDates.some(d => !d)
            if (hasEmptyBursaryDates) {
                issues.push('Bursary: missing dates for instalments')
            }
        }

        if (data.otherIncome) {
            const missingAmount = data.otherIncomeItems.some(item => !item.amount)
            const missingDate = data.otherIncomeItems.some(item => !item.date)
            if (missingAmount) issues.push('Other Regular Income: please enter an amount for each item')
            if (missingDate) issues.push('Other Regular Income: please enter a start date for each item')
        }

        if (data.regularExpense) {
            const missingAmount = data.regularExpenseItems.some(item => !item.amount)
            const missingDate = data.regularExpenseItems.some(item => !item.date)
            if (missingAmount) issues.push('Regular Expenses: please enter an amount for each item')
            if (missingDate) issues.push('Regular Expenses: please enter a start date for each item')
        }

        if (data.oneOffIncome) {
            const missingAmount = data.oneOffIn.some(item => !item.amount)
            const missingDate = data.oneOffIn.some(item => !item.date)
            if (missingAmount) issues.push('One-off Income: please enter an amount for each item')
            if (missingDate) issues.push('One-off Income: please enter a date for each item')
        }

        if (data.oneOffExpenses) {
            const missingAmount = data.oneOffOut.some(item => !item.amount)
            const missingDate = data.oneOffOut.some(item => !item.date)
            if (missingAmount) issues.push('One-off Expenses: please enter an amount for each item')
            if (missingDate) issues.push('One-off Expenses: please enter a date for each item')
        }

        return issues
    }, [])

    // Use refs so the click listener always sees latest values without re-registering
    const hasUnsavedChangesRef = useRef(false)
    hasUnsavedChangesRef.current = hasUnsavedChanges
    const formDataRef = useRef(formData)
    formDataRef.current = formData
    const initialFormDataRef = useRef(initialFormData)
    initialFormDataRef.current = initialFormData
    const handleSaveRef = useRef(null)

    const trackedRef = useRef(false)

    useEffect(() => {
        if (!trackedRef.current) {
            trackedRef.current = true
            analytics.track(FINANCE_EVENTS.SCREEN_VIEWED)
        }
        loadUserData()
    }, [])

    // Block navigation when there are unsaved changes
    useEffect(() => {
        const handleClick = (e) => {
            if (!hasUnsavedChangesRef.current) return

            // Check for <a href="/..."> links or BottomNav [data-href] divs
            const linkTarget = e.target.closest('a[href]')
            const navTarget = e.target.closest('[data-href]')
            const target = linkTarget || navTarget
            if (!target) return

            const href = linkTarget
                ? target.getAttribute('href')
                : target.getAttribute('data-href')
            if (!href || !href.startsWith('/') || href === location.pathname) return

            e.preventDefault()
            e.stopPropagation()

            const issues = getIncompleteFields(formDataRef.current)
            if (issues.length > 0) {
                // Track warning shown
                analytics.track(FINANCE_EVENTS.UNSAVED_WARNING_SHOWN, {
                    reason: 'incomplete_fields',
                    incomplete_field_count: issues.length
                })

                Modal.confirm({
                    title: 'Incomplete fields',
                    content: (
                        <div>
                            <p>You have incomplete fields:</p>
                            <ul style={{ paddingLeft: 20, margin: '8px 0 16px', maxHeight: 200, overflowY: 'auto' }}>
                                {issues.map((issue, i) => (
                                    <li key={i} style={{ marginBottom: 4 }}>{issue}</li>
                                ))}
                            </ul>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <Button
                                    type="primary"
                                    block
                                    onClick={() => {
                                        analytics.track(FINANCE_EVENTS.UNSAVED_CONTINUE_EDITING, {
                                            reason: 'incomplete_fields'
                                        })
                                        Modal.destroyAll()
                                    }}
                                    style={{ backgroundColor: '#147B75', borderColor: '#147B75' }}
                                >
                                    Stay & complete
                                </Button>
                                <Button
                                    block
                                    danger
                                    onClick={() => {
                                        analytics.track(FINANCE_EVENTS.UNSAVED_DISCARD, {
                                            reason: 'incomplete_fields'
                                        })
                                        Modal.destroyAll()
                                        navigate(href)
                                    }}
                                >
                                    Discard & leave
                                </Button>
                            </div>
                        </div>
                    ),
                    closable: false,
                    footer: null
                })
            } else {
                // Track warning shown
                analytics.track(FINANCE_EVENTS.UNSAVED_WARNING_SHOWN, {
                    reason: 'unsaved_changes'
                })

                Modal.confirm({
                    title: 'Unsaved changes',
                    content: (
                        <div>
                            <p style={{ marginBottom: 16 }}>You have unsaved changes. Save your changes before leaving?</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <Button
                                    type="primary"
                                    block
                                    onClick={async () => {
                                        Modal.destroyAll()
                                        await handleSaveRef.current({ silent: true })
                                        navigate(href)
                                    }}
                                    style={{
                                        backgroundColor: '#147B75',
                                        borderColor: '#147B75'
                                    }}
                                >
                                    Save & leave
                                </Button>
                                <Button
                                    block
                                    danger
                                    onClick={() => {
                                        Modal.destroyAll()
                                        navigate(href)
                                    }}
                                >
                                    Leave without saving
                                </Button>
                                <Button
                                    block
                                    onClick={() => {
                                        analytics.track(FINANCE_EVENTS.UNSAVED_CONTINUE_EDITING, {
                                            reason: 'unsaved_changes'
                                        })
                                        Modal.destroyAll()
                                    }}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    ),
                    closable: false,
                    footer: null
                })
            }
        }

        document.addEventListener('click', handleClick, true)
        return () => document.removeEventListener('click', handleClick, true)
    }, [location.pathname, navigate])

    // Warn before closing browser tab
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (hasUnsavedChangesRef.current) {
                e.preventDefault()
                e.returnValue = ''
            }
        }

        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [])

    const loadUserData = async () => {
        setLoading(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const userData = await fetchUserData(user.id)

            let newFormData = { ...INITIAL_FORM_DATA }

            if (userData.profile) {
                newFormData = {
                    ...newFormData,
                    university: userData.profile.university || 'University of Bristol',
                    balance: userData.profile.balance?.toString() || '',
                    savings: userData.profile.savings?.toString() || '',
                    weeklySpend: userData.profile.weekly_spend_band || ''
                }
            }

            // Load cashflow data
            if (userData.cashflows && userData.cashflows.length > 0) {
                const studentLoans = userData.cashflows.filter(c => c.type === 'student_loan')
                const bursaries = userData.cashflows.filter(c => c.type === 'bursary')
                const otherIncome = userData.cashflows.filter(
                    c => c.direction === 'in' && !['student_loan', 'bursary', 'one_off'].includes(c.type)
                )
                const regularExpenses = userData.cashflows.filter(
                    c => c.direction === 'out' && c.type !== 'one_off'
                )
                const oneOffIn = userData.cashflows.filter(
                    c => c.direction === 'in' && c.type === 'one_off'
                )
                const oneOffOut = userData.cashflows.filter(
                    c => c.direction === 'out' && c.type === 'one_off'
                )

                // Detect if student loans are saved as exact dates or months
                const hasMonthBasedLoans = studentLoans.some(l => {
                    const title = l.title || ''
                    return ALL_MONTH_KEYS.some(m => title.toLowerCase().includes(MONTH_LABELS[m].toLowerCase()))
                })

                newFormData = {
                    ...newFormData,
                    studentLoan: studentLoans.length > 0,
                    loanAmount: studentLoans.length > 0
                        ? (studentLoans.reduce((sum, loan) => sum + (parseFloat(loan.amount) || 0), 0)).toFixed(2)
                        : '',
                    loanKnowDates: studentLoans.length > 0 ? !hasMonthBasedLoans : null,
                    instalmentDates: !hasMonthBasedLoans && studentLoans.length > 0
                        ? studentLoans.map(l => l.scheduled_date).filter(Boolean)
                        : [],
                    loanMonths: hasMonthBasedLoans ? studentLoans.map(l => {
                        const title = l.title || ''
                        const month = ALL_MONTH_KEYS.find(m =>
                            title.toLowerCase().includes(MONTH_LABELS[m].toLowerCase())
                        )
                        return month
                    }).filter(Boolean) : [],
                    loanDates: hasMonthBasedLoans ? studentLoans.reduce((acc, l) => {
                        const title = l.title || ''
                        const month = ALL_MONTH_KEYS.find(m =>
                            title.toLowerCase().includes(MONTH_LABELS[m].toLowerCase())
                        )
                        if (month && l.scheduled_date) {
                            acc[month] = l.scheduled_date
                        }
                        return acc
                    }, {}) : {},

                    bursary: bursaries.length > 0,
                    bursaryAmount: bursaries.length > 0
                        ? (bursaries.reduce((sum, bursary) => sum + (parseFloat(bursary.amount) || 0), 0)).toFixed(2)
                        : '',
                    bursaryDates: bursaries.map(b => b.scheduled_date).filter(Boolean),

                    otherIncome: otherIncome.length > 0,
                    otherIncomeItems: otherIncome.length > 0
                        ? otherIncome.map(i => ({
                            type: i.type,
                            amount: i.amount?.toString() || '',
                            date: i.scheduled_date || '',
                            frequency: i.recurrence || 'monthly',
                            endDate: i.end_date || ''
                        }))
                        : [{ type: 'part_time_job', amount: '', date: '', frequency: 'monthly', endDate: '' }],

                    regularExpense: regularExpenses.length > 0,
                    regularExpenseItems: regularExpenses.length > 0
                        ? regularExpenses.map(e => ({
                            type: e.type,
                            amount: e.amount?.toString() || '',
                            date: e.scheduled_date || '',
                            frequency: e.recurrence || 'monthly',
                            endDate: e.end_date || ''
                        }))
                        : [{ amount: '', date: '', frequency: 'monthly', type: 'rent', endDate: '' }],

                    oneOffIncome: oneOffIn.length > 0,
                    oneOffIn: oneOffIn.length > 0
                        ? oneOffIn.map(i => ({
                            name: i.title || '',
                            amount: i.amount?.toString() || '',
                            date: i.scheduled_date || ''
                        }))
                        : [{ name: '', amount: '', date: '' }],

                    oneOffExpenses: oneOffOut.length > 0,
                    oneOffOut: oneOffOut.length > 0
                        ? oneOffOut.map(o => ({
                            name: o.title || '',
                            amount: o.amount?.toString() || '',
                            date: o.scheduled_date || ''
                        }))
                        : [{ name: '', amount: '', date: '' }]
                }
            }

            // Set both formData and initialFormData to track changes
            setFormData(newFormData)
            setInitialFormData(newFormData)
        } catch (error) {
            console.error('Error loading user data:', error)
            messageApi.error('Failed to load data')
        } finally {
            setLoading(false)
        }
    }

    const updateField = (key, value) => {
        const oldValue = formData[key]

        // Track field update
        analytics.track(FINANCE_EVENTS.FIELD_UPDATED,
            getFinanceFieldProperties(key, oldValue, value)
        )

        setFormData(prev => ({ ...prev, [key]: value }))
    }

    const handleSave = async (options = {}) => {
        const { silent = false } = options
        const issues = getIncompleteFields(formDataRef.current)
        if (issues.length > 0) {
            Modal.confirm({
                title: 'Incomplete fields',
                content: (
                    <div>
                        <p>Please complete the following before saving:</p>
                        <ul style={{ paddingLeft: 20, margin: '8px 0 16px', maxHeight: 200, overflowY: 'auto' }}>
                            {issues.map((issue, i) => (
                                <li key={i} style={{ marginBottom: 4 }}>{issue}</li>
                            ))}
                        </ul>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <Button
                                type="primary"
                                block
                                onClick={() => Modal.destroyAll()}
                                style={{ backgroundColor: '#147B75', borderColor: '#147B75' }}
                            >
                                Got it
                            </Button>
                        </div>
                    </div>
                ),
                closable: false,
                footer: null
            })
            return
        }
        setSaving(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('No user found')

            const currentData = formDataRef.current

            // Save user_profiles
            await saveUserFinances(user.id, {
                university: currentData.university,
                balance: currentData.balance,
                savings: currentData.savings,
                weeklySpend: currentData.weeklySpend
            })

            // Delete existing cashflow and rebuild
            await supabase
                .from('cashflow_forecast')
                .delete()
                .eq('user_id', user.id)

            // Save cashflow using API function (handles all column mappings)
            await saveCashflowForecast(user.id, currentData)

            // Track finances saved event
            const { loan_amount: _la, ...loanProps } = getStudentLoanProperties(currentData)
            const { bursary_amount: _ba, ...bursaryProps } = getBursaryProperties(currentData)
            analytics.track(FINANCE_EVENTS.SAVED, {
                ...loanProps,
                ...bursaryProps,
                has_other_income: currentData.otherIncome,
                has_regular_expenses: currentData.regularExpense,
                has_one_off_income: currentData.oneOffIncome,
                has_one_off_expenses: currentData.oneOffExpenses
            })

            if (!silent) {
                messageApi.success('Changes saved successfully')
            }

            // Reload data without refreshing the page
            await loadUserData()
        } catch (error) {
            console.error('Error saving:', error)

            // Track save failed
            analytics.track(FINANCE_EVENTS.SAVE_FAILED, {
                error_message: error.message,
                error_type: error.name
            })

            analytics.error(error, getErrorProperties(error, { context: 'finances_save' }))
            messageApi.error('Failed to save changes')
        } finally {
            setSaving(false)
        }
    }
    handleSaveRef.current = handleSave

    const panelStyle = {
        marginBottom: 16,
        background: '#fafafa',
        borderRadius: 8,
        border: '1px solid #f0f0f0'
    }

    return (
        <div style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            background: '#ffffff'
        }}>
            {contextHolder}

            {/* Header */}
            <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                background: '#fff',
            }}>
                <div style={{ padding: '16px 20px' }}>
                    <Title level={2} style={{ margin: 0, fontSize: 20 }}>
                        Your Financial Info
                    </Title>
                </div>
            </div>

            {/* Scrollable Content */}
            <div
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    WebkitOverflowScrolling: 'touch',
                    padding: '0px 20px',
                    paddingBottom: 'calc(250px + env(safe-area-inset-bottom))'
                }}
            >
                <Collapse
                    bordered={false}
                    expandIcon={({ isActive }) => (
                        <ChevronDown
                            style={{
                                transition: 'transform 0.3s',
                                transform: isActive ? 'rotate(180deg)' : 'rotate(0deg)'
                            }}
                            size={20}
                        />
                    )}
                    style={{ background: 'transparent' }}
                >
                    {/* University */}
                    <Panel
                        header={<Text strong>University</Text>}
                        key="university"
                        style={panelStyle}
                    >
                        <div style={{ marginBottom: 16 }}>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                                {getStep('university').heading}
                            </Text>
                            <NativeSelect
                                value={formData.university}
                                onChange={val => {
                                    updateField('university', val)
                                }}
                                options={UK_UNIVERSITIES}
                            />
                        </div>
                    </Panel>

                    {/* Bank Balance */}
                    <Panel
                        header={<Text strong>Bank Balance</Text>}
                        key="balance"
                        style={panelStyle}
                    >
                        <div style={{ marginBottom: 16 }}>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                                {getStep('balance').heading}
                            </Text>
                            <Input
                                name="balance"
                                inputMode="decimal"
                                placeholder="0"
                                prefix="£"
                                value={formData.balance}
                                onChange={e => {
                                    const newValue = formatMoney(e.target.value)
                                    updateField('balance', newValue)
                                }}
                                style={{ borderRadius: 8 }}
                            />
                        </div>
                    </Panel>

                    {/* Savings */}
                    <Panel
                        header={<Text strong>Savings</Text>}
                        key="savings"
                        style={panelStyle}
                    >
                        <div style={{ marginBottom: 16 }}>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                                {getStep('savings').heading}
                            </Text>
                            <Input
                                name="savings"
                                inputMode="decimal"
                                placeholder="0"
                                prefix="£"
                                value={formData.savings}
                                onChange={e => {
                                    const newValue = formatMoney(e.target.value)
                                    updateField('savings', newValue)
                                }}
                                style={{ borderRadius: 8 }}
                            />
                        </div>
                    </Panel>

                    {/* Student Loan */}
                    <Panel
                        header={<Text strong>Student Loan</Text>}
                        key="studentLoan"
                        style={panelStyle}
                    >
                        <div style={{ marginBottom: 16 }}>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                                {getStep('studentLoan').heading}
                            </Text>
                            <YesNo
                                value={formData.studentLoan}
                                onChange={val => {
                                    if (val === true) {
                                        analytics.track(LOAN_EVENTS.STUDENT_LOAN_ADDED)
                                    } else {
                                        analytics.track(LOAN_EVENTS.STUDENT_LOAN_REMOVED)
                                    }
                                    updateField('studentLoan', val)
                                }}
                            />

                            {formData.studentLoan && (
                                <div style={{ marginTop: 16 }}>
                                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                                        Total yearly student loan
                                    </Text>
                                    <Input
                                        name="loanAmount"
                                        inputMode="decimal"
                                        placeholder="0"
                                        prefix="£"
                                        value={formData.loanAmount}
                                        onChange={e => {
                                            const newValue = formatMoney(e.target.value)
                                            analytics.track(LOAN_EVENTS.STUDENT_LOAN_UPDATED, {
                                                new_loan_amount: newValue
                                            })
                                            updateField('loanAmount', newValue)
                                        }}
                                        style={{ borderRadius: 8, marginBottom: 16 }}
                                    />

                                    <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                                        Do you know the exact dates of your instalments?
                                    </Text>
                                    <YesNo
                                        value={formData.loanKnowDates}
                                        onChange={val => {
                                            analytics.track(LOAN_EVENTS.STUDENT_LOAN_DATE_MODE_CHANGED, {
                                                knows_exact_dates: val,
                                                from_mode: formData.loanKnowDates === true ? 'exact_dates' : 'months_only',
                                                to_mode: val === true ? 'exact_dates' : 'months_only'
                                            })

                                            if (val === true) {
                                                // Switching to "Yes, I know exact dates"
                                                // Convert loanMonths to instalmentDates if instalmentDates is empty
                                                updateField('loanKnowDates', val)
                                                if (!formData.instalmentDates?.length && formData.loanMonths?.length) {
                                                    const dates = formData.loanMonths.map(getDefaultDateForMonth)
                                                    updateField('instalmentDates', dates)
                                                } else if (!formData.instalmentDates?.length) {
                                                    // No data in either field, use defaults
                                                    const defaultDates = ['september', 'january', 'april'].map(getDefaultDateForMonth)
                                                    updateField('instalmentDates', defaultDates)
                                                }
                                            } else {
                                                // Switching to "No, I don't know exact dates"
                                                updateField('loanKnowDates', val)
                                                if (formData.instalmentDates?.length) {
                                                    // Extract months from existing exact dates
                                                    const months = formData.instalmentDates
                                                        .map(getMonthKeyFromDate)
                                                        .filter(Boolean)
                                                    if (months.length) {
                                                        updateField('loanMonths', months)
                                                    }
                                                } else if (!formData.loanMonths?.length) {
                                                    // No prior selection — use defaults
                                                    updateField('loanMonths', ['september', 'january', 'april'])
                                                }
                                            }
                                        }}
                                    />

                                    {formData.loanKnowDates === true && (
                                        <div style={{ marginTop: 16 }}>
                                            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                                                Instalment dates
                                            </Text>
                                            {(formData.instalmentDates || []).map((date, idx) => (
                                                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                                                    <Input
                                                        type="date"
                                                        value={date}
                                                        onChange={e => {
                                                            const newDates = [...(formData.instalmentDates || [])]
                                                            newDates[idx] = e.target.value
                                                            updateField('instalmentDates', newDates)
                                                        }}
                                                        style={{
                                                            borderRadius: 8,
                                                            WebkitAppearance: 'none',
                                                            width: '100%',
                                                            height: 34,
                                                            flex: 1,
                                                            boxShadow: 'none'
                                                        }}
                                                    />
                                                    {(formData.instalmentDates || []).length > 1 && (
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            danger
                                                            onClick={() => {
                                                                analytics.track(LOAN_EVENTS.STUDENT_LOAN_INSTALMENT_REMOVED)
                                                                const newDates = (formData.instalmentDates || []).filter((_, i) => i !== idx)
                                                                updateField('instalmentDates', newDates)
                                                            }}
                                                        >
                                                            Remove
                                                        </Button>
                                                    )}
                                                </div>
                                            ))}
                                            <Button
                                                type="dashed"
                                                onClick={() => {
                                                    analytics.track(LOAN_EVENTS.STUDENT_LOAN_INSTALMENT_ADDED)
                                                    updateField('instalmentDates', [...(formData.instalmentDates || []), ''])
                                                }}
                                                style={{ width: '100%' }}
                                            >
                                                + Add instalment
                                            </Button>
                                        </div>
                                    )}

                                    {formData.loanKnowDates === false && (
                                        <div style={{ marginTop: 16 }}>
                                            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                                                Which months do you receive payments?
                                            </Text>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                {ALL_MONTH_KEYS.map(month => {
                                                    const isSelected = formData.loanMonths.includes(month)
                                                    return (
                                                        <div
                                                            key={month}
                                                            onClick={() => {
                                                                const newMonths = isSelected
                                                                    ? formData.loanMonths.filter(m => m !== month)
                                                                    : [...formData.loanMonths, month]
                                                                setFormData(prev => ({
                                                                    ...prev,
                                                                    loanMonths: newMonths
                                                                }))
                                                            }}
                                                            style={{
                                                                padding: '6px 16px',
                                                                borderRadius: 999,
                                                                border: `1px solid ${isSelected ? '#147B75' : '#d9d9d9'}`,
                                                                background: isSelected ? '#147B75' : '#fff',
                                                                color: isSelected ? '#fff' : '#333',
                                                                cursor: 'pointer',
                                                                fontSize: 14,
                                                                userSelect: 'none',
                                                                transition: 'all 0.2s'
                                                            }}
                                                        >
                                                            {MONTH_LABELS[month]}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </Panel>

                    {/* Bursary */}
                    <Panel
                        header={<Text strong>Bursary</Text>}
                        key="bursary"
                        style={panelStyle}
                    >
                        <div style={{ marginBottom: 16 }}>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                                {getStep('bursary').heading}
                            </Text>
                            <YesNo
                                value={formData.bursary}
                                onChange={val => {
                                    if (val === true) {
                                        analytics.track(LOAN_EVENTS.BURSARY_ADDED)
                                        if (formData.bursaryDates.length === 0) {
                                            setFormData(prev => ({
                                                ...prev,
                                                bursary: true,
                                                bursaryDates: [...DEFAULT_BURSARY_DATES]
                                            }))
                                            return
                                        }
                                    } else {
                                        analytics.track(LOAN_EVENTS.BURSARY_REMOVED)
                                    }
                                    updateField('bursary', val)
                                }}
                            />

                            {formData.bursary && (
                                <div style={{ marginTop: 16 }}>
                                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                                        Total yearly bursary
                                    </Text>
                                    <Input
                                        placeholder="0"
                                        inputMode="decimal"
                                        prefix="£"
                                        value={formData.bursaryAmount}
                                        onChange={e => {
                                            const newValue = formatMoney(e.target.value)
                                            analytics.track(LOAN_EVENTS.BURSARY_UPDATED, {
                                                new_bursary_amount: newValue
                                            })
                                            updateField('bursaryAmount', newValue)
                                        }}
                                        style={{ borderRadius: 8, marginBottom: 16 }}
                                    />

                                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                                        Instalment dates
                                    </Text>
                                    {formData.bursaryDates.map((date, idx) => (
                                        <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                                            <Input
                                                type="date"
                                                value={date}
                                                onChange={e => {
                                                    const newDates = [...formData.bursaryDates]
                                                    newDates[idx] = e.target.value
                                                    updateField('bursaryDates', newDates)
                                                }}
                                                style={{
                                                    borderRadius: 8,
                                                    WebkitAppearance: 'none',
                                                    width: '100%',
                                                    height: 34,
                                                    flex: 1,
                                                    boxShadow: 'none'
                                                }}
                                            />
                                            {formData.bursaryDates.length > 1 && (
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    danger
                                                    onClick={() => {
                                                        analytics.track(LOAN_EVENTS.BURSARY_INSTALMENT_REMOVED)
                                                        const newDates = formData.bursaryDates.filter((_, i) => i !== idx)
                                                        updateField('bursaryDates', newDates)
                                                    }}
                                                >
                                                    Remove
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                    <Button
                                        type="dashed"
                                        onClick={() => {
                                            analytics.track(LOAN_EVENTS.BURSARY_INSTALMENT_ADDED)
                                            updateField('bursaryDates', [...formData.bursaryDates, ''])
                                        }}
                                        style={{ width: '100%' }}
                                    >
                                        + Add instalment
                                    </Button>
                                </div>
                            )}
                        </div>
                    </Panel>

                    {/* Other Income */}
                    <Panel
                        header={<Text strong>Other Regular Income</Text>}
                        key="otherIncome"
                        style={panelStyle}
                    >
                        <div style={{ marginBottom: 16 }}>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                                {getStep('otherIncome').heading}
                            </Text>
                            <YesNo
                                value={formData.otherIncome}
                                onChange={val => updateField('otherIncome', val)}
                            />

                            {formData.otherIncome && (
                                <div style={{ marginTop: 16 }}>
                                    {sortByEndDate(formData.otherIncomeItems).map((item, idx) => {
                                        const originalIdx = formData.otherIncomeItems.indexOf(item)
                                        const isPastEnd = isEndDatePast(item.endDate)
                                        return (
                                            <div key={originalIdx} style={{
                                                padding: 16,
                                                background: '#fff',
                                                borderRadius: 8,
                                                marginBottom: 12,
                                                border: '1px solid #f0f0f0',
                                                position: 'relative'
                                            }}>
                                                {isPastEnd && (
                                                    <Badge.Ribbon text="Ended" color="red" />
                                                )}
                                                {formData.otherIncomeItems.length > 1 && (
                                                    <div style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        marginBottom: 12
                                                    }}>
                                                        <Text strong style={{ fontSize: 15 }}>Income {idx + 1}</Text>
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            danger
                                                            onClick={() => {
                                                                analytics.track(TRANSACTION_EVENTS.RECURRING_INCOME_REMOVED)
                                                                const newItems = formData.otherIncomeItems.filter((_, i) => i !== originalIdx)
                                                                updateField('otherIncomeItems', newItems)
                                                            }}
                                                        >
                                                            Remove
                                                        </Button>
                                                    </div>
                                                )}
                                                <NativeSelect
                                                    label="Type"
                                                    value={item.type}
                                                    onChange={val => {
                                                        const newItems = [...formData.otherIncomeItems]
                                                        newItems[originalIdx].type = val
                                                        updateField('otherIncomeItems', newItems)
                                                    }}
                                                    options={OTHER_INCOME_TYPE_OPTIONS}
                                                    containerStyle={{ marginBottom: 12 }}
                                                />
                                                <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
                                                    Amount
                                                </Text>
                                                <Input
                                                    inputMode="decimal"
                                                    placeholder="0"
                                                    prefix="£"
                                                    value={item.amount}
                                                    onChange={e => {
                                                        const newItems = [...formData.otherIncomeItems]
                                                        newItems[originalIdx].amount = formatMoney(e.target.value)
                                                        updateField('otherIncomeItems', newItems)
                                                    }}
                                                    style={{ borderRadius: 8, marginBottom: 12 }}
                                                />
                                                <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
                                                    Start Date
                                                </Text>
                                                <div style={{ display: 'flex', minWidth: 0 }}>
                                                    <Input
                                                        type="date"
                                                        value={item.date}
                                                        onChange={e => {
                                                            const newItems = [...formData.otherIncomeItems]
                                                            newItems[originalIdx].date = e.target.value
                                                            updateField('otherIncomeItems', newItems)
                                                        }}
                                                        style={{
                                                            borderRadius: 8,
                                                            marginBottom: 12,
                                                            WebkitAppearance: 'none',
                                                            width: '100%',
                                                            height: 34,
                                                            boxShadow: 'none'
                                                        }}
                                                    />
                                                </div>
                                                <NativeSelect
                                                    label="Frequency"
                                                    value={item.frequency}
                                                    onChange={val => {
                                                        const newItems = [...formData.otherIncomeItems]
                                                        newItems[originalIdx].frequency = val
                                                        updateField('otherIncomeItems', newItems)
                                                    }}
                                                    options={OTHER_INCOME_FREQ_OPTIONS}
                                                    containerStyle={{ marginBottom: 12 }}
                                                />
                                                <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
                                                    End Date (optional)
                                                </Text>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <Input
                                                        type="date"
                                                        value={item.endDate}
                                                        onChange={e => {
                                                            const newItems = [...formData.otherIncomeItems]
                                                            newItems[originalIdx].endDate = e.target.value
                                                            updateField('otherIncomeItems', newItems)
                                                        }}
                                                        style={{
                                                            borderRadius: 8,
                                                            WebkitAppearance: 'none',
                                                            width: '100%',
                                                            height: 34,
                                                            flex: 1,
                                                            boxShadow: 'none'
                                                        }}
                                                    />
                                                    {item.endDate && (
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            danger
                                                            onClick={() => {
                                                                const newItems = [...formData.otherIncomeItems]
                                                                newItems[originalIdx].endDate = ''
                                                                updateField('otherIncomeItems', newItems)
                                                            }}
                                                        >
                                                            Clear
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                    <Button
                                        type="dashed"
                                        onClick={() => {
                                            analytics.track(TRANSACTION_EVENTS.RECURRING_INCOME_ADDED)
                                            updateField('otherIncomeItems', [
                                                ...formData.otherIncomeItems,
                                                { type: 'part_time_job', amount: '', date: '', frequency: 'monthly', endDate: '' }
                                            ])
                                        }}
                                        style={{ width: '100%' }}
                                    >
                                        + Add another income source
                                    </Button>
                                </div>
                            )}
                        </div>
                    </Panel>

                    {/* Regular Expenses */}
                    <Panel
                        header={<Text strong>Regular Expenses</Text>}
                        key="regularExpense"
                        style={panelStyle}
                    >
                        <div style={{ marginBottom: 16 }}>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                                {getStep('regularExpense').heading}
                            </Text>
                            <YesNo
                                value={formData.regularExpense}
                                onChange={val => updateField('regularExpense', val)}
                            />

                            {formData.regularExpense && (
                                <div style={{ marginTop: 16 }}>
                                    {sortByEndDate(formData.regularExpenseItems).map((item, idx) => {
                                        const originalIdx = formData.regularExpenseItems.indexOf(item)
                                        const isPastEnd = isEndDatePast(item.endDate)
                                        return (
                                            <div key={originalIdx} style={{
                                                padding: 16,
                                                background: '#fff',
                                                borderRadius: 8,
                                                marginBottom: 12,
                                                border: '1px solid #f0f0f0',
                                                position: 'relative'
                                            }}>
                                                {isPastEnd && (
                                                    <Badge.Ribbon text="Ended" color="red" />
                                                )}
                                                {formData.regularExpenseItems.length > 1 && (
                                                    <div style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        marginBottom: 12
                                                    }}>
                                                        <Text strong style={{ fontSize: 15 }}>Payment {idx + 1}</Text>
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            danger
                                                            onClick={() => {
                                                                analytics.track(TRANSACTION_EVENTS.RECURRING_EXPENSE_REMOVED)
                                                                const newItems = formData.regularExpenseItems.filter((_, i) => i !== originalIdx)
                                                                updateField('regularExpenseItems', newItems)
                                                            }}
                                                        >
                                                            Remove
                                                        </Button>
                                                    </div>
                                                )}
                                                <NativeSelect
                                                    label="Type"
                                                    value={item.type}
                                                    onChange={val => {
                                                        const newItems = [...formData.regularExpenseItems]
                                                        newItems[originalIdx].type = val
                                                        updateField('regularExpenseItems', newItems)
                                                    }}
                                                    options={PAYMENT_TYPE_OPTIONS}
                                                    containerStyle={{ marginBottom: 12 }}
                                                />
                                                <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
                                                    Amount
                                                </Text>
                                                <Input
                                                    inputMode="decimal"
                                                    placeholder="0"
                                                    prefix="£"
                                                    value={item.amount}
                                                    onChange={e => {
                                                        const newItems = [...formData.regularExpenseItems]
                                                        newItems[originalIdx].amount = formatMoney(e.target.value)
                                                        updateField('regularExpenseItems', newItems)
                                                    }}
                                                    style={{ borderRadius: 8, marginBottom: 12 }}
                                                />
                                                <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
                                                    Start Date
                                                </Text>
                                                <div style={{ display: 'flex', minWidth: 0 }}>
                                                    <Input
                                                        type="date"
                                                        value={item.date}
                                                        onChange={e => {
                                                            const newItems = [...formData.regularExpenseItems]
                                                            newItems[originalIdx].date = e.target.value
                                                            updateField('regularExpenseItems', newItems)
                                                        }}
                                                        style={{
                                                            borderRadius: 8,
                                                            marginBottom: 12,
                                                            WebkitAppearance: 'none',
                                                            width: '100%',
                                                            height: 34,
                                                            boxShadow: 'none'
                                                        }}
                                                    />
                                                </div>
                                                <NativeSelect
                                                    label="Frequency"
                                                    value={item.frequency}
                                                    onChange={val => {
                                                        const newItems = [...formData.regularExpenseItems]
                                                        newItems[originalIdx].frequency = val
                                                        updateField('regularExpenseItems', newItems)
                                                    }}
                                                    options={REGULAR_FREQ_OPTIONS}
                                                    containerStyle={{ marginBottom: 12 }}
                                                />
                                                <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
                                                    End Date (optional)
                                                </Text>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <Input
                                                        type="date"
                                                        value={item.endDate}
                                                        onChange={e => {
                                                            const newItems = [...formData.regularExpenseItems]
                                                            newItems[originalIdx].endDate = e.target.value
                                                            updateField('regularExpenseItems', newItems)
                                                        }}
                                                        style={{
                                                            borderRadius: 8,
                                                            WebkitAppearance: 'none',
                                                            width: '100%',
                                                            height: 34,
                                                            flex: 1,
                                                            boxShadow: 'none'
                                                        }}
                                                    />
                                                    {item.endDate && (
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            danger
                                                            onClick={() => {
                                                                const newItems = [...formData.regularExpenseItems]
                                                                newItems[originalIdx].endDate = ''
                                                                updateField('regularExpenseItems', newItems)
                                                            }}
                                                        >
                                                            Clear
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                    <Button
                                        type="dashed"
                                        onClick={() => {
                                            analytics.track(TRANSACTION_EVENTS.RECURRING_EXPENSE_ADDED)
                                            updateField('regularExpenseItems', [
                                                ...formData.regularExpenseItems,
                                                { amount: '', date: '', frequency: 'monthly', type: 'rent', endDate: '' }
                                            ])
                                        }}
                                        style={{ width: '100%' }}
                                    >
                                        + Add another expense
                                    </Button>
                                </div>
                            )}
                        </div>
                    </Panel>

                    {/* One-Off Income */}
                    <Panel
                        header={<Text strong>One-Off Income</Text>}
                        key="oneOffIncome"
                        style={panelStyle}
                    >
                        <div style={{ marginBottom: 16 }}>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                                {getStep('oneOffIncome').heading}
                            </Text>
                            <YesNo
                                value={formData.oneOffIncome}
                                onChange={val => updateField('oneOffIncome', val)}
                            />

                            {formData.oneOffIncome && (
                                <div style={{ marginTop: 16 }}>
                                    {formData.oneOffIn.map((item, idx) => (
                                        <div key={idx} style={{
                                            padding: 16,
                                            background: '#fff',
                                            borderRadius: 8,
                                            marginBottom: 12,
                                            border: '1px solid #f0f0f0'
                                        }}>
                                            {formData.oneOffIn.length > 1 && (
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    marginBottom: 12
                                                }}>
                                                    <Text strong style={{ fontSize: 15 }}>Item {idx + 1}</Text>
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        danger
                                                        onClick={() => {
                                                            analytics.track(TRANSACTION_EVENTS.ONE_OFF_INCOME_REMOVED)
                                                            const newItems = formData.oneOffIn.filter((_, i) => i !== idx)
                                                            updateField('oneOffIn', newItems)
                                                        }}
                                                    >
                                                        Remove
                                                    </Button>
                                                </div>
                                            )}
                                            <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
                                                Name (optional)
                                            </Text>
                                            <Input
                                                value={item.name}
                                                onChange={e => {
                                                    const newItems = [...formData.oneOffIn]
                                                    newItems[idx].name = e.target.value
                                                    updateField('oneOffIn', newItems)
                                                }}
                                                style={{ borderRadius: 8, marginBottom: 12 }}
                                            />
                                            <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
                                                Amount
                                            </Text>
                                            <Input
                                                inputMode="decimal"
                                                placeholder="0"
                                                prefix="£"
                                                value={item.amount}
                                                onChange={e => {
                                                    const newItems = [...formData.oneOffIn]
                                                    newItems[idx].amount = formatMoney(e.target.value)
                                                    updateField('oneOffIn', newItems)
                                                }}
                                                style={{ borderRadius: 8, marginBottom: 12 }}
                                            />
                                            <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
                                                Date
                                            </Text>
                                            <div style={{ display: 'flex', minWidth: 0 }}>
                                                <Input
                                                    type="date"
                                                    value={item.date}
                                                    onChange={e => {
                                                        const newItems = [...formData.oneOffIn]
                                                        newItems[idx].date = e.target.value
                                                        updateField('oneOffIn', newItems)
                                                    }}
                                                    style={{
                                                        borderRadius: 8,
                                                        WebkitAppearance: 'none',
                                                        width: '100%',
                                                        height: 34,
                                                        boxShadow: 'none'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                    <Button
                                        type="dashed"
                                        onClick={() => {
                                            analytics.track(TRANSACTION_EVENTS.ONE_OFF_INCOME_ADDED)
                                            updateField('oneOffIn', [
                                                ...formData.oneOffIn,
                                                { name: '', amount: '', date: '' }
                                            ])
                                        }}
                                        style={{ width: '100%', }}
                                    >
                                        + Add another income
                                    </Button>
                                </div>
                            )}
                        </div>
                    </Panel>

                    {/* One-Off Expenses */}
                    <Panel
                        header={<Text strong>One-Off Expenses</Text>}
                        key="oneOffExpenses"
                        style={panelStyle}
                    >
                        <div style={{ marginBottom: 16 }}>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                                {getStep('oneOffExpenses').heading}
                            </Text>
                            <YesNo
                                value={formData.oneOffExpenses}
                                onChange={val => updateField('oneOffExpenses', val)}
                            />

                            {formData.oneOffExpenses && (
                                <div style={{ marginTop: 16 }}>
                                    {formData.oneOffOut.map((item, idx) => (
                                        <div key={idx} style={{
                                            padding: 16,
                                            background: '#fff',
                                            borderRadius: 8,
                                            marginBottom: 12,
                                            border: '1px solid #f0f0f0'
                                        }}>
                                            {formData.oneOffOut.length > 1 && (
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    marginBottom: 12
                                                }}>
                                                    <Text strong style={{ fontSize: 15 }}>Item {idx + 1}</Text>
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        danger
                                                        onClick={() => {
                                                            analytics.track(TRANSACTION_EVENTS.ONE_OFF_EXPENSE_REMOVED)
                                                            const newItems = formData.oneOffOut.filter((_, i) => i !== idx)
                                                            updateField('oneOffOut', newItems)
                                                        }}
                                                    >
                                                        Remove
                                                    </Button>
                                                </div>
                                            )}
                                            <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
                                                Name (optional)
                                            </Text>
                                            <Input
                                                value={item.name}
                                                onChange={e => {
                                                    const newItems = [...formData.oneOffOut]
                                                    newItems[idx].name = e.target.value
                                                    updateField('oneOffOut', newItems)
                                                }}
                                                style={{ borderRadius: 8, marginBottom: 12 }}
                                            />
                                            <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
                                                Amount
                                            </Text>
                                            <Input
                                                inputMode="decimal"
                                                placeholder="0"
                                                prefix="£"
                                                value={item.amount}
                                                onChange={e => {
                                                    const newItems = [...formData.oneOffOut]
                                                    newItems[idx].amount = formatMoney(e.target.value)
                                                    updateField('oneOffOut', newItems)
                                                }}
                                                style={{ borderRadius: 8, marginBottom: 12 }}
                                            />
                                            <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
                                                Date
                                            </Text>
                                            <div style={{ display: 'flex', minWidth: 0 }}>
                                                <Input
                                                    type="date"
                                                    value={item.date}
                                                    onChange={e => {
                                                        const newItems = [...formData.oneOffOut]
                                                        newItems[idx].date = e.target.value
                                                        updateField('oneOffOut', newItems)
                                                    }}
                                                    style={{
                                                        borderRadius: 8,
                                                        WebkitAppearance: 'none',
                                                        width: '100%',
                                                        height: 34,
                                                        boxShadow: 'none'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                    <Button
                                        type="dashed"
                                        onClick={() => {
                                            analytics.track(TRANSACTION_EVENTS.ONE_OFF_EXPENSE_ADDED)
                                            updateField('oneOffOut', [
                                                ...formData.oneOffOut,
                                                { name: '', amount: '', date: '' }
                                            ])
                                        }}
                                        style={{ width: '100%' }}
                                    >
                                        + Add another expense
                                    </Button>
                                </div>
                            )}
                        </div>
                    </Panel>

                    {/* Weekly Spend */}
                    <Panel
                        header={<Text strong>Weekly Spend</Text>}
                        key="weeklySpend"
                        style={panelStyle}
                    >
                        <div style={{ marginBottom: 16 }}>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                                {getStep('weeklySpend').heading}
                            </Text>
                            <Radio.Group
                                value={formData.weeklySpend}
                                onChange={e => {
                                    updateField('weeklySpend', e.target.value)
                                }}
                                style={{ width: '100%' }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {WEEKLY_SPEND_OPTIONS.map(option => (
                                        <Radio
                                            key={option.value}
                                            value={option.value}
                                            style={{
                                                padding: 12,
                                                border: '1px solid #d9d9d9',
                                                borderRadius: 8,
                                                width: '100%'
                                            }}
                                        >
                                            {option.label}
                                        </Radio>
                                    ))}
                                </div>
                            </Radio.Group>
                        </div>
                    </Panel>
                </Collapse>

                {/* Save Button */}
                <Button
                    type="primary"
                    size="large"
                    block
                    loading={saving}
                    onClick={handleSave}
                    style={{
                        marginTop: 24,
                        borderRadius: 8,
                        height: 52,
                        fontSize: 16,
                        fontSize: 18,
                        fontWeight: 600,
                    }}
                >
                    Save Changes
                </Button>
            </div>
        </div>
    )
}
