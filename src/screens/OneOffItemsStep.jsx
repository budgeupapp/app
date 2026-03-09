import { useState, useRef } from 'react'

function formatDisplay(raw) {
    if (!raw) return ''
    const [whole, ...rest] = raw.split('.')
    const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return rest.length ? `${formatted}.${rest.join('.')}` : formatted
}

function cleanNum(val) {
    let v = val.replace(/[^0-9.]/g, '')
    const parts = v.split('.')
    if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('')
    if (parseFloat(v) > 500000) v = '500000'
    return v
}

function TrashIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
    )
}

function ArrowCircleIcon({ direction }) {
    const isIn = direction === 'in'
    const color = isIn ? '#147b75' : '#e06470'
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            style={{ transform: isIn ? 'none' : 'scaleY(-1)', flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2" />
            <path d="M12 16V8M8 12l4-4 4 4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

function PlusCircleIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <circle cx="7.5" cy="7.5" r="6.5" stroke="#999" strokeWidth="1.2" />
            <path d="M7.5 5v5M5 7.5h5" stroke="#999" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
    )
}

export default function OneOffItemsStep({ items, updateItems, compact = false }) {
    const scrollRef = useRef(null)
    const [focusedField, setFocusedField] = useState(null)
    const blurTimerRef = useRef(null)

    const handleFocus = (e) => {
        if (blurTimerRef.current) { clearTimeout(blurTimerRef.current); blurTimerRef.current = null }
        setFocusedField(true)
        const input = e.target
        setTimeout(() => {
            const container = scrollRef.current
            if (!container) return
            const containerRect = container.getBoundingClientRect()
            const inputRect = input.getBoundingClientRect()
            const scrollOffset = inputRect.top - containerRect.top + container.scrollTop
            container.scrollTo({ top: Math.max(0, scrollOffset - 30), behavior: 'smooth' })
        }, 301)
    }

    const handleBlur = () => {
        blurTimerRef.current = setTimeout(() => {
            setFocusedField(false)
            setTimeout(() => {
                scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
            }, 100)
        }, 50)
    }

    const updateItem = (index, field, value) => {
        const next = items.map((item, i) =>
            i === index ? { ...item, [field]: value } : item
        )
        updateItems(next)
    }

    const addItem = () => {
        updateItems([...items, { name: '', amount: '', date: '', direction: 'out' }])
    }

    const removeItem = (index) => {
        if (items.length <= 1) {
            updateItems([{ name: '', amount: '', date: '', direction: 'out' }])
            return
        }
        updateItems(items.filter((_, i) => i !== index))
    }

    const toggleDirection = (index) => {
        const current = items[index].direction || 'out'
        updateItem(index, 'direction', current === 'out' ? 'in' : 'out')
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {!compact && (
            <div style={{ padding: '18px 24px 0', flexShrink: 0 }}>
                <h2 style={{
                    fontSize: 25, fontWeight: 700,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#000', margin: '0 0 8px', lineHeight: 1.3,
                }}>
                    One-off Items
                </h2>
                <p style={{
                    fontSize: 15, fontFamily: 'Nunito, sans-serif',
                    color: '#5e5e5e', margin: '0 0 16px', lineHeight: 1.5,
                }}>
                    Add any one-off income or expenses you're expecting — like birthday money, refunds, trips, or big purchases.
                </p>
            </div>
            )}

            <div style={{
                flex: 1, overflowY: 'auto', overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                padding: compact ? '0 0 24px' : '0 24px 24px',
                minHeight: 0,
            }} ref={scrollRef}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {items.map((item, i) => (
                        <div key={i} style={{
                            border: '1.5px solid #f3f3f3',
                            borderRadius: 10,
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                        }}>
                            {/* Row 1: Direction toggle + Delete */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <button
                                    onClick={() => toggleDirection(i)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        background: (item.direction || 'out') === 'in' ? '#e8f5e9' : '#fce4ec',
                                        border: 'none', borderRadius: 5,
                                        padding: '3px 8px 3px 5px',
                                        fontSize: 10, fontWeight: 700,
                                        fontFamily: 'Nunito, sans-serif',
                                        color: (item.direction || 'out') === 'in' ? '#147b75' : '#e06470',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                        flexShrink: 0,
                                    }}
                                >
                                    <ArrowCircleIcon direction={item.direction || 'out'} />
                                    {(item.direction || 'out') === 'in' ? 'Income' : 'Expense'}
                                </button>
                                <button
                                    onClick={() => removeItem(i)}
                                    style={{
                                        background: 'none', border: 'none',
                                        cursor: 'pointer', padding: 2,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0,
                                    }}
                                >
                                    <TrashIcon />
                                </button>
                            </div>

                            {/* Row 2: Name */}
                            <div>
                                <span style={{
                                    fontSize: 10, fontWeight: 600, color: '#9f9c9c',
                                    fontFamily: 'Nunito, sans-serif',
                                    marginBottom: 3, display: 'block',
                                }}>Item name</span>
                                <div style={{
                                    background: '#f5f5f5', borderRadius: 5,
                                    padding: '0 8px', height: 32,
                                    display: 'flex', alignItems: 'center',
                                }}>
                                    <input
                                        type="text"
                                        placeholder="e.g. Birthday money, Holiday"
                                        value={item.name}
                                        onChange={(e) => updateItem(i, 'name', e.target.value)}
                                        onFocus={handleFocus}
                                        onBlur={handleBlur}
                                        style={{
                                            flex: 1, border: 'none',
                                            background: 'transparent',
                                            fontSize: 14, fontWeight: 700,
                                            fontFamily: 'Nunito, sans-serif',
                                            color: '#000', outline: 'none', padding: 0,
                                            minWidth: 0,
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Row 3: Amount + Date */}
                            <div style={{ display: 'flex', gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                    <span style={{
                                        fontSize: 10, fontWeight: 600, color: '#9f9c9c',
                                        fontFamily: 'Nunito, sans-serif',
                                        marginBottom: 3, display: 'block',
                                    }}>Amount</span>
                                    <div style={{
                                        display: 'flex', alignItems: 'center',
                                        background: '#f5f5f5', borderRadius: 5,
                                        padding: '0 8px', height: 32, gap: 3,
                                    }}>
                                        <span style={{
                                            fontSize: 12, fontWeight: 600,
                                            color: '#5e5e5e', fontFamily: 'Nunito, sans-serif',
                                        }}>£</span>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            placeholder="0"
                                            value={formatDisplay(item.amount)}
                                            onChange={(e) => updateItem(i, 'amount', cleanNum(e.target.value))}
                                            onFocus={handleFocus}
                                            onBlur={handleBlur}
                                            style={{
                                                flex: 1, border: 'none',
                                                background: 'transparent',
                                                fontSize: 12, fontWeight: 700,
                                                fontFamily: 'Nunito, sans-serif',
                                                color: '#000', outline: 'none', padding: 0,
                                                width: 0, minWidth: 0,
                                            }}
                                        />
                                    </div>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <span style={{
                                        fontSize: 10, fontWeight: 600, color: '#9f9c9c',
                                        fontFamily: 'Nunito, sans-serif',
                                        marginBottom: 3, display: 'block',
                                    }}>Date</span>
                                    <div style={{
                                        display: 'flex', alignItems: 'center',
                                        background: '#f5f5f5', borderRadius: 5,
                                        height: 32, overflow: 'hidden',
                                    }}>
                                        <input
                                            type="date"
                                            value={item.date}
                                            onChange={(e) => updateItem(i, 'date', e.target.value)}
                                            onFocus={handleFocus}
                                            onBlur={handleBlur}
                                            style={{
                                                border: 'none', background: 'transparent',
                                                fontSize: 11, fontWeight: 600,
                                                fontFamily: 'Nunito, sans-serif',
                                                color: item.date ? '#000' : '#aaa',
                                                outline: 'none', padding: '0 8px',
                                                height: '100%', width: '100%',
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Add new item button */}
                <button
                    onClick={addItem}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        width: '100%',
                        marginTop: 10,
                        padding: '12px 14px',
                        border: '1.5px dashed #e0e0e0',
                        borderRadius: 10,
                        background: 'none',
                        cursor: 'pointer',
                    }}
                >
                    <PlusCircleIcon />
                    <span style={{
                        fontSize: 15, fontWeight: 700,
                        fontFamily: 'Nunito, sans-serif',
                        color: '#999',
                    }}>
                        New Item
                    </span>
                </button>

                {focusedField && <div style={{ height: '60vh', flexShrink: 0 }} />}
            </div>
        </div>
    )
}
