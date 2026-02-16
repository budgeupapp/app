import { useState, useEffect, useRef, useCallback } from 'react'
import { Collapse, Input, Radio, Button, Typography, message, Spin, Badge, Modal } from 'antd'
import { ChevronDown } from '@untitledui/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { saveUserFinances, saveCashflowForecast, fetchUserData } from '../lib/api'
import NativeSelect from '../components/NativeSelect'
import { usePostHog } from '@posthog/react'
import {
    WEEKLY_SPEND_OPTIONS,
    UK_UNIVERSITIES,
    MONTH_LABELS,
    ALL_MONTH_KEYS,
    OTHER_INCOME_TYPE_OPTIONS,
    OTHER_INCOME_FREQ_OPTIONS,
    REGULAR_FREQ_OPTIONS,
    PAYMENT_TYPE_OPTIONS,
    INITIAL_FORM_DATA
} from '../config/onboardingConfig'

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
    const posthog = usePostHog()
    const navigate = useNavigate()
    const location = useLocation()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [formData, setFormData] = useState({ ...INITIAL_FORM_DATA })
    const [initialFormData, setInitialFormData] = useState({ ...INITIAL_FORM_DATA })
    const [messageApi, contextHolder] = message.useMessage({ maxCount: 1 })

    // Check if there are unsaved changes
    const hasUnsavedChanges = JSON.stringify(formData) !== JSON.stringify(initialFormData)

    // Check for incomplete entries (amount without date or date without amount)
    const getIncompleteFields = useCallback((data) => {
        const issues = []

        if (data.studentLoan) {
            if (data.loanAmount && data.loanMonths.length === 0) {
                issues.push('Student Loan: amount entered but no payment months selected')
            }
            if (!data.loanAmount && data.loanMonths.length > 0) {
                issues.push('Student Loan: payment months selected but no amount entered')
            }
        }

        if (data.bursary) {
            const hasAmount = !!data.bursaryAmount
            const hasDates = data.bursaryDates.some(d => !!d)
            if (hasAmount && !hasDates) {
                issues.push('Bursary: amount entered but no payment dates set')
            }
            if (!hasAmount && hasDates) {
                issues.push('Bursary: payment dates set but no amount entered')
            }
        }

        if (data.otherIncome) {
            data.otherIncomeItems.forEach((item, i) => {
                const hasAmount = !!item.amount
                const hasDate = !!item.date
                if (hasAmount && !hasDate) {
                    issues.push(`Other Income ${i + 1}: amount entered but no start date set`)
                }
                if (!hasAmount && hasDate) {
                    issues.push(`Other Income ${i + 1}: start date set but no amount entered`)
                }
            })
        }

        if (data.regularExpense) {
            data.regularExpenseItems.forEach((item, i) => {
                const hasAmount = !!item.amount
                const hasDate = !!item.date
                if (hasAmount && !hasDate) {
                    issues.push(`Regular Expense ${i + 1}: amount entered but no start date set`)
                }
                if (!hasAmount && hasDate) {
                    issues.push(`Regular Expense ${i + 1}: start date set but no amount entered`)
                }
            })
        }

        if (data.oneOffPayments) {
            data.oneOffIn.forEach((item, i) => {
                const hasAmount = !!item.amount
                const hasDate = !!item.date
                if (hasAmount && !hasDate) {
                    issues.push(`One-off Income ${i + 1}: amount entered but no date set`)
                }
                if (!hasAmount && hasDate) {
                    issues.push(`One-off Income ${i + 1}: date set but no amount entered`)
                }
            })
            data.oneOffOut.forEach((item, i) => {
                const hasAmount = !!item.amount
                const hasDate = !!item.date
                if (hasAmount && !hasDate) {
                    issues.push(`One-off Expense ${i + 1}: amount entered but no date set`)
                }
                if (!hasAmount && hasDate) {
                    issues.push(`One-off Expense ${i + 1}: date set but no amount entered`)
                }
            })
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

    useEffect(() => {
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
                Modal.confirm({
                    title: 'Incomplete fields',
                    content: (
                        <div>
                            <p>You have incomplete fields:</p>
                            <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                                {issues.map((issue, i) => (
                                    <li key={i} style={{ marginBottom: 4 }}>{issue}</li>
                                ))}
                            </ul>
                            <p>Do you want to stay and complete them, or discard and leave?</p>
                        </div>
                    ),
                    okText: 'Stay',
                    cancelText: 'Discard & leave',
                    closable: false,
                    okButtonProps: {
                        style: { backgroundColor: '#147B75', borderColor: '#147B75' }
                    },
                    onOk: () => { },
                    onCancel: () => {
                        navigate(href)
                    }
                })
            } else {
                Modal.confirm({
                    title: 'Unsaved changes',
                    content: 'You have unsaved changes. Do you want to save before leaving?',
                    okText: 'Save & leave',
                    cancelText: 'Discard & leave',
                    closable: false,
                    okButtonProps: {
                        style: {
                            backgroundColor: '#147B75',
                            borderColor: '#147B75'
                        }
                    },
                    onOk: async () => {
                        await handleSaveRef.current()
                        navigate(href)
                    },
                    onCancel: () => {
                        navigate(href)
                    }
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

                newFormData = {
                    ...newFormData,
                    studentLoan: studentLoans.length > 0,
                    loanAmount: studentLoans.length > 0
                        ? (studentLoans.reduce((sum, loan) => sum + (parseFloat(loan.amount) || 0), 0)).toString()
                        : '',
                    loanMonths: studentLoans.map(l => {
                        const title = l.title || ''
                        const month = ALL_MONTH_KEYS.find(m =>
                            title.toLowerCase().includes(MONTH_LABELS[m].toLowerCase())
                        )
                        return month
                    }).filter(Boolean),
                    loanDates: studentLoans.reduce((acc, l) => {
                        const title = l.title || ''
                        const month = ALL_MONTH_KEYS.find(m =>
                            title.toLowerCase().includes(MONTH_LABELS[m].toLowerCase())
                        )
                        if (month && l.scheduled_date) {
                            acc[month] = l.scheduled_date
                        }
                        return acc
                    }, {}),

                    bursary: bursaries.length > 0,
                    bursaryAmount: bursaries.length > 0
                        ? (bursaries.reduce((sum, bursary) => sum + (parseFloat(bursary.amount) || 0), 0)).toString()
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

                    oneOffPayments: oneOffIn.length > 0 || oneOffOut.length > 0,
                    oneOffIn: oneOffIn.length > 0
                        ? oneOffIn.map(i => ({
                            name: i.title || '',
                            amount: i.amount?.toString() || '',
                            date: i.scheduled_date || ''
                        }))
                        : [{ name: '', amount: '', date: '' }],
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
        setFormData(prev => ({ ...prev, [key]: value }))
    }

    const handleSave = async () => {
        const issues = getIncompleteFields(formDataRef.current)
        if (issues.length > 0) {
            Modal.warning({
                title: 'Incomplete fields',
                content: (
                    <div>
                        <p>Please complete the following before saving:</p>
                        <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                            {issues.map((issue, i) => (
                                <li key={i} style={{ marginBottom: 4 }}>{issue}</li>
                            ))}
                        </ul>
                    </div>
                ),
                okText: 'OK',
                okButtonProps: {
                    style: { backgroundColor: '#147B75', borderColor: '#147B75' }
                }
            })
            return
        }
        setSaving(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('No user found')

            const currentData = formDataRef.current

            // Save user_finances
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
            posthog?.capture('finances_saved', {
                has_student_loan: currentData.studentLoan,
                has_bursary: currentData.bursary,
                has_other_income: currentData.otherIncome,
                has_regular_expenses: currentData.regularExpense,
                has_one_off_payments: currentData.oneOffPayments
            })

            messageApi.success('Changes saved successfully')

            // Reload data without refreshing the page
            await loadUserData()
        } catch (error) {
            console.error('Error saving:', error)
            posthog?.captureException(error)
            messageApi.error('Failed to save changes')
        } finally {
            setSaving(false)
        }
    }
    handleSaveRef.current = handleSave

    if (loading) {
        return (
            <div style={{
                height: '80vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#fff'
            }}>
                <Spin size="large" />
            </div>
        )
    }

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
                borderBottom: '1px solid #f0f0f0'
            }}>
                <div style={{ padding: '16px 20px' }}>
                    <Title level={2} style={{ margin: 0, fontSize: 20 }}>
                        Your Financial Info
                    </Title>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                        Update your income, expenses, and financial details
                    </Text>
                </div>
            </div>

            {/* Scrollable Content */}
            <div
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    WebkitOverflowScrolling: 'touch',
                    padding: '16px 20px',
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
                                Which university do you attend?
                            </Text>
                            <NativeSelect
                                value={formData.university}
                                onChange={val => updateField('university', val)}
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
                                Current bank balance
                            </Text>
                            <Input
                                name="balance"
                                inputMode="decimal"
                                placeholder="0"
                                prefix="£"
                                value={formData.balance}
                                onChange={e => updateField('balance', formatMoney(e.target.value))}
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
                                Money in savings
                            </Text>
                            <Input
                                name="savings"
                                inputMode="decimal"
                                placeholder="0"
                                prefix="£"
                                value={formData.savings}
                                onChange={e => updateField('savings', formatMoney(e.target.value))}
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
                                Do you receive student loans?
                            </Text>
                            <YesNo
                                value={formData.studentLoan}
                                onChange={val => updateField('studentLoan', val)}
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
                                        onChange={e => updateField('loanAmount', formatMoney(e.target.value))}
                                        style={{ borderRadius: 8, marginBottom: 16 }}
                                    />

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
                                                        // Also update loanDates when adding/removing months
                                                        const newDates = { ...formData.loanDates }
                                                        if (isSelected) {
                                                            delete newDates[month]
                                                        } else {
                                                            newDates[month] = getDefaultDateForMonth(month)
                                                        }
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            loanMonths: newMonths,
                                                            loanDates: newDates
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

                                    {formData.loanMonths.length > 0 && (
                                        <div style={{ marginTop: 16 }}>
                                            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                                                Payment dates
                                            </Text>
                                            {formData.loanMonths.map(month => (
                                                <div
                                                    key={month}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 12,
                                                        marginBottom: 8
                                                    }}
                                                >
                                                    <Text style={{ width: 90, flexShrink: 0 }}>
                                                        {MONTH_LABELS[month]}
                                                    </Text>
                                                    <Input
                                                        type="date"
                                                        value={formData.loanDates?.[month] || ''}
                                                        onChange={e => {
                                                            setFormData(prev => ({
                                                                ...prev,
                                                                loanDates: {
                                                                    ...prev.loanDates,
                                                                    [month]: e.target.value
                                                                }
                                                            }))
                                                        }}
                                                        style={{
                                                            borderRadius: 8,
                                                            WebkitAppearance: 'none',
                                                            width: '100%',
                                                            height: 34,
                                                            flex: 1
                                                        }}
                                                    />
                                                </div>
                                            ))}
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
                                Do you receive any bursaries?
                            </Text>
                            <YesNo
                                value={formData.bursary}
                                onChange={val => updateField('bursary', val)}
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
                                        onChange={e => updateField('bursaryAmount', formatMoney(e.target.value))}
                                        style={{ borderRadius: 8, marginBottom: 16 }}
                                    />

                                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                                        Payment dates
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
                                                }}
                                            />
                                            <Button
                                                type="text"
                                                size="small"
                                                danger
                                                onClick={() => {
                                                    const newDates = formData.bursaryDates.filter((_, i) => i !== idx)
                                                    updateField('bursaryDates', newDates)
                                                }}
                                            >
                                                Remove
                                            </Button>
                                        </div>
                                    ))}
                                    <Button
                                        type="dashed"
                                        onClick={() => {
                                            updateField('bursaryDates', [...formData.bursaryDates, ''])
                                        }}
                                        style={{ width: '100%' }}
                                    >
                                        + Add payment date
                                    </Button>
                                </div>
                            )}
                        </div>
                    </Panel>

                    {/* Other Income */}
                    <Panel
                        header={<Text strong>Other Income</Text>}
                        key="otherIncome"
                        style={panelStyle}
                    >
                        <div style={{ marginBottom: 16 }}>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                                Do you receive any other regular income?
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
                                                    style={{ marginBottom: 12 }}
                                                />
                                                <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
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
                                                <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
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
                                                    style={{ marginBottom: 12 }}
                                                />
                                                <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
                                                    End Date (optional)
                                                </Text>
                                                <div style={{ display: 'flex', minWidth: 0 }}>
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
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )
                                    })}
                                    <Button
                                        type="dashed"
                                        onClick={() => {
                                            updateField('otherIncomeItems', [
                                                ...formData.otherIncomeItems,
                                                { type: 'part_time_job', amount: '', date: '', frequency: 'monthly', endDate: '' }
                                            ])
                                        }}
                                        style={{ width: '100%' }}
                                    >
                                        + Add Another
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
                                Do you have any regular expenses?
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
                                                    style={{ marginBottom: 12 }}
                                                />
                                                <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
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
                                                <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
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
                                                    style={{ marginBottom: 12 }}
                                                />
                                                <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
                                                    End Date (optional)
                                                </Text>
                                                <div style={{ display: 'flex', minWidth: 0 }}>
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
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )
                                    })}
                                    <Button
                                        type="dashed"
                                        onClick={() => {
                                            updateField('regularExpenseItems', [
                                                ...formData.regularExpenseItems,
                                                { amount: '', date: '', frequency: 'monthly', type: 'rent', endDate: '' }
                                            ])
                                        }}
                                        style={{ width: '100%' }}
                                    >
                                        + Add Another
                                    </Button>
                                </div>
                            )}
                        </div>
                    </Panel>

                    {/* One-Off Payments */}
                    <Panel
                        header={<Text strong>One-Off Payments</Text>}
                        key="oneOffPayments"
                        style={panelStyle}
                    >
                        <div style={{ marginBottom: 16 }}>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                                Any one-off income or expenses coming up?
                            </Text>
                            <YesNo
                                value={formData.oneOffPayments}
                                onChange={val => updateField('oneOffPayments', val)}
                            />

                            {formData.oneOffPayments && (
                                <div style={{ marginTop: 16 }}>
                                    <Text strong style={{ display: 'block', marginBottom: 12 }}>
                                        One-off Income
                                    </Text>
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
                                                            const newItems = formData.oneOffIn.filter((_, i) => i !== idx)
                                                            updateField('oneOffIn', newItems)
                                                        }}
                                                    >
                                                        Remove
                                                    </Button>
                                                </div>
                                            )}
                                            <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
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
                                            <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
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
                                            <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
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
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                    <Button
                                        type="dashed"
                                        onClick={() => {
                                            updateField('oneOffIn', [
                                                ...formData.oneOffIn,
                                                { name: '', amount: '', date: '' }
                                            ])
                                        }}
                                        style={{ width: '100%', marginBottom: 24 }}
                                    >
                                        + Add Income
                                    </Button>

                                    <Text strong style={{ display: 'block', marginBottom: 12 }}>
                                        One-off Expenses
                                    </Text>
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
                                                            const newItems = formData.oneOffOut.filter((_, i) => i !== idx)
                                                            updateField('oneOffOut', newItems)
                                                        }}
                                                    >
                                                        Remove
                                                    </Button>
                                                </div>
                                            )}
                                            <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
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
                                            <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
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
                                            <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
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
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                    <Button
                                        type="dashed"
                                        onClick={() => {
                                            updateField('oneOffOut', [
                                                ...formData.oneOffOut,
                                                { name: '', amount: '', date: '' }
                                            ])
                                        }}
                                        style={{ width: '100%' }}
                                    >
                                        + Add Expense
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
                                How much do you typically spend each week?
                            </Text>
                            <Radio.Group
                                value={formData.weeklySpend}
                                onChange={e => updateField('weeklySpend', e.target.value)}
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
                        fontSize: 16
                    }}
                >
                    Save Changes
                </Button>
            </div>
        </div>
    )
}
