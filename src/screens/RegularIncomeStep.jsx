import { SOURCE_ICONS } from './Dashboard'

const INCOME_SOURCES = [
    { id: 'maintenance_loan', label: 'Maintenance Loan' },
    { id: 'bursary', label: 'Bursary' },
    { id: 'family_friends', label: 'Family & Friends' },
    { id: 'work', label: 'Work' },
    { id: 'other_income', label: 'Other' },
]

function CheckIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 7L6 10L11 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

export default function RegularIncomeStep({ incomeSources, children = [], updateIncomeSources, heading = 'Income', subtitle = "Include your main regular income sources." }) {
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
                    {heading}
                </h2>
                <p style={{
                    fontSize: 15, fontFamily: 'Nunito, sans-serif',
                    color: '#444', margin: 0, lineHeight: 1.5,
                }}>
                    {subtitle}
                </p>
            </div>

            <div style={{
                flex: 1, overflowY: 'visible',
                padding: '12px 19px 16px',
                display: 'flex', flexDirection: 'column', gap: 6,
            }}>
                {INCOME_SOURCES.map(({ id, label }) => {
                    const selected = incomeSources.includes(id)
                    const sourceIcon = SOURCE_ICONS[id]
                    const IconComponent = sourceIcon?.Icon
                    return (
                        <div
                            key={id}
                            onClick={() => toggle(id)}
                            style={{
                                display: 'flex', alignItems: 'center',
                                padding: '12px 14px',
                                border: selected ? '1.5px solid #147b75' : '1.5px solid #f3f3f3',
                                borderRadius: 10,
                                cursor: 'pointer',
                                gap: 12,
                                background: '#fff',
                            }}
                        >
                            {/* Icon in circle */}
                            <div style={{
                                width: 36, height: 36, borderRadius: '50%',
                                background: 'rgba(20, 123, 117, 0.08)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                {IconComponent && <IconComponent size={20} color="#147b75" />}
                            </div>

                            {/* Label */}
                            <span style={{
                                flex: 1, fontSize: 14, fontWeight: 600,
                                fontFamily: 'Nunito, sans-serif',
                                color: '#000',
                            }}>
                                {label}
                            </span>

                            {/* Checkbox */}
                            <div style={{
                                width: 25, height: 25, borderRadius: 5,
                                border: selected ? '1.5px solid #147b75' : '1.5px solid #ddd',
                                background: selected ? '#147b75' : '#fff',
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
            {children}
        </div>
    )
}
