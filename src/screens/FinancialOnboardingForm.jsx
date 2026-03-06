import { useState, useEffect, useRef } from 'react'
import { Button, Input, Modal, Radio, Typography, message } from 'antd'
import StepProgress from '../components/StepProgress'
import NativeSelect from '../components/NativeSelect'
import universityIllustration from '../assets/university-illustration.svg'
import TermDatesStep from './TermDatesStep'
import TermGraph from '../components/TermGraph'
import BankBalanceStep from './BankBalanceStep'
import RegularIncomeStep from './RegularIncomeStep'
import { supabase } from '../lib/supabaseClient'
import { saveCashflowForecast, saveUserFinances } from '../lib/api'
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
    WEEKLY_SPEND_OPTIONS,
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
    // Ref always holding the latest step state — used by event listeners that
    // close over an empty-dep effect and would otherwise read stale values.
    const [modal, modalContextHolder] = Modal.useModal()
    const [messageApi, messageContextHolder] = message.useMessage({
        maxCount: 1
    })

    const addBlur = () => pageRef.current?.classList.add('blur-behind-modal')
    const removeBlur = () => pageRef.current?.classList.remove('blur-behind-modal')

    const [uniSlideOut, setUniSlideOut] = useState(false)
    const [uniSlideIn, setUniSlideIn] = useState(false)
    const transitionRef = useRef(null) // guards against overlapping transitions
    const [graphAnimated, setGraphAnimated] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
            return saved.currentStepId === 'termDates' || saved.currentStepId === 'balance'
        } catch { return false }
    })
    const [activePanel, setActivePanel] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
            if (saved.currentStepId === 'regularIncome') return 2
            if (saved.currentStepId === 'balance') return 1
            return 0
        } catch { return 0 }
    })
    const [expandedTerm, setExpandedTerm] = useState('_init')

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
    const currentStep = STEPS[currentIndex]
    const progress = ((currentIndex + 1) / STEPS.length) * 100
    const isLastStep = currentIndex === STEPS.length - 1

    /* --- Helpers --- */

    const updateField = (key, value) => {
        setFormData(prev => ({ ...prev, [key]: value }))
    }


    /* --- Navigation --- */


    const goNext = ({ skipped = false } = {}) => {
        messageApi.destroy()
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
        messageApi.destroy()
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
            case 'savings':
                return !formData.savings
            case 'studentLoan':
                return formData.studentLoan === null
            case 'bursary':
                return formData.bursary === null
            case 'otherIncome':
                return formData.otherIncome === null
            case 'regularExpense':
                return formData.regularExpense === null
            case 'oneOffIncome':
                return formData.oneOffIncome === null
            case 'oneOffExpenses':
                return formData.oneOffExpenses === null
            case 'weeklySpend':
                return !formData.weeklySpend
            default:
                return false
        }
    }

    const getItemsMissingDates = () => {
        if (
            currentStep.id === 'regularExpense' &&
            formData.regularExpense === true
        ) {
            return formData.regularExpenseItems.filter(
                item => item.amount && !item.date
            )
        }
        if (
            currentStep.id === 'oneOffIncome' &&
            formData.oneOffIncome === true
        ) {
            return formData.oneOffIn.filter(
                item => item.amount && !item.date
            )
        }
        if (
            currentStep.id === 'oneOffExpenses' &&
            formData.oneOffExpenses === true
        ) {
            return formData.oneOffOut.filter(
                item => item.amount && !item.date
            )
        }
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
                    return 'Please select your university from the list'
                }
                break

            case 'studentLoan':
                if (formData.studentLoan === true) {
                    if (!formData.loanAmount) {
                        return 'Please enter your yearly student loan amount (a rough estimate is fine)'
                    }

                    if (formData.loanKnowDates === null) {
                        return 'Please select whether you know the exact dates of your instalments'
                    }

                    if (formData.loanKnowDates === true) {
                        const hasEmptyDates = !(formData.instalmentDates || []).length || (formData.instalmentDates || []).some(d => !d)
                        if (hasEmptyDates) {
                            return 'Missing dates for instalments'
                        }
                    }

                    if (formData.loanKnowDates === false && formData.loanMonths.length === 0) {
                        return 'Please select the month(s) in which you receive your student loan instalments'
                    }
                }
                break

            case 'bursary':
                if (formData.bursary === true) {
                    if (!formData.bursaryAmount) {
                        return 'Please enter your yearly bursary amount (a rough estimate is fine)'
                    }
                    const hasEmptyBursaryDates = !formData.bursaryDates.length || formData.bursaryDates.some(d => !d)
                    if (hasEmptyBursaryDates) {
                        return 'Missing dates for instalments'
                    }
                }
                break

            case 'otherIncome':
                if (formData.otherIncome === true) {
                    for (const item of formData.otherIncomeItems) {
                        if (!item.amount) {
                            return 'Please enter an amount for each income source (a rough estimate is fine)'
                        }
                        if (!item.date) {
                            return 'Please add a date for each income source (a rough estimate is fine)'
                        }
                    }
                }
                break

            case 'regularExpense':
                if (formData.regularExpense === true) {
                    for (const item of formData.regularExpenseItems) {
                        if (!item.amount) {
                            return 'Please enter an amount for each regular expense (a rough estimate is fine)'
                        }
                        if (!item.date) {
                            return 'Please add a date for each regular expense (a rough estimate is fine)'
                        }
                    }
                }
                break

            case 'oneOffIncome':
                if (formData.oneOffIncome === true) {
                    const hasAnyAmount = formData.oneOffIn.some(item => !!item.amount)
                    if (!hasAnyAmount) {
                        return 'Please enter an amount for each one-off income (a rough estimate is fine)'
                    }
                    for (const item of formData.oneOffIn) {
                        if (item.amount && !item.date) {
                            return 'Please add a date for each one-off income (a rough estimate is fine)'
                        }
                    }
                }
                break

            case 'oneOffExpenses':
                if (formData.oneOffExpenses === true) {
                    const hasAnyAmount = formData.oneOffOut.some(item => !!item.amount)
                    if (!hasAnyAmount) {
                        return 'Please enter an amount for each one-off expense (a rough estimate is fine)'
                    }
                    for (const item of formData.oneOffOut) {
                        if (item.amount && !item.date) {
                            return 'Please add a date for each one-off expense (a rough estimate is fine)'
                        }
                    }
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
            messageApi.warning({ content: error, duration: 5, style: { fontSize: 15 } })
            return
        }

        // Instantly switch — both cards are white at the same position so the
        // swap is imperceptible. The only visible animation is TermGraph growing in.
        goNext()
        setGraphAnimated(true)
    }

    const handleTermDatesBack = () => {
        if (transitionRef.current) return // block double-tap
        setUniSlideIn(true)
        setUniSlideOut(true)
        const t1 = setTimeout(() => setUniSlideOut(false), 16)
        const t2 = setTimeout(() => {
            goBack()
            setUniSlideIn(false)
            setGraphAnimated(false)
            transitionRef.current = null
        }, 550)
        transitionRef.current = () => { clearTimeout(t1); clearTimeout(t2) }
    }

    const handleTermDatesNext = () => {
        if (transitionRef.current) return
        if (isCurrentStepBlank()) { confirmSkip(); return }
        const error = checkRequiredFields()
        if (error) {
            messageApi.warning({ content: error, duration: 5, style: { fontSize: 15, cursor: 'pointer' }, onClick: () => messageApi.destroy() })
            return
        }
        goNext()
        setTimeout(() => setActivePanel(1), 16)
    }

    const handlePanelBack = () => {
        if (transitionRef.current) return
        const prev = activePanel - 1
        setActivePanel(prev)
        const t = setTimeout(() => {
            goBack()
            transitionRef.current = null
        }, 420)
        transitionRef.current = () => clearTimeout(t)
    }

    const handlePanelNext = () => {
        if (transitionRef.current) return
        if (isCurrentStepBlank()) { confirmSkip(); return }
        const error = checkRequiredFields()
        if (error) {
            messageApi.warning({ content: error, duration: 5, style: { fontSize: 15, cursor: 'pointer' }, onClick: () => messageApi.destroy() })
            return
        }
        goNext()
        // If going to another panel step, slide to it
        const nextStep = STEPS[currentIndex + 1]
        if (nextStep && ['balance', 'regularIncome'].includes(nextStep.id)) {
            setTimeout(() => setActivePanel(activePanel + 1), 16)
        } else {
            // Leaving the panel group — reset for next time
            setActivePanel(0)
        }
    }

    const handleNext = () => {
        if (isCurrentStepBlank()) {
            confirmSkip()
            return
        }

        const requiredFieldError = checkRequiredFields()
        if (requiredFieldError) {
            messageApi.warning({
                content: requiredFieldError,
                duration: 5,
                style: { fontSize: 15, cursor: 'pointer' },
                onClick: () => messageApi.destroy()
            })
            return
        }

        goNext()
    }

    /* --- Yes/No handler for steps with sub-questions --- */

    const handleYesNo = (field, val) => {
        updateField(field, val)
        if (val === true) {
            scrollToSub()
        }
    }

    /* --- Student loan month toggle --- */

    const toggleMonth = month => {
        setFormData(prev => {
            const months = prev.loanMonths.includes(month)
                ? prev.loanMonths.filter(m => m !== month)
                : [...prev.loanMonths, month]
            const dates = { ...prev.loanDates }

            if (!months.includes(month)) {
                // Month is being removed, delete its date
                delete dates[month]
            } else if (!prev.loanMonths.includes(month) && prev.loanKnowDates) {
                // Month is being added and dates are shown, set default date
                const dateRange = getMonthDateRange(month)
                dates[month] = dateRange.default
            }

            return { ...prev, loanMonths: months, loanDates: dates }
        })
    }

    const updateLoanDate = (month, date) => {
        setFormData(prev => ({
            ...prev,
            loanDates: { ...prev.loanDates, [month]: date }
        }))
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
                messageApi.error({
                    content: 'You must be logged in',
                    duration: 10,
                    style: { fontSize: 15, cursor: 'pointer' },
                    onClick: () => messageApi.destroy()
                })
                return
            }

            await saveCashflowForecast(user.id, formData)

            // Get referral code from user metadata or localStorage
            const referredBy = user.user_metadata?.referred_by || localStorage.getItem('referral_code')

            await saveUserFinances(user.id, {
                university: formData.university,
                balance: formData.balance,
                weeklySpend: formData.weeklySpend,
                savings: formData.savings,
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

            localStorage.removeItem(STORAGE_KEY)

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
                has_regular_expenses: formData.regularExpense,
                has_one_off_income: formData.oneOffIncome,
                has_one_off_expenses: formData.oneOffExpenses,
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

            messageApi.error({
                content: 'Something went wrong saving your data',
                duration: 10,
                style: { fontSize: 15, cursor: 'pointer' },
                onClick: () => messageApi.destroy()
            })
        } finally {
            setSubmitting(false)
        }
    }

    /* ---------- STEP RENDERERS ---------- */

    const renderStepContent = () => {
        switch (currentStep.id) {
            case 'university':
                return (
                    <NativeSelect
                        value={formData.university}
                        onChange={(value) => updateField('university', value)}
                        options={UK_UNIVERSITIES.map(uni => ({ value: uni, label: uni }))}
                        placeholder="Select your university"
                        containerStyle={{ maxWidth: 360 }}
                        style={{ fontSize: 16, height: '40px' }}
                    />
                )

            case 'balance':
                return (
                    <Input
                        style={{ width: '100%', maxWidth: 200 }}
                        prefix={'\u00A3'}
                        placeholder='0'
                        inputMode="decimal"
                        size="large"
                        value={formData.balance}
                        onChange={e =>
                            updateField(
                                'balance',
                                formatMoney(e.target.value)
                            )
                        }
                    />
                )

            case 'savings':
                return (
                    <Input
                        style={{ width: '100%', maxWidth: 200 }}
                        prefix={'\u00A3'}
                        placeholder='0'
                        inputMode="decimal"
                        size="large"
                        value={formData.savings}
                        onChange={e =>
                            updateField(
                                'savings',
                                formatMoney(e.target.value)
                            )
                        }
                    />
                )

            case 'studentLoan':
                return (
                    <>
                        <YesNo
                            value={formData.studentLoan}
                            onChange={val =>
                                handleYesNo('studentLoan', val)
                            }
                        />

                        {formData.studentLoan === true && (
                            <div
                                ref={subQuestionRef}
                                style={{
                                    marginTop: 24,
                                    padding: '20px',
                                    background: '#f8f8f8',
                                    borderRadius: 12,
                                    border: '1px solid #e8e8e8'
                                }}
                            >
                                <Text
                                    strong
                                    style={{
                                        display: 'block',
                                        marginBottom: 12
                                    }}
                                >
                                    What is your total yearly student
                                    loan?
                                </Text>
                                <Input
                                    style={{
                                        width: '100%',
                                        maxWidth: 200,
                                        marginBottom: 24
                                    }}
                                    prefix={'\u00A3'}
                                    inputMode="decimal"
                                    size="large"
                                    placeholder="e.g. 9,500"
                                    value={formData.loanAmount}
                                    onChange={e =>
                                        updateField(
                                            'loanAmount',
                                            formatMoney(e.target.value)
                                        )
                                    }
                                />

                                <Text
                                    strong
                                    style={{
                                        display: 'block',
                                        marginBottom: 12
                                    }}
                                >
                                    Do you know the exact dates of your student loan instalments?
                                </Text>

                                <YesNo
                                    value={formData.loanKnowDates}
                                    onChange={val => {
                                        if (val === true) {
                                            // Initialize with 3 default dates (Sep 15, Jan 15, Apr 15)
                                            const defaultDates = ['september', 'january', 'april'].map(month => {
                                                const dateRange = getMonthDateRange(month)
                                                return dateRange.default
                                            })
                                            setFormData(prev => ({
                                                ...prev,
                                                loanKnowDates: val,
                                                loanDates: {},
                                                loanMonths: [],
                                                instalmentDates: defaultDates
                                            }))
                                            scrollToSub()
                                        } else {
                                            setFormData(prev => ({
                                                ...prev,
                                                loanKnowDates: val,
                                                loanDates: {},
                                                instalmentDates: [],
                                                loanMonths: prev.loanMonths.length ? prev.loanMonths : DEFAULT_LOAN_MONTHS
                                            }))
                                            scrollToSub()
                                        }
                                    }}
                                />

                                {formData.loanKnowDates === true && (
                                    <div style={{ marginTop: 16 }}>
                                        <Text
                                            strong
                                            style={{
                                                display: 'block',
                                                marginBottom: 12
                                            }}
                                        >
                                            When do you receive your student loan instalments?
                                        </Text>
                                        {(formData.instalmentDates || []).map((date, index) => (
                                            <div key={index} style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                                                <Text
                                                    style={{
                                                        width: 90,
                                                        flexShrink: 0
                                                    }}
                                                >
                                                    Instalment {' '}
                                                    {index + 1}
                                                </Text>
                                                <Input
                                                    type="date"
                                                    style={{ width: 160, boxShadow: 'none' }}
                                                    value={date}
                                                    onChange={e => {
                                                        const newDates = [...(formData.instalmentDates || [])]
                                                        newDates[index] = e.target.value
                                                        updateField('instalmentDates', newDates)
                                                    }}

                                                />
                                                {(formData.instalmentDates || []).length > 1 && (
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        danger
                                                        onClick={() => {
                                                            const newDates = (formData.instalmentDates || []).filter((_, i) => i !== index)
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
                                        <Text
                                            strong
                                            style={{
                                                display: 'block',
                                                marginBottom: 12
                                            }}
                                        >
                                            Which months do you receive your student loan instalments?
                                        </Text>

                                        <div
                                            style={{
                                                display: 'flex',
                                                flexWrap: 'wrap',
                                                gap: 8
                                            }}
                                        >
                                            {(showAllMonths
                                                ? ALL_MONTH_KEYS
                                                : DEFAULT_LOAN_MONTHS
                                            ).map(m => (
                                                <MonthChip
                                                    key={m}
                                                    label={MONTH_LABELS[m]}
                                                    selected={formData.loanMonths.includes(m)}
                                                    onClick={() => toggleMonth(m)}
                                                />
                                            ))}

                                            {!showAllMonths && (
                                                <div
                                                    onClick={() => setShowAllMonths(true)}
                                                    style={{
                                                        padding: '6px 16px',
                                                        borderRadius: 999,
                                                        border: '1px dashed #d9d9d9',
                                                        color: '#888',
                                                        cursor: 'pointer',
                                                        fontSize: 14,
                                                        userSelect: 'none'
                                                    }}
                                                >
                                                    + Different months
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )

            case 'bursary':
                return (
                    <>
                        <YesNo
                            value={formData.bursary}
                            onChange={val =>
                                handleYesNo('bursary', val)
                            }
                        />

                        {formData.bursary === true && (
                            <div
                                ref={subQuestionRef}
                                style={{
                                    marginTop: 24,
                                    padding: '20px',
                                    background: '#f8f8f8',
                                    borderRadius: 12,
                                    border: '1px solid #e8e8e8'
                                }}
                            >
                                <Text
                                    strong
                                    style={{
                                        display: 'block',
                                        marginBottom: 12
                                    }}
                                >
                                    What is your total yearly bursary?
                                </Text>
                                <Input
                                    style={{
                                        width: '100%',
                                        maxWidth: 200,
                                        marginBottom: 24
                                    }}
                                    prefix={'\u00A3'}
                                    inputMode="decimal"
                                    size="large"
                                    placeholder="e.g. 2,000"
                                    value={formData.bursaryAmount}
                                    onChange={e =>
                                        updateField(
                                            'bursaryAmount',
                                            formatMoney(e.target.value)
                                        )
                                    }
                                />

                                <Text
                                    strong
                                    style={{
                                        display: 'block',
                                        marginBottom: 4
                                    }}
                                >
                                    When do you receive your bursary instalments?
                                </Text>
                                <Text
                                    type="secondary"
                                    style={{
                                        display: 'block',
                                        marginBottom: 12,
                                        fontSize: 13
                                    }}
                                >
                                    The dates below are based on the typical Bristol University schedule. Adjust them if yours are different.
                                </Text>

                                {formData.bursaryDates.map(
                                    (date, index) => (
                                        <div
                                            key={index}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                marginBottom: 12
                                            }}
                                        >
                                            <Text
                                                style={{
                                                    width: 90,
                                                    flexShrink: 0
                                                }}
                                            >
                                                Instalment {' '}
                                                {index + 1}
                                            </Text>
                                            <Input
                                                type="date"
                                                style={{ width: 160, boxShadow: 'none' }}
                                                value={date}
                                                onChange={e => {
                                                    const updated = [
                                                        ...formData.bursaryDates
                                                    ]
                                                    updated[index] =
                                                        e.target.value
                                                    updateField(
                                                        'bursaryDates',
                                                        updated
                                                    )
                                                }}
                                            />
                                            {formData.bursaryDates
                                                .length > 1 && (
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        danger
                                                        onClick={() => {
                                                            updateField(
                                                                'bursaryDates',
                                                                formData.bursaryDates.filter(
                                                                    (_, i) =>
                                                                        i !==
                                                                        index
                                                                )
                                                            )
                                                        }}
                                                    >
                                                        Remove
                                                    </Button>
                                                )}
                                        </div>
                                    )
                                )}
                                <Button
                                    type="dashed"
                                    onClick={() =>
                                        updateField(
                                            'bursaryDates',
                                            [
                                                ...formData.bursaryDates,
                                                ''
                                            ]
                                        )
                                    }
                                    style={{ width: '100%' }}
                                >
                                    + Add instalment
                                </Button>
                            </div>
                        )}
                    </>
                )

            case 'otherIncome':
                return (
                    <>
                        <YesNo
                            value={formData.otherIncome}
                            onChange={val =>
                                handleYesNo('otherIncome', val)
                            }
                        />

                        {formData.otherIncome === true && (
                            <div
                                ref={subQuestionRef}
                                style={{
                                    marginTop: 24,
                                    padding: '20px',
                                    background: '#f8f8f8',
                                    borderRadius: 12,
                                    border: '1px solid #e8e8e8'
                                }}
                            >
                                <OtherIncomeList
                                    items={formData.otherIncomeItems}
                                    onChange={items =>
                                        updateField(
                                            'otherIncomeItems',
                                            items
                                        )
                                    }
                                />
                            </div>
                        )}
                    </>
                )

            case 'regularExpense':
                return (
                    <>
                        <YesNo
                            value={formData.regularExpense}
                            onChange={val =>
                                handleYesNo('regularExpense', val)
                            }
                        />

                        {formData.regularExpense === true && (
                            <div
                                ref={subQuestionRef}
                                style={{
                                    marginTop: 24,
                                    padding: '20px',
                                    background: '#f8f8f8',
                                    borderRadius: 12,
                                    border: '1px solid #e8e8e8'
                                }}
                            >
                                <RegularExpenseList
                                    items={
                                        formData.regularExpenseItems
                                    }
                                    onChange={items =>
                                        updateField(
                                            'regularExpenseItems',
                                            items
                                        )
                                    }
                                />
                            </div>
                        )}
                    </>
                )

            case 'oneOffIncome':
                return (
                    <>
                        <YesNo
                            value={formData.oneOffIncome}
                            onChange={val =>
                                handleYesNo('oneOffIncome', val)
                            }
                        />

                        {formData.oneOffIncome === true && (
                            <div
                                ref={subQuestionRef}
                                style={{
                                    marginTop: 24,
                                    padding: '20px',
                                    background: '#f8f8f8',
                                    borderRadius: 12,
                                    border: '1px solid #e8e8e8'
                                }}
                            >
                                <OneOffItemList
                                    items={formData.oneOffIn}
                                    onChange={items =>
                                        updateField('oneOffIn', items)
                                    }
                                    type="income"
                                />
                            </div>
                        )}
                    </>
                )

            case 'oneOffExpenses':
                return (
                    <>
                        <YesNo
                            value={formData.oneOffExpenses}
                            onChange={val =>
                                handleYesNo('oneOffExpenses', val)
                            }
                        />

                        {formData.oneOffExpenses === true && (
                            <div
                                ref={subQuestionRef}
                                style={{
                                    marginTop: 24,
                                    padding: '20px',
                                    background: '#f8f8f8',
                                    borderRadius: 12,
                                    border: '1px solid #e8e8e8'
                                }}
                            >
                                <OneOffItemList
                                    items={formData.oneOffOut}
                                    onChange={items =>
                                        updateField('oneOffOut', items)
                                    }
                                    type="expense"
                                />
                            </div>
                        )}
                    </>
                )

            case 'weeklySpend':
                return (
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
                )

            default:
                return null
        }
    }
    /* ---------- RENDER ---------- */

    // university + termDates share a single render block so TermDatesStep stays
    // mounted throughout the transition — prevents the flash on step switch
    const PANEL_STEPS = ['termDates', 'balance', 'regularIncome']
    const PANEL_LABELS = ['Confirm Term Dates', 'Confirm Bank Balance', 'Confirm Regular Income']
    const inPanelGroup = currentStep.id === 'university' || PANEL_STEPS.includes(currentStep.id) || activePanel > 0

    if (inPanelGroup) {
        const terms = formData.termDates?.terms || []
        const balanceNum = parseFloat(String(formData.balance || '0').replace(/,/g, '')) || 0
        const activeExpanded = expandedTerm === '_init' ? (terms[0]?.id ?? null) : expandedTerm

        // Determine which handler to use based on active panel
        const panelOnNext = activePanel === 0 ? handleTermDatesNext : handlePanelNext
        const panelOnBack = activePanel === 0 ? handleTermDatesBack : handlePanelBack

        return (
            <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
                    />
                </div>

                {/* Form card with sliding panels */}
                <div style={{
                    margin: '0px 19px 12px',
                    flex: 1,
                    background: '#fff',
                    borderRadius: 20,
                    boxShadow: '0 0 15px rgba(0,0,0,0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    minHeight: 0,
                }}>
                    {/* Panel content area */}
                    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
                        {PANEL_STEPS.map((panelId, i) => (
                            <div key={panelId} style={{
                                position: 'absolute', inset: 0,
                                display: 'flex', flexDirection: 'column',
                                transform: i < activePanel ? 'translateY(-100%)'
                                    : i > activePanel ? 'translateY(100%)'
                                        : 'translateY(0)',
                                transition: 'transform 0.6s cubic-bezier(.22,1,.36,1)',
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
                                {panelId === 'regularIncome' && (
                                    <RegularIncomeStep
                                        incomeSources={formData.incomeSources || []}
                                        updateIncomeSources={(val) => updateField('incomeSources', val)}
                                    />
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Bottom buttons */}
                    <div style={{
                        flexShrink: 0,
                        padding: '10px 19px 24px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        borderTop: '1px solid #f3f3f3',
                    }}>
                        <button
                            onClick={panelOnBack}
                            style={{
                                width: 50, height: 50, borderRadius: 50,
                                border: 'none', background: '#f0f0f0',
                                cursor: 'pointer', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
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
                                flex: 1, height: 50,
                                background: '#147b75', color: '#fff',
                                border: 'none', borderRadius: 50,
                                fontSize: 18, fontWeight: 700,
                                fontFamily: 'Nunito, sans-serif',
                                cursor: 'pointer', letterSpacing: 0,
                            }}
                        >
                            {PANEL_LABELS[activePanel]}
                        </button>
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
                                        style={{ width: '100%', maxWidth: 303, height: 'auto', objectFit: 'contain' }}
                                    />
                                </div>
                                <div style={{ padding: '10px 19px 24px' }}>
                                    <button
                                        onClick={handleUniversityConfirm}
                                        style={{
                                            width: '100%',
                                            height: 50,
                                            background: '#147b75',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: 50,
                                            fontSize: 18,
                                            fontWeight: 700,
                                            fontFamily: 'Nunito, sans-serif',
                                            cursor: 'pointer',
                                            letterSpacing: 0,
                                            transform: uniSlideOut ? 'scaleX(0.82)' : 'scaleX(1)',
                                            transformOrigin: 'right center',
                                            transition: 'transform 0.45s cubic-bezier(.22,1,.36,1)',
                                        }}
                                    >
                                        Confirm University
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )
                }
            </div >
        )
    }


}
