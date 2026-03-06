const INCOME_SOURCES = [
    { id: 'maintenance_loan', label: 'Maintenance Loan', color: '#147b75' },
    { id: 'bursary', label: 'Bursary', color: '#EC8C17' },
    { id: 'family_friends', label: 'Family/Friends', color: '#5b8def' },
    { id: 'work', label: 'Work', color: '#e06470' },
    { id: 'savings', label: 'Savings', color: '#7eb6b3' },
]

function CheckIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 7L6 10L11 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

export default function RegularIncomeStep({ incomeSources = [], updateIncomeSources }) {
    const toggle = (id) => {
        const next = incomeSources.includes(id)
            ? incomeSources.filter(s => s !== id)
            : [...incomeSources, id]
        updateIncomeSources(next)
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ padding: '18px 24px 12px', flexShrink: 0 }}>
                <h2 style={{
                    fontSize: 25, fontWeight: 700,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#000', margin: '0 0 8px', lineHeight: 1.3,
                }}>
                    Regular income
                </h2>
                <p style={{
                    fontSize: 15, fontFamily: 'Nunito, sans-serif',
                    color: '#5e5e5e', margin: 0, lineHeight: 1.5,
                }}>
                    Select any income you receive regularly, even if only during term time or holidays.
                </p>
            </div>

            <div style={{
                flex: 1, overflowY: 'auto',
                padding: '12px 19px 16px',
                display: 'flex', flexDirection: 'column', gap: 10,
            }}>
                {INCOME_SOURCES.map(({ id, label, color }) => {
                    const selected = incomeSources.includes(id)
                    return (
                        <div
                            key={id}
                            onClick={() => toggle(id)}
                            style={{
                                display: 'flex', alignItems: 'center',
                                padding: '12px 14px',
                                border: selected ? '1.5px solid #147b75' : '1px solid #f3f3f3',
                                borderRadius: 10,
                                cursor: 'pointer',
                                gap: 14,
                                background: selected ? 'rgba(227,242,241,0.15)' : '#fff',
                                transition: 'border-color 0.15s ease, background 0.15s ease',
                            }}
                        >
                            {/* Icon circle */}
                            <div style={{
                                width: 36, height: 36, borderRadius: 10,
                                background: `${color}15`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <span style={{
                                    fontSize: 14, fontWeight: 700,
                                    color: color, fontFamily: 'Nunito, sans-serif',
                                }}>
                                    {label.charAt(0)}
                                </span>
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
                                border: selected ? 'none' : '1px solid #f3f3f3',
                                background: selected ? '#147b75' : '#fff',
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
