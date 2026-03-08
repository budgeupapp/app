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
import RentStep from './RentStep'
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

function generateRentDates(frequency, nextDate) {
    const dates = []
    const ayEnd = new Date(2026, 7, 31)
    const today = new Date()

    if (!frequency) return dates

    // For weekly: aggregate to monthly events
    if (frequency === 'weekly') {
        let d = new Date(today.getFullYear(), today.getMonth() + 1, 1)
        while (d <= ayEnd) {
            dates.push(d.toISOString().split('T')[0])
            d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
        }
        return dates
    }

    let current = nextDate ? new Date(nextDate + 'T00:00:00') : new Date(today.getFullYear(), today.getMonth() + 1, 1)
    const maxEvents = 12
    let count = 0
    while (current <= ayEnd && count < maxEvents) {
        if (current > today) {
            dates.push(current.toISOString().split('T')[0])
            count++
        }
        switch (frequency) {
            case 'monthly':
                current = new Date(current.getFullYear(), current.getMonth() + 1, current.getDate()); break
            case 'quarterly':
                current = new Date(current.getFullYear(), current.getMonth() + 3, current.getDate()); break
            case 'termly':
                current = new Date(current.getFullYear(), current.getMonth() + 4, current.getDate()); break
            default: return dates
        }
    }
    return dates
}

function buildGraphEvents(formData) {
    const events = []

    // Maintenance loan income events
    if (formData.incomeSources?.includes('maintenance_loan')) {
        const months = formData.loanMonths || DEFAULT_LOAN_MONTHS
        const totalAmount = parseFloat(String(formData.loanAmount || '0').replace(/,/g, ''))

        for (const month of months) {
            const date = formData.loanDates?.[month] || MONTH_KEY_TO_DATE[month]
            if (!date) continue

            const instalmentAmt = parseFloat(String(formData.instalmentAmounts?.[month] || '0').replace(/,/g, ''))
            const amount = instalmentAmt > 0 ? instalmentAmt : (totalAmount > 0 ? Math.round(totalAmount / months.length) : 0)

            if (amount <= 0) continue

            events.push({
                date,
                amount,
                type: 'income',
                label: 'Loan Instalment',
                sublabel: `${MONTH_SHORT[month]} payment`,
                editType: 'loan',
                editMonth: month,
            })
        }
    }

    // Rent expense events
    const rentAmt = parseFloat(String(formData.rentAmount || '0').replace(/,/g, ''))
    if (rentAmt > 0 && formData.rentFrequency) {
        const isWeekly = formData.rentFrequency === 'weekly'
        const monthlyAmt = isWeekly ? Math.round(rentAmt * 52 / 12) : rentAmt
        const rentDates = generateRentDates(formData.rentFrequency, formData.rentNextDate)

        for (const date of rentDates) {
            const dt = new Date(date + 'T00:00:00')
            const monthName = dt.toLocaleDateString('en-GB', { month: 'long' })
            events.push({
                date,
                amount: monthlyAmt,
                type: 'expense',
                label: 'Rent',
                sublabel: `${monthName} rent`,
                editType: 'rent',
            })
        }
    }

    return events
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
    const [messageApi, messageContextHolder] = message.useMessage({
        maxCount: 1
    })

    const addBlur = () => pageRef.current?.classList.add('blur-behind-modal')
    const removeBlur = () => pageRef.current?.classList.remove('blur-behind-modal')

    const [uniSlideOut, setUniSlideOut] = useState(false)
    const [uniSlideIn, setUniSlideIn] = useState(false)
    const [uniConfirming, setUniConfirming] = useState(false)
    const [editingEvent, setEditingEvent] = useState(null)
    const [editAmount, setEditAmount] = useState('')
    const [editingBalance, setEditingBalance] = useState(false)
    const [editBalanceAmount, setEditBalanceAmount] = useState('')
    const transitionRef = useRef(null) // guards against overlapping transitions
    const [graphAnimated, setGraphAnimated] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
            return ['termDates', 'balance', 'regularIncome', 'maintenanceLoan', 'rent'].includes(saved.currentStepId)
        } catch { return false }
    })
    const buildPanelSteps = (sources) => {
        const panels = ['termDates', 'balance', 'regularIncome']
        if ((sources || []).includes('maintenance_loan')) panels.push('maintenanceLoan')
        panels.push('rent')
        return panels
    }
    const [activePanel, setActivePanel] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
            const panels = buildPanelSteps(saved.formData?.incomeSources)
            const idx = panels.indexOf(saved.currentStepId)
            return idx >= 0 ? idx : 0
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
            if (el === document.activeElement) return
            e.preventDefault()
            el.focus({ preventScroll: true })
            scrollAllToTop()
        }

        const handleFocusIn = (e) => {
            const el = e.target
            if (!el.matches('input, textarea, select')) return
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
        // Double rAF ensures browser has painted initial position before animating
        const r1 = requestAnimationFrame(() => {
            requestAnimationFrame(() => setUniSlideOut(false))
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
            messageApi.warning({ content: error, duration: 5, style: { fontSize: 15, cursor: 'pointer' }, onClick: () => messageApi.destroy() })
            return
        }
        goNext()
        setTimeout(() => setActivePanel(1), 16)
    }

    const handlePanelBack = () => {
        if (transitionRef.current) return
        const panels = buildPanelSteps(formData.incomeSources)
        const prev = activePanel - 1
        setActivePanel(prev)
        const prevStepId = panels[prev]
        const t = setTimeout(() => {
            setCurrentStepId(prevStepId)
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
        const panels = buildPanelSteps(formData.incomeSources)
        const nextPanelIdx = activePanel + 1
        if (nextPanelIdx < panels.length) {
            // Still in panel group — advance to next panel step
            setCurrentStepId(panels[nextPanelIdx])
            scrollAreaRef.current?.scrollTo({ top: 0 })
            setTimeout(() => setActivePanel(nextPanelIdx), 16)
        } else {
            // Leaving the panel group — advance to step after last panel
            const lastPanelId = panels[panels.length - 1]
            const lastIdx = STEPS.findIndex(s => s.id === lastPanelId)
            if (lastIdx < STEPS.length - 1) {
                setCurrentStepId(STEPS[lastIdx + 1].id)
            }
            setActivePanel(0)
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


    /* ---------- RENDER ---------- */

    const [imgLoaded, setImgLoaded] = useState(false)

    useEffect(() => {
        const img = new Image()
        img.src = universityIllustration
        img.onload = () => setImgLoaded(true)
    }, [])

    // university + termDates share a single render block so TermDatesStep stays
    // mounted throughout the transition — prevents the flash on step switch
    const PANEL_STEPS = buildPanelSteps(formData.incomeSources)
    const PANEL_LABEL_MAP = {
        termDates: 'Confirm Term Dates',
        balance: 'Confirm Bank Balance',
        regularIncome: 'Confirm Regular Income',
        maintenanceLoan: 'Confirm Maintenance Loan',
        rent: 'Confirm Rent',
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
                        events={activePanel >= 2 ? buildGraphEvents(formData) : []}
                        onEventClick={(evt) => {
                            setEditingEvent(evt)
                            setEditAmount(String(evt.amount))
                        }}
                        onTermClick={activePanel === 0 ? (termId) => setExpandedTerm(termId) : undefined}
                        onBalanceClick={activePanel >= 1 ? () => {
                            setEditBalanceAmount(String(formData.balance || ''))
                            setEditingBalance(true)
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
                }}>
                    {/* Panel content area */}
                    <div style={{ flex: 1, position: 'relative', overflow: 'clip', minHeight: 0 }}>
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
                                {panelId === 'rent' && (
                                    <RentStep
                                        rentAmount={formData.rentAmount}
                                        updateRentAmount={(val) => updateField('rentAmount', val)}
                                        rentFrequency={formData.rentFrequency}
                                        updateRentFrequency={(val) => updateField('rentFrequency', val)}
                                        rentNextDate={formData.rentNextDate}
                                        updateRentNextDate={(val) => updateField('rentNextDate', val)}
                                    />
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Bottom buttons */}
                    <div style={{
                        flexShrink: 0,
                        padding: '10px 19px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        borderTop: '1px solid #f3f3f3',
                    }}>
                        <button
                            onClick={panelOnBack}
                            style={{
                                width: 45, height: 45, borderRadius: 50,
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
                                flex: 1, height: 45,
                                background: '#147b75', color: '#fff',
                                border: 'none', borderRadius: 50,
                                fontSize: 16, fontWeight: 700,
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
                                <div style={{ padding: '10px 19px 14px 10px' }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                    }}>
                                        {/* Ghost back button — fades in during confirm to match panel layout */}
                                        <div style={{
                                            width: uniConfirming ? 75 : 0,
                                            height: 45,
                                            borderRadius: 50,
                                            background: '#f0f0f0',
                                            flexShrink: 0,
                                            opacity: uniConfirming ? 1 : 0,
                                            overflow: 'hidden',
                                            transition: 'width 0.35s cubic-bezier(.22,1,.36,1), opacity 0.25s ease',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
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
                                                fontSize: 16,
                                                fontWeight: 700,
                                                fontFamily: 'Nunito, sans-serif',
                                                cursor: 'pointer',
                                                letterSpacing: 0,
                                                transform: uniSlideOut ? 'scaleX(0.88)' : 'scaleX(1)',
                                                transformOrigin: 'right center',
                                                transition: 'transform 0.45s cubic-bezier(.22,1,.36,1)',
                                            }}
                                        >
                                            {uniConfirming ? 'Confirm Term Dates' : 'Confirm University'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )
                }

                {/* Event edit modal */}
                {editingEvent && (
                    <>
                        {/* Backdrop with blur */}
                        <div
                            onClick={() => setEditingEvent(null)}
                            style={{
                                position: 'fixed', inset: 0,
                                background: 'rgba(217,217,217,0.61)',
                                backdropFilter: 'blur(3px)',
                                WebkitBackdropFilter: 'blur(3px)',
                                zIndex: 100,
                            }}
                        />
                        {/* Modal */}
                        <div style={{
                            position: 'fixed',
                            top: '50%', left: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: 264,
                            background: '#fff',
                            borderRadius: 10,
                            zIndex: 101,
                            overflow: 'hidden',
                            boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
                        }}>
                            {/* Header */}
                            <div style={{
                                background: editingEvent.type === 'income' ? 'rgba(20,123,117,0.1)' : 'rgba(224,100,112,0.1)',
                                padding: '12px 16px 10px',
                                borderBottom: '0.5px solid #ccc',
                                position: 'relative',
                            }}>
                                {/* Type label */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                                    <div style={{
                                        width: 6, height: 6, borderRadius: '50%',
                                        background: editingEvent.type === 'income' ? '#147b75' : '#e06470',
                                    }} />
                                    <span style={{
                                        fontSize: 8, fontWeight: 700,
                                        fontFamily: 'Nunito, sans-serif',
                                        color: editingEvent.type === 'income' ? '#147b75' : '#e06470',
                                        textTransform: 'uppercase',
                                    }}>
                                        {editingEvent.type === 'income' ? 'Income' : 'Expense'}
                                    </span>
                                </div>
                                <p style={{
                                    fontSize: 16, fontWeight: 700,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: '#000', margin: 0,
                                }}>
                                    {editingEvent.label}
                                </p>
                                {/* Close X */}
                                <div
                                    onClick={() => setEditingEvent(null)}
                                    style={{
                                        position: 'absolute', top: 8, right: 10,
                                        width: 17, height: 17, borderRadius: 5,
                                        background: editingEvent.type === 'income' ? '#d0eae4' : '#f5d5d8',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                                        <path d="M1 1L8 8M8 1L1 8" stroke={editingEvent.type === 'income' ? '#147b75' : '#e06470'}
                                            strokeWidth="1.5" strokeLinecap="round" />
                                    </svg>
                                </div>
                            </div>

                            {/* Body */}
                            <div style={{ padding: '16px 16px 12px' }}>
                                <p style={{
                                    fontSize: 14, fontWeight: 700,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: '#000', margin: '0 0 10px',
                                }}>
                                    {editingEvent.sublabel}
                                </p>

                                {/* Amount input */}
                                <div style={{
                                    display: 'flex', alignItems: 'center',
                                    border: '1px solid #e8e8e8', borderRadius: 10,
                                    padding: '0 14px', height: 38, gap: 6,
                                }}>
                                    <span style={{
                                        fontSize: 16, fontWeight: 600,
                                        color: '#5e5e5e', fontFamily: 'Nunito, sans-serif',
                                    }}>£</span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={formatMoney(editAmount)}
                                        onChange={(e) => setEditAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                                        ref={(el) => el && setTimeout(() => el.focus({ preventScroll: true }), 50)}
                                        onFocus={(e) => {
                                            setTimeout(() => {
                                                e.target.parentElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                            }, 300)
                                        }}
                                        style={{
                                            flex: 1, border: 'none',
                                            background: 'transparent',
                                            fontSize: 16, fontWeight: 500,
                                            fontFamily: 'Nunito, sans-serif',
                                            color: '#000', outline: 'none', padding: 0,
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Footer buttons */}
                            <div style={{
                                display: 'flex', alignItems: 'center',
                                padding: '0 16px 14px', gap: 12,
                            }}>
                                <button
                                    onClick={() => setEditingEvent(null)}
                                    style={{
                                        flex: 0, height: 31,
                                        padding: '0 20px',
                                        border: '1px solid #f3f3f3',
                                        borderRadius: 50,
                                        background: '#fff',
                                        fontSize: 12, fontWeight: 700,
                                        fontFamily: 'Nunito, sans-serif',
                                        color: '#5e5e5e', cursor: 'pointer',
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        const val = editAmount.replace(/[^0-9.]/g, '')
                                        if (editingEvent.editType === 'loan' && editingEvent.editMonth) {
                                            updateField('instalmentAmounts', {
                                                ...(formData.instalmentAmounts || {}),
                                                [editingEvent.editMonth]: val,
                                            })
                                        } else if (editingEvent.editType === 'rent') {
                                            updateField('rentAmount', val)
                                        }
                                        setEditingEvent(null)
                                    }}
                                    style={{
                                        flex: 1, height: 31,
                                        border: 'none', borderRadius: 50,
                                        background: '#147b75',
                                        fontSize: 12, fontWeight: 700,
                                        fontFamily: 'Nunito, sans-serif',
                                        color: '#fff', cursor: 'pointer',
                                    }}
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </>
                )}
                {/* Balance edit popup */}
                {editingBalance && (
                    <>
                        <div
                            onClick={() => setEditingBalance(false)}
                            style={{
                                position: 'fixed', inset: 0,
                                background: 'rgba(217,217,217,0.61)',
                                backdropFilter: 'blur(3px)',
                                WebkitBackdropFilter: 'blur(3px)',
                                zIndex: 100,
                            }}
                        />
                        <div style={{
                            position: 'fixed',
                            top: '50%', left: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: 264,
                            background: '#fff',
                            borderRadius: 10,
                            zIndex: 101,
                            overflow: 'hidden',
                            boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
                        }}>
                            {/* Header */}
                            <div style={{
                                background: 'rgba(236,140,23,0.1)',
                                padding: '12px 16px 10px',
                                borderBottom: '0.5px solid #ccc',
                                position: 'relative',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                                    <div style={{
                                        width: 6, height: 6, borderRadius: '50%',
                                        background: '#EC8C17',
                                    }} />
                                    <span style={{
                                        fontSize: 8, fontWeight: 700,
                                        fontFamily: 'Nunito, sans-serif',
                                        color: '#EC8C17',
                                        textTransform: 'uppercase',
                                    }}>
                                        Balance
                                    </span>
                                </div>
                                <p style={{
                                    fontSize: 16, fontWeight: 700,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: '#000', margin: 0,
                                }}>
                                    Bank balance
                                </p>
                                <div
                                    onClick={() => setEditingBalance(false)}
                                    style={{
                                        position: 'absolute', top: 8, right: 10,
                                        width: 17, height: 17, borderRadius: 5,
                                        background: '#f5e3c4',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                                        <path d="M1 1L8 8M8 1L1 8" stroke="#EC8C17"
                                            strokeWidth="1.5" strokeLinecap="round" />
                                    </svg>
                                </div>
                            </div>

                            {/* Body */}
                            <div style={{ padding: '16px 16px 12px' }}>
                                <p style={{
                                    fontSize: 14, fontWeight: 700,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: '#000', margin: '0 0 10px',
                                }}>
                                    Current balance
                                </p>
                                <div style={{
                                    display: 'flex', alignItems: 'center',
                                    border: '1px solid #e8e8e8', borderRadius: 10,
                                    padding: '0 14px', height: 38, gap: 6,
                                }}>
                                    <span style={{
                                        fontSize: 16, fontWeight: 600,
                                        color: '#5e5e5e', fontFamily: 'Nunito, sans-serif',
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
                                            fontSize: 16, fontWeight: 500,
                                            fontFamily: 'Nunito, sans-serif',
                                            color: '#000', outline: 'none', padding: 0,
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Footer */}
                            <div style={{
                                display: 'flex', alignItems: 'center',
                                padding: '0 16px 14px', gap: 12,
                            }}>
                                <button
                                    onClick={() => setEditingBalance(false)}
                                    style={{
                                        flex: 0, height: 31,
                                        padding: '0 20px',
                                        border: '1px solid #f3f3f3',
                                        borderRadius: 50,
                                        background: '#fff',
                                        fontSize: 12, fontWeight: 700,
                                        fontFamily: 'Nunito, sans-serif',
                                        color: '#5e5e5e', cursor: 'pointer',
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        const val = editBalanceAmount.replace(/[^0-9.\-]/g, '')
                                        updateField('balance', val)
                                        setEditingBalance(false)
                                    }}
                                    style={{
                                        flex: 1, height: 31,
                                        border: 'none', borderRadius: 50,
                                        background: '#EC8C17',
                                        fontSize: 12, fontWeight: 700,
                                        fontFamily: 'Nunito, sans-serif',
                                        color: '#fff', cursor: 'pointer',
                                    }}
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div >
        )
    }


}
