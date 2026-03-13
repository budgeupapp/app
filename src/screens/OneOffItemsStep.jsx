import { getCurrencySymbol } from '../lib/settings'
import { useState, useRef, useEffect, useCallback } from 'react'
import { analytics, DASHBOARD_EVENTS } from '../lib/analytics/index.js'

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

function CheckIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    )
}

function EditPencilIcon() {
    return (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
    )
}

function EyeIcon({ color }) {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    )
}

function EyeOffIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
    )
}

export default function OneOffItemsStep({ items, updateItems, compact = false, minDate = null }) {
    const scrollRef = useRef(null)
    const [focusedField, setFocusedField] = useState(null)
    const [dateError, setDateError] = useState(null)
    const blurTimerRef = useRef(null)
    const focusedRef = useRef(false)
    const touchStartRef = useRef(null)
    const savedScrollRef = useRef(0)
    const [collapsingIndex, setCollapsingIndex] = useState(null)
    const [removingIndex, setRemovingIndex] = useState(null)
    const [addingIndex, setAddingIndex] = useState(null)
    const cardRefs = useRef({})

    const savedCompactScrollRef = useRef(null)

    const scrollInputToTop = (input, containerOverride) => {
        const container = containerOverride || scrollRef.current
        if (!container) return
        const containerRect = container.getBoundingClientRect()
        const stickyHeader = container.querySelector('[data-sticky-header]')
        const headerH = stickyHeader ? stickyHeader.getBoundingClientRect().height : 0
        let label = null
        let el = input.parentElement
        while (el && el !== container) {
            const p = el.querySelector(':scope > p')
            if (p) { label = p; break }
            el = el.parentElement
        }
        const targetRect = label ? label.getBoundingClientRect() : input.getBoundingClientRect()
        const offset = targetRect.top - containerRect.top + container.scrollTop
        container.scrollTo({ top: Math.max(0, offset - headerH - 7), behavior: 'smooth' })
    }

    const scrollCardToTop = (input, containerOverride) => {
        const container = containerOverride
        if (!container) return
        const card = input.closest('[data-oneoff-card]')
        if (!card) return
        const nameLabel = card.querySelector('p')
        const target = nameLabel || card
        const containerRect = container.getBoundingClientRect()
        const targetRect = target.getBoundingClientRect()
        const stickyHeader = container.querySelector('[data-sticky-header]')
        const headerH = stickyHeader ? stickyHeader.getBoundingClientRect().height : 0
        container.scrollTo({ top: Math.max(0, targetRect.top - containerRect.top + container.scrollTop - headerH - 7), behavior: 'smooth' })
    }

    const handleInputTouchStart = (e) => {
        touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }

    const findCompactScrollParent = (input) => {
        let scrollParent = input.closest('[data-oneoff-card]')?.parentElement
        while (scrollParent) {
            const style = window.getComputedStyle(scrollParent)
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && scrollParent.scrollHeight > scrollParent.clientHeight) break
            scrollParent = scrollParent.parentElement
        }
        return scrollParent
    }

    const handleInputTouchEnd = (e) => {
        if (!touchStartRef.current) return
        const dx = e.changedTouches[0].clientX - touchStartRef.current.x
        const dy = e.changedTouches[0].clientY - touchStartRef.current.y
        touchStartRef.current = null
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) return
        const input = e.target
        input.focus({ preventScroll: true })
        if (focusedRef.current) return
        if (compact) {
            const scrollParent = findCompactScrollParent(input)
            if (scrollParent) {
                if (savedCompactScrollRef.current === null) savedCompactScrollRef.current = scrollParent.scrollTop
                scrollCardToTop(input, scrollParent)
            }
        } else {
            scrollInputToTop(input)
        }
    }

    const handleFocus = (e) => {
        if (blurTimerRef.current) { clearTimeout(blurTimerRef.current); blurTimerRef.current = null }
        if (!focusedRef.current && scrollRef.current) {
            savedScrollRef.current = scrollRef.current.scrollTop
        }
        focusedRef.current = true
        setFocusedField(true)
        const input = e.target
        if (compact) {
            setTimeout(() => {
                const scrollParent = findCompactScrollParent(input)
                if (scrollParent) {
                    if (savedCompactScrollRef.current === null) savedCompactScrollRef.current = scrollParent.scrollTop
                    scrollCardToTop(input, scrollParent)
                }
            }, 320)
            return
        }
        setTimeout(() => scrollInputToTop(input), 320)
    }

    const handleBlur = (e) => {
        if (e.relatedTarget && e.target.closest('[data-oneoff-card]')?.contains(e.relatedTarget)) return
        blurTimerRef.current = setTimeout(() => {
            focusedRef.current = false
            savedCompactScrollRef.current = null
            setFocusedField(false)
        }, 200)
    }

    const updateItem = (index, field, value) => {
        const next = items.map((item, i) =>
            i === index ? { ...item, [field]: value } : item
        )
        updateItems(next)
    }

    const addItem = () => {
        analytics.track(DASHBOARD_EVENTS.ONE_OFF_ADDED, {
            item_count: items.length + 1,
        })
        const newIndex = items.length
        setAddingIndex(newIndex)
        updateItems([...items, { name: '', amount: '', date: '', direction: 'out' }])
        setTimeout(() => {
            setAddingIndex(null)
        }, 300)
        setTimeout(() => {
            const container = getScrollContainer()
            if (!container) return
            const cards = container.querySelectorAll('[data-oneoff-card]')
            const lastCard = cards[cards.length - 1]
            if (lastCard) {
                const stickyHeader = container.querySelector('[data-sticky-header]')
                const headerBottom = stickyHeader
                    ? stickyHeader.getBoundingClientRect().bottom
                    : container.getBoundingClientRect().top
                const cardTop = lastCard.getBoundingClientRect().top
                const diff = cardTop - headerBottom - 10
                container.scrollTo({ top: container.scrollTop + diff, behavior: 'smooth' })
            }
        }, 350)
    }

    const getScrollContainer = () => {
        let container = scrollRef.current
        if (compact && container) {
            let scrollParent = container.parentElement
            while (scrollParent) {
                const style = window.getComputedStyle(scrollParent)
                if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && scrollParent.scrollHeight > scrollParent.clientHeight) {
                    return scrollParent
                }
                scrollParent = scrollParent.parentElement
            }
        }
        return container
    }

    const removeItem = (index) => {
        const item = items[index]
        analytics.track(DASHBOARD_EVENTS.ONE_OFF_REMOVED, {
            had_amount: !!item?.amount,
            direction: item?.direction || 'out',
        })
        if (items.length <= 1) {
            updateItems([{ name: '', amount: '', date: '', direction: 'out' }])
            return
        }
        if (removingIndex !== null) return
        setRemovingIndex(index)
        setTimeout(() => {
            const container = getScrollContainer()
            const cards = container?.querySelectorAll('[data-oneoff-card]')
            const scrollToIdx = Math.max(0, index - 1)
            const targetCard = cards?.[scrollToIdx]
            let targetScrollTop = 0
            if (targetCard && container) {
                const containerRect = container.getBoundingClientRect()
                const cardRect = targetCard.getBoundingClientRect()
                const stickyHeader = container.querySelector('[data-sticky-header]')
                const headerH = stickyHeader ? stickyHeader.getBoundingClientRect().height : 0
                targetScrollTop = Math.max(0, cardRect.top - containerRect.top + container.scrollTop - headerH - 8)
            }
            setRemovingIndex(null)
            updateItems(items.filter((_, i) => i !== index))
            requestAnimationFrame(() => {
                container?.scrollTo({ top: targetScrollTop, behavior: 'smooth' })
            })
        }, 280)
    }

    const toggleDirection = (index) => {
        const current = items[index].direction || 'out'
        updateItem(index, 'direction', current === 'out' ? 'in' : 'out')
    }

    const isItemComplete = (item) => {
        const amt = parseFloat(String(item.amount || '0').replace(/,/g, ''))
        return item.name && amt > 0 && item.date
    }

    const confirmItem = (index) => {
        setCollapsingIndex(index)
        setTimeout(() => {
            updateItem(index, 'confirmed', true)
            setCollapsingIndex(null)
        }, 300)
    }

    const expandItem = (index) => {
        updateItem(index, 'confirmed', false)
    }

    const formatDate = (dateStr) => {
        if (!dateStr) return ''
        const dt = new Date(dateStr + 'T00:00:00')
        return `${dt.getDate()} ${dt.toLocaleDateString('en-GB', { month: 'short' })} ${dt.getFullYear()}`
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <style>{`
                @keyframes oneoff-slide-in {
                    from { max-height: 0; opacity: 0; padding-top: 0; padding-bottom: 0; border-width: 0; margin-bottom: -10px; }
                    to { max-height: 500px; opacity: 1; padding-top: 10px; padding-bottom: 10px; border-width: 1.5px; margin-bottom: 0; }
                }
            `}</style>
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
                        Holidays, birthdays, or anything that only happens once.
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
                    {items.map((item, i) => {
                        const isRemoving = removingIndex === i
                        const isAdding = addingIndex === i
                        const dirColor = (item.direction || 'out') === 'in' ? '#147b75' : '#e06470'
                        return (
                            <div key={i} data-oneoff-card style={{
                                border: '1.5px solid #f3f3f3',
                                borderRadius: 10,
                                padding: isRemoving ? '0 24px' : '10px 24px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: isRemoving ? 0 : 8,
                                maxHeight: isRemoving ? 0 : 500,
                                opacity: isRemoving ? 0 : 1,
                                overflow: 'hidden',
                                marginBottom: isRemoving ? -10 : 0,
                                borderWidth: isRemoving ? 0 : 1.5,
                                transition: 'max-height 0.28s ease, opacity 0.22s ease, padding 0.28s ease, margin-bottom 0.28s ease, border-width 0.28s ease, gap 0.28s ease',
                                ...(isAdding ? { animation: 'oneoff-slide-in 0.3s ease forwards' } : {}),
                            }}>
                                {/* Row 1: Direction toggle + Hide icon */}
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
                                            color: dirColor,
                                            cursor: 'pointer',
                                            whiteSpace: 'nowrap',
                                            flexShrink: 0,
                                        }}
                                    >
                                        <ArrowCircleIcon direction={item.direction || 'out'} />
                                        {(item.direction || 'out') === 'in' ? 'Income' : 'Expense'}
                                    </button>
                                    <button
                                        onClick={() => updateItem(i, 'hidden', !item.hidden)}
                                        style={{
                                            background: 'none', border: 'none', padding: 4,
                                            cursor: 'pointer', display: 'flex', alignItems: 'center',
                                            flexShrink: 0,
                                        }}
                                    >
                                        {item.hidden ? <EyeOffIcon /> : <EyeIcon color={dirColor} />}
                                    </button>
                                </div>

                                {/* Row 2: Name */}
                                <div>
                                    <p style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#000', margin: '0 0 8px' }}>Item name</p>
                                    <input
                                        type="text"
                                        placeholder="e.g. Birthday money, Holiday"
                                        value={item.name || ''}
                                        onChange={(e) => updateItem(i, 'name', e.target.value)}
                                        onTouchStart={handleInputTouchStart}
                                        onTouchEnd={handleInputTouchEnd}
                                        onFocus={handleFocus}
                                        onBlur={handleBlur}
                                        style={{
                                            width: '100%', boxSizing: 'border-box',
                                            border: '1px solid #e8e8e8', borderRadius: 10,
                                            padding: '10px 14px',
                                            fontSize: 15, fontWeight: 500,
                                            fontFamily: 'Nunito, sans-serif',
                                            color: '#000', outline: 'none',
                                            marginBottom: 0,
                                        }}
                                    />
                                </div>

                                {/* Row 3: Amount + Date */}
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#000', margin: '0 0 8px' }}>Amount</p>
                                        <div style={{
                                            display: 'flex', alignItems: 'center',
                                            border: '1px solid #e8e8e8', borderRadius: 10,
                                            padding: '0 14px', height: 40, boxSizing: 'border-box', gap: 6,
                                        }}>
                                            <span style={{
                                                fontSize: 16, fontWeight: 600,
                                                color: '#5e5e5e', fontFamily: 'Nunito, sans-serif',
                                            }}>{getCurrencySymbol()}</span>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                placeholder="0.00"
                                                value={formatDisplay(item.amount)}
                                                onChange={(e) => updateItem(i, 'amount', cleanNum(e.target.value))}
                                                onTouchStart={handleInputTouchStart}
                                                onTouchEnd={handleInputTouchEnd}
                                                onFocus={handleFocus}
                                                onBlur={handleBlur}
                                                style={{
                                                    flex: 1, border: 'none',
                                                    background: 'transparent',
                                                    fontSize: 16, fontWeight: 500,
                                                    fontFamily: 'Nunito, sans-serif',
                                                    color: '#000', outline: 'none', padding: 0,
                                                    height: '100%', minWidth: 0,
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#000', margin: '0 0 8px' }}>Date</p>
                                        <div style={{
                                            display: 'flex', alignItems: 'center',
                                            border: '1px solid #e8e8e8', borderRadius: 10,
                                            height: 40, boxSizing: 'border-box', overflow: 'hidden',
                                        }}>
                                            <input
                                                type="date"
                                                value={item.date || ''}
                                                onChange={(e) => {
                                                    updateItem(i, 'date', e.target.value)
                                                }}
                                                onFocus={(e) => {
                                                    const container = scrollRef.current
                                                    if (container) {
                                                        const pos = container.scrollTop
                                                        requestAnimationFrame(() => { container.scrollTop = pos })
                                                    }
                                                }}
                                                onBlur={(e) => {
                                                    const val = items[i]?.date
                                                    if (minDate && val && val < minDate) {
                                                        setDateError('Date can\u2019t be before you joined the app')
                                                        setTimeout(() => setDateError(null), 3000)
                                                    }
                                                    handleBlur(e)
                                                }}
                                                style={{
                                                    border: 'none', background: 'transparent',
                                                    fontSize: 14, fontWeight: 500,
                                                    fontFamily: 'Nunito, sans-serif',
                                                    color: item.date ? '#000' : '#aaa',
                                                    outline: 'none', padding: '0 14px',
                                                    height: '100%', width: '100%',
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Delete at bottom */}
                                {(item.name || item.amount || items.length > 1) && (
                                    <div style={{ textAlign: 'center', margin: '0 -12px', padding: '8px 12px 0' }}>
                                        <span
                                            onClick={() => removeItem(i)}
                                            style={{
                                                fontSize: 10, fontWeight: 600,
                                                fontFamily: 'Nunito, sans-serif',
                                                color: '#e06470', cursor: 'pointer',
                                            }}
                                        >
                                            Delete one-off {(item.direction || 'out') === 'in' ? 'income' : 'expense'}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* Add new item button */}
                <button
                    onClick={addItem}
                    style={{
                        marginTop: 10, width: '100%',
                        padding: '10px 0',
                        border: '1.5px solid #e0e0e0', borderRadius: 10,
                        background: 'none',
                        cursor: 'pointer',
                        fontSize: 14, fontWeight: 600,
                        fontFamily: 'Nunito, sans-serif',
                        color: '#999',
                    }}
                >
                    + Add another item
                </button>

                <div style={{
                    height: focusedField ? '60vh' : 0,
                    flexShrink: 0,
                    transition: 'height 0.3s ease',
                    overflow: 'hidden',
                }} />
            </div>

            {/* Date error toast */}
            {dateError && (
                <div style={{
                    position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)',
                    background: '#333', color: '#fff', padding: '10px 18px',
                    borderRadius: 10, fontSize: 13, fontWeight: 600,
                    fontFamily: 'Nunito, sans-serif', zIndex: 1000,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                    animation: 'fadeIn 0.2s ease',
                    whiteSpace: 'nowrap',
                }}>
                    {dateError}
                </div>
            )}
        </div>
    )
}
