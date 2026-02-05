import { useState, useRef } from 'react'
import {
    Button,
    Checkbox,
    Divider,
    Form,
    Input,
    Radio,
    Select,
    Slider,
    Typography
} from 'antd'
import { CONSENTS } from '../core/consents'
import ScrollProgress from '../components/ScrollProgress'
import { supabase } from '../lib/supabaseClient'
import {
    saveConsents,
    savePlannedCashflows,
    saveProfile
} from '../lib/api'

const { Title, Text } = Typography

const REQUIRED_CONSENTS = CONSENTS.filter(c =>
    ['manual_data', 'financial_analysis'].includes(c.id)
)

/* ---------- SUB-COMPONENTS ---------- */

const Section = ({ title, children }) => (
    <div style={{ marginBottom: 36 }}>
        <Title level={4} style={{ marginBottom: 12 }}>
            {title}
        </Title>
        {children}
    </div>
)

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

const MoneyDetails = ({
    amount,
    setAmount,
    date,
    setDate,
    frequency,
    setFrequency
}) => (
    <div
        style={{
            marginTop: 8,
            marginBottom: 16,
            padding: '12px 16px',
            maxWidth: 240,
            background: '#fafafa',
            borderRadius: 8,
            boxSizing: 'border-box'
        }}
    >
        <Form.Item label="Amount" style={{ marginBottom: 8 }}>
            <Input
                style={{ width: 150 }}
                prefix="£"
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value)}
            />
        </Form.Item>

        <Form.Item label="Date" style={{ marginBottom: 8 }}>
            <Input
                style={{ width: 150 }}
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
            />
        </Form.Item>

        <Form.Item label="Frequency" style={{ marginBottom: 0 }}>
            <Select
                style={{ width: 150 }}
                value={frequency}
                onChange={setFrequency}
                options={[
                    { value: 'one-off', label: 'One-off' },
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'monthly', label: 'Monthly' },
                    { value: 'termly', label: 'Termly' }
                ]}
            />
        </Form.Item>
    </div>
)

/* ---------- MAIN COMPONENT ---------- */

export default function FinancialOnboardingForm() {

    const scrollRef = useRef(null)

    const [consents, setConsents] = useState(
        Object.fromEntries(REQUIRED_CONSENTS.map(c => [c.id, false]))
    )

    const allRequiredConsented = REQUIRED_CONSENTS.every(c => consents[c.id])

    const [balance, setBalance] = useState('')
    const [studentLoan, setStudentLoan] = useState(null)
    const [loanApril, setLoanApril] = useState(null)

    const [debt, setDebt] = useState(null)
    const [rentBills, setRentBills] = useState(null)
    const [income, setIncome] = useState(null)
    const [surprise, setSurprise] = useState(null)

    const [spendingStyle, setSpendingStyle] = useState(3)
    const [weeklySpend, setWeeklySpend] = useState('')

    const [debtAmount, setDebtAmount] = useState('')
    const [debtDate, setDebtDate] = useState('')
    const [debtFrequency, setDebtFrequency] = useState('one-off')

    const [rentAmount, setRentAmount] = useState('')
    const [rentDate, setRentDate] = useState('')
    const [rentFrequency, setRentFrequency] = useState('monthly')

    const [incomeAmount, setIncomeAmount] = useState('')
    const [incomeDate, setIncomeDate] = useState('')
    const [incomeFrequency, setIncomeFrequency] = useState('one-off')

    const [surpriseAmount, setSurpriseAmount] = useState('')
    const [surpriseDate, setSurpriseDate] = useState('')
    const [surpriseFrequency, setSurpriseFrequency] = useState('one-off')

    const handleLogout = async () => {
        await supabase.auth.signOut()
    }


    const submit = async () => {
        if (!allRequiredConsented) return

        try {
            // 1. Get logged-in user
            const {
                data: { user },
                error: userError
            } = await supabase.auth.getUser()

            if (userError || !user) {
                alert('You must be logged in')
                return
            }

            // 2. Build structured payload
            const data = {
                balance,
                spendingStyle,
                weeklySpend,

                debt: debt && {
                    amount: debtAmount,
                    date: debtDate,
                    frequency: debtFrequency
                },

                rentBills: rentBills && {
                    amount: rentAmount,
                    date: rentDate,
                    frequency: rentFrequency
                },

                income: income && {
                    amount: incomeAmount,
                    date: incomeDate,
                    frequency: incomeFrequency
                },

                surprise: surprise && {
                    amount: surpriseAmount,
                    date: surpriseDate,
                    frequency: surpriseFrequency
                }
            }

            // 3. Persist data
            await saveConsents(user.id, consents)
            await savePlannedCashflows(user.id, data)
            await saveProfile(user.id, {
                balance,
                spendingStyle,
                weeklySpend
            })

            // 4. Success
            alert('Saved successfully')
        } catch (err) {
            console.error(err)
            alert('Something went wrong saving your data')
        }
    }


    const updateConsent = (id, value) =>
        setConsents(prev => ({ ...prev, [id]: value }))

    return (
        <div
            ref={scrollRef}
            style={{ height: '100%', overflowY: 'auto', padding: '0 12px' }}
        >
            <Form
                layout="vertical"
                size="large"
                colon={false}
                onFinish={submit}
                style={{ maxWidth: 720, margin: '0 auto' }}
            >
                <ScrollProgress scrollRef={scrollRef} />

                <Title level={3}>Let’s understand your finances</Title>
                <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
                    This takes about 2 minutes. You can skip anything you’re unsure about.
                </Text>

                <Section title="Your current position">
                    <Form.Item label="Current bank balance">
                        <Input
                            style={{ width: 150 }}
                            inputMode="decimal"
                            value={balance}
                            onChange={e => setBalance(e.target.value)}
                            prefix="£"
                        />
                    </Form.Item>
                </Section>

                <Section title="Incoming money">
                    <Form.Item label="Do you receive student loans?">
                        <YesNo value={studentLoan} onChange={setStudentLoan} />
                    </Form.Item>

                    {studentLoan && (
                        <Form.Item label="Will your next loan arrive in mid-April?">
                            <YesNo value={loanApril} onChange={setLoanApril} />
                        </Form.Item>
                    )}

                    <Form.Item label="Any bursaries or additional income before mid-April?">
                        <YesNo value={income} onChange={setIncome} />
                    </Form.Item>

                    {income && (
                        <MoneyDetails
                            amount={incomeAmount}
                            setAmount={setIncomeAmount}
                            date={incomeDate}
                            setDate={setIncomeDate}
                            frequency={incomeFrequency}
                            setFrequency={setIncomeFrequency}
                        />
                    )}
                </Section>

                <Section title="Upcoming commitments">
                    <Form.Item label="Do you owe or are you owed any money?">
                        <YesNo value={debt} onChange={setDebt} />
                    </Form.Item>

                    {debt && (
                        <MoneyDetails
                            amount={debtAmount}
                            setAmount={setDebtAmount}
                            date={debtDate}
                            setDate={setDebtDate}
                            frequency={debtFrequency}
                            setFrequency={setDebtFrequency}
                        />
                    )}

                    <Form.Item label="Any rent or bill payments due before mid-April?">
                        <YesNo value={rentBills} onChange={setRentBills} />
                    </Form.Item>

                    {rentBills && (
                        <MoneyDetails
                            amount={rentAmount}
                            setAmount={setRentAmount}
                            date={rentDate}
                            setDate={setRentDate}
                            frequency={rentFrequency}
                            setFrequency={setRentFrequency}
                        />
                    )}

                    <Form.Item label="Any surprising expenses coming up?">
                        <YesNo value={surprise} onChange={setSurprise} />
                    </Form.Item>

                    {surprise && (
                        <MoneyDetails
                            amount={surpriseAmount}
                            setAmount={setSurpriseAmount}
                            date={surpriseDate}
                            setDate={setSurpriseDate}
                            frequency={surpriseFrequency}
                            setFrequency={setSurpriseFrequency}
                        />
                    )}
                </Section>

                <Section title="Spending habits">
                    <Form.Item label="Weekly spending (excluding rent & bills)">
                        <Select
                            value={weeklySpend}
                            onChange={setWeeklySpend}
                            placeholder="Select"
                            options={[
                                { value: '50-80', label: '£50–£80 (very frugal)' },
                                { value: '80-120', label: '£80–£120 (typical Bristol student)' },
                                { value: '120-180', label: '£120–£180 (social & eating out)' },
                                { value: '180+', label: '£180+ (very social / lifestyle-heavy)' }
                            ]}
                        />
                    </Form.Item>

                    {/* <Form.Item label="How would you describe your spending style?">
                        <Slider min={1} max={5} value={spendingStyle} onChange={setSpendingStyle} />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            1 = very frugal · 5 = very extravagant
                        </Text>
                    </Form.Item> */}
                </Section>

                <Divider />

                <Section title="Before you continue">
                    <div style={{ background: '#fafafa', padding: 16, borderRadius: 8 }}>
                        {REQUIRED_CONSENTS.map(consent => (
                            <div key={consent.id} style={{ marginBottom: 20 }}>
                                <Title level={5}>{consent.title}</Title>

                                {consent.description.map((d, i) => (
                                    <Text key={i} type="secondary" style={{ display: 'block' }}>
                                        {d}
                                    </Text>
                                ))}

                                <Checkbox
                                    checked={consents[consent.id]}
                                    onChange={e => updateConsent(consent.id, e.target.checked)}
                                    style={{ marginTop: 8 }}
                                >
                                    {consent.checkboxLabel}
                                </Checkbox>
                            </div>
                        ))}
                    </div>
                </Section>

                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12
                    }}
                >
                    <Button
                        style={{ flex: 1 }}
                        type="link"
                        size="large"
                        onClick={handleLogout}
                    >
                        Log out
                    </Button>

                    <Button
                        style={{ flex: 10 }}
                        type="primary"
                        htmlType="submit"
                        size="large"
                        disabled={!allRequiredConsented}
                    >
                        Continue
                    </Button>
                </div>
            </Form>
        </div>
    )
}