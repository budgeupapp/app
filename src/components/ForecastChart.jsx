import { useState, useRef, useMemo, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { format, parseISO } from 'date-fns'

function getPageSize(timeView) {
    switch (timeView) {
        case 'day': return 7
        case 'month': return 30
        case 'term': return 150 // ~5 months for a term
        case 'year': return 365
        default: return 30
    }
}

function getTickInterval(dataLength, timeView) {
    if (timeView === 'day') return 0 // show every day for weekly
    if (timeView === 'term') {
        if (dataLength <= 10) return 0
        if (dataLength <= 60) return Math.floor(dataLength / 6)
        return Math.floor(dataLength / 8)
    }
    if (dataLength <= 10) return 0
    if (dataLength <= 30) return Math.floor(dataLength / 6) - 1
    return Math.floor(dataLength / 5) - 1
}

function formatYAxis(value) {
    if (Math.abs(value) >= 1000) {
        return `£${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`
    }
    return `£${value}`
}

export default function ForecastChart({ data, timeView, savingsBuffer = 0, onVisibleDataChange }) {
    const [page, setPage] = useState(0)
    const [showSavings, setShowSavings] = useState(false)
    const [tooltipActive, setTooltipActive] = useState(false)
    const chartContainerRef = useRef(null)

    const pageSize = getPageSize(timeView)

    const totalPages = timeView === 'year' ? 1 : timeView === 'term' ? 2 : Math.ceil(data.length / pageSize)

    // Clamp page to valid range
    const currentPage = Math.max(0, Math.min(page, totalPages - 1))

    // Reset page when timeView or data changes
    useEffect(() => {
        setPage(0)
    }, [timeView, data.length])

    const pagedData = useMemo(() => {
        if (data.length === 0) return []

        // For term view, show Term 1 (Jan-May) or Term 2 (Sep-Dec) based on page
        if (timeView === 'term') {
            // Find the first data point to determine the current year
            const firstDate = parseISO(data[0].date)
            const currentYear = firstDate.getFullYear()

            if (currentPage === 0) {
                // Term 1: January to May of current year
                return data.filter(d => {
                    const date = parseISO(d.date)
                    const month = date.getMonth() + 1 // 1-12
                    const year = date.getFullYear()
                    return year === currentYear && month >= 1 && month <= 5
                })
            } else {
                // Term 2: September to December of current year
                return data.filter(d => {
                    const date = parseISO(d.date)
                    const month = date.getMonth() + 1 // 1-12
                    const year = date.getFullYear()
                    return year === currentYear && month >= 9 && month <= 12
                })
            }
        }

        const safePage = Math.max(0, Math.min(currentPage, totalPages - 1))
        const start = safePage * pageSize
        return data.slice(start, start + pageSize)
    }, [data, currentPage, totalPages, pageSize, timeView])

    useEffect(() => {
        if (onVisibleDataChange) onVisibleDataChange(pagedData)
    }, [pagedData, onVisibleDataChange])

    // Dismiss tooltip when clicking/tapping outside the chart
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (chartContainerRef.current && !chartContainerRef.current.contains(e.target)) {
                setTooltipActive(false)
            }
        }
        document.addEventListener('pointerdown', handleClickOutside)
        return () => document.removeEventListener('pointerdown', handleClickOutside)
    }, [])

    const formatDate = (dateStr) => {
        const date = parseISO(dateStr)
        switch (timeView) {
            case 'day':
                return format(date, 'EEE')
            case 'month':
                return format(date, 'd MMM')
            case 'term':
                return format(date, 'd MMM')
            case 'year':
                return format(date, 'MMM')
            default:
                return format(date, 'd MMM')
        }
    }

    const pageLabel = () => {
        if (pagedData.length === 0) return ''

        if (timeView === 'term') {
            return currentPage === 0 ? 'Term 1 (Jan–May)' : 'Term 2 (Sep–Dec)'
        }

        const first = format(parseISO(pagedData[0].date), 'd MMM')
        const last = format(parseISO(pagedData[pagedData.length - 1].date), 'd MMM yyyy')
        return `${first} – ${last}`
    }

    const CustomTooltip = ({ active, payload }) => {
        if (!tooltipActive) return null
        if (active && payload && payload.length) {
            const point = payload[0].payload
            const balance = point.balance

            return (
                <div
                    style={{
                        background: '#fff',
                        border: '1px solid #e8e8e8',
                        borderRadius: 12,
                        padding: '10px 14px',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                        minWidth: 120
                    }}
                >
                    <p style={{ margin: '0 0 4px 0', fontSize: 11, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {format(parseISO(point.date), 'MMM d, yyyy')}
                    </p>
                    <p
                        style={{
                            margin: 0,
                            fontSize: 20,
                            fontWeight: 700,
                            color: balance >= 0 ? '#147B75' : '#e74c3c'
                        }}
                    >
                        £{balance.toFixed(2)}
                    </p>
                    {point.transactions && point.transactions.length > 0 && (
                        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #f0f0f0' }}>
                            {point.transactions.map((t, i) => (
                                <p
                                    key={i}
                                    style={{
                                        margin: '2px 0',
                                        fontSize: 11,
                                        color: t.direction === 'in' ? '#147B75' : '#e74c3c'
                                    }}
                                >
                                    {t.direction === 'in' ? '+' : '-'}£{t.amount.toFixed(2)} {t.title}
                                </p>
                            ))}
                        </div>
                    )}
                </div>
            )
        }
        return null
    }

    const CustomActiveDot = (props) => {
        const { cx, cy } = props
        return (
            <g>
                <circle cx={cx} cy={cy} r={8} fill="#fff" stroke="#147B75" strokeWidth={3} />
                <circle cx={cx} cy={cy} r={3} fill="#147B75" />
            </g>
        )
    }

    const tickInterval = getTickInterval(pagedData.length, timeView)

    // When savings is shown, ensure Y-axis extends low enough to show the line
    const yDomain = useMemo(() => {
        if (!showSavings || savingsBuffer <= 0 || pagedData.length === 0) return undefined
        const minBalance = Math.min(...pagedData.map(d => d.balance))
        const yMin = Math.min(minBalance, -savingsBuffer) - 50
        return [yMin, 'auto']
    }, [showSavings, savingsBuffer, pagedData])

    if (pagedData.length === 0) {
        return (
            <div style={{
                width: '100%',
                height: 220,
                background: '#f8f8f8',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* Animated skeleton gradient */}
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                    animation: 'shimmer 2s infinite',
                    transformOrigin: 'center'
                }} />

                {/* Skeleton chart bars */}
                <div style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 8,
                    height: 140,
                    padding: '0 20px'
                }}>
                    {[60, 85, 70, 95, 75, 88, 65].map((height, i) => (
                        <div
                            key={i}
                            style={{
                                width: 30,
                                height: `${height}%`,
                                background: '#e0e0e0',
                                borderRadius: '4px 4px 0 0',
                                opacity: 0.6
                            }}
                        />
                    ))}
                </div>

                <style>{`
                    @keyframes shimmer {
                        0% { transform: translateX(-100%); }
                        100% { transform: translateX(100%); }
                    }
                `}</style>
            </div>
        )
    }

    return (
        <div>
            {/* Controls row: savings toggle + page nav */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
                padding: '0 4px'
            }}>
                {savingsBuffer > 0 ? (
                    <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 11,
                        color: '#888',
                        fontWeight: 600,
                        cursor: 'pointer',
                        userSelect: 'none'
                    }}>
                        <input
                            type="checkbox"
                            checked={showSavings}
                            onChange={(e) => setShowSavings(e.target.checked)}
                            style={{
                                width: 14,
                                height: 14,
                                accentColor: '#e89b3c',
                                cursor: 'pointer'
                            }}
                        />
                        Savings buffer
                    </label>
                ) : <div />}

                {/* Pagination arrows */}
                {totalPages > 1 && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                    }}>
                        <button
                            onClick={() => setPage(Math.max(0, currentPage - 1))}
                            disabled={currentPage === 0}
                            style={{
                                background: 'none',
                                border: 'none',
                                padding: 4,
                                cursor: currentPage === 0 ? 'default' : 'pointer',
                                opacity: currentPage === 0 ? 0.25 : 1,
                                fontSize: 16,
                                color: '#333',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                            aria-label="Previous period"
                        >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                        <span style={{ fontSize: 11, color: '#999', fontWeight: 600, minWidth: 90, textAlign: 'center' }}>
                            {pageLabel()}
                        </span>
                        <button
                            onClick={() => setPage(Math.min(totalPages - 1, currentPage + 1))}
                            disabled={currentPage >= totalPages - 1}
                            style={{
                                background: 'none',
                                border: 'none',
                                padding: 4,
                                cursor: currentPage >= totalPages - 1 ? 'default' : 'pointer',
                                opacity: currentPage >= totalPages - 1 ? 0.25 : 1,
                                fontSize: 16,
                                color: '#333',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                            aria-label="Next period"
                        >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    </div>
                )}
            </div>

            {/* Chart */}
            <div
                ref={chartContainerRef}
                onTouchStart={() => setTooltipActive(true)}
                onMouseDown={() => setTooltipActive(true)}
                style={{ touchAction: 'pan-y' }}
            >
                <ResponsiveContainer width="100%" height={220}>
                    <AreaChart
                        data={pagedData}
                        margin={{ top: 10, right: 10, left: -10, bottom: 5 }}
                    >
                        <defs>
                            <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#147B75" stopOpacity={0.18} />
                                <stop offset="100%" stopColor="#147B75" stopOpacity={0.02} />
                            </linearGradient>
                        </defs>
                        <YAxis
                            tickFormatter={formatYAxis}
                            stroke="transparent"
                            style={{ fontSize: 10, fill: '#bbb' }}
                            axisLine={false}
                            tickLine={false}
                            width={50}
                            dx={-4}
                            domain={yDomain}
                        />
                        <XAxis
                            dataKey="date"
                            tickFormatter={formatDate}
                            stroke="transparent"
                            style={{ fontSize: 11, fill: '#bbb' }}
                            interval={tickInterval}
                            axisLine={false}
                            tickLine={false}
                            dy={8}
                        />
                        <ReferenceLine
                            y={0}
                            stroke="#e74c3c"
                            strokeDasharray="4 4"
                            strokeOpacity={0.5}
                        />
                        {showSavings && savingsBuffer > 0 && (
                            <ReferenceLine
                                y={-savingsBuffer}
                                stroke="#e89b3c"
                                strokeDasharray="4 4"
                                strokeOpacity={0.6}
                            />
                        )}
                        <Tooltip content={<CustomTooltip />} />
                        <Area
                            type="monotone"
                            dataKey="balance"
                            stroke="#147B75"
                            strokeWidth={2.5}
                            fill="url(#balanceGradient)"
                            activeDot={<CustomActiveDot />}
                            dot={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}
