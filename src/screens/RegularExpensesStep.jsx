import expenseBills from '../assets/expense-bills.svg'
import expenseUnifees from '../assets/expense-unifees.svg'
import expenseSavings from '../assets/expense-savings.svg'
import expenseRent from '../assets/expense-rent.svg'
import iconOtherExpense from '../assets/icon-other-expense.svg'

function CheckIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 7L6 10L11 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}


const EXPENSE_SOURCES = [
    { id: 'rent', label: 'Rent', color: '#e06470', icon: expenseRent, panelId: 'rent' },
    { id: 'bills', label: 'Bills & Utilities', color: '#e06470', icon: expenseBills, panelId: 'bills' },
    { id: 'uni_fees', label: 'University Fees', color: '#EC8C17', icon: expenseUnifees, panelId: 'uniFees' },
    { id: 'savings_investments', label: 'Savings & Investments', color: '#147b75', icon: expenseSavings, panelId: 'savingsInvestments' },
    { id: 'other_expense', label: 'Other', color: '#9b8ec4', icon: iconOtherExpense, panelId: null },
]

export default function RegularExpensesStep({ expenseSources = [], updateExpenseSources }) {
    const toggle = (id) => {
        const next = expenseSources.includes(id)
            ? expenseSources.filter(s => s !== id)
            : [...expenseSources, id]
        updateExpenseSources(next)
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ padding: '18px 24px 12px', flexShrink: 0 }}>
                <h2 style={{
                    fontSize: 25, fontWeight: 700,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#000', margin: '0 0 8px', lineHeight: 1.3,
                }}>
                    Regular Expenses
                </h2>
                <p style={{
                    fontSize: 15, fontFamily: 'Nunito, sans-serif',
                    color: '#5e5e5e', margin: 0, lineHeight: 1.5,
                }}>
                    Select any expenses you pay regularly.
                </p>
            </div>

            <div style={{
                flex: 1, overflowY: 'auto',
                padding: '12px 19px 16px',
                display: 'flex', flexDirection: 'column', gap: 10,
            }}>
                {EXPENSE_SOURCES.map(({ id, label, color, icon, letter, panelId }) => {
                    const selected = expenseSources.includes(id)
                    return (
                        <div
                            key={id}
                            onClick={() => toggle(id)}
                            style={{
                                display: 'flex', alignItems: 'center',
                                padding: '12px 14px',
                                border: selected ? '1.5px solid #e06470' : '1.5px solid #f3f3f3',
                                borderRadius: 10,
                                cursor: 'pointer',
                                gap: 14,
                                background: selected ? 'rgba(224,100,112,0.05)' : '#fff',
                                transition: 'border-color 0.15s ease, background 0.15s ease',
                            }}
                        >
                            {/* Icon */}
                            <div style={{
                                width: 36, height: 36,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                {icon ? (
                                    <img src={icon} alt="" style={{ width: 28, height: 28, objectFit: 'contain', opacity: 0.8 }} />
                                ) : (
                                    <span style={{ fontSize: 18, fontWeight: 700, color, fontFamily: 'Nunito, sans-serif' }}>{letter}</span>
                                )}
                            </div>

                            {/* Label */}
                            <span style={{
                                flex: 1, fontSize: 17, fontWeight: 600,
                                fontFamily: 'Nunito, sans-serif',
                                color: '#000',
                            }}>
                                {label}
                            </span>

                            {/* Checkbox */}
                            <div style={{
                                width: 25, height: 25, borderRadius: 5,
                                border: selected ? '1.5px solid #e06470' : '1.5px solid #f3f3f3',
                                background: selected ? '#e06470' : '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                                transition: 'background 0.15s ease',
                            }}>
                                {selected && <CheckIcon />}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
