import { EXPENSE_CATEGORIES, SOURCE_ICONS } from '../config/categories'

function CheckIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 7L6 10L11 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

export default function RegularExpensesStep({ expenseSources = [], updateExpenseSources }) {
    const toggle = (id) => {
        const next = expenseSources.includes(id)
            ? expenseSources.filter(s => s !== id)
            : [...expenseSources, id]
        updateExpenseSources(next)
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ padding: '0 24px 6px', flexShrink: 0 }}>
                <p style={{
                    fontSize: 14, fontFamily: 'Nunito, sans-serif',
                    color: '#555', margin: 0, lineHeight: 1.5,
                }}>
                    These are just all the predictable things! Everything else we'll lump into your average day-to-day spending.
                </p>
            </div>
            <div style={{
                flex: 1, overflowY: 'auto',
                padding: '12px 19px 16px',
                display: 'flex', flexDirection: 'column', gap: 6,
            }}>
                {EXPENSE_CATEGORIES.map(({ id, label, Icon, color }) => {
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
                                gap: 12,
                                background: '#fff',
                            }}
                        >
                            <div style={{
                                width: 36, height: 36, borderRadius: '50%',
                                background: 'rgba(224, 100, 112, 0.08)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                {Icon && <Icon size={20} color="#e06470" />}
                            </div>
                            <span style={{
                                flex: 1, fontSize: 14, fontWeight: 600,
                                fontFamily: 'Nunito, sans-serif',
                                color: '#000',
                            }}>
                                {label}
                            </span>
                            <div style={{
                                width: 25, height: 25, borderRadius: 5,
                                border: selected ? '1.5px solid #e06470' : '1.5px solid #ddd',
                                background: selected ? '#e06470' : '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                                transition: 'background 0.15s ease, border-color 0.15s ease',
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
