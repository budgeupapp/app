import { useState, useEffect, useRef } from 'react'
import { Send, Check, MessageSquare } from 'react-feather'
import { PiThumbsDown, PiMinus, PiThumbsUp, PiHeart, PiHeartBreak } from 'react-icons/pi'
import posthog from 'posthog-js'
import { analytics, FEEDBACK_EVENTS } from '../lib/analytics/index.js'

const POSTHOG_SURVEY_ID = import.meta.env.VITE_POSTHOG_FEEDBACK_SURVEY_ID

const RATING_ICONS = [PiHeartBreak, PiThumbsDown, PiMinus, PiThumbsUp, PiHeart]
const RATING_LABELS = ['Terrible', 'Bad', 'Okay', 'Good', 'Love it']
const RATING_COLORS = ['#e06470', '#EC8C17', '#d4b44a', '#1a9e97', '#147b75']
const RATING_BGS = ['#fdf0f1', 'rgba(236,140,23,0.1)', 'rgba(212,180,74,0.1)', '#f0faf9', '#f0faf9']

function RatingQuestion({ question, value, onChange }) {
    const scale = question.scale || 5
    const options = Array.from({ length: scale }, (_, i) => i + 1)

    return (
        <div>
            <p style={{
                fontSize: 14, fontWeight: 600,
                fontFamily: 'Nunito, sans-serif',
                color: '#1a1a1a', margin: '0 0 12px',
            }}>{question.question}</p>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 6,
            }}>
                {options.map(num => {
                    const selected = value === num
                    const Icon = RATING_ICONS[num - 1]
                    const color = RATING_COLORS[num - 1]
                    const bg = RATING_BGS[num - 1]
                    return (
                        <button
                            key={num}
                            onClick={() => onChange(value === num ? null : num)}
                            style={{
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center',
                                background: selected ? bg : '#fff',
                                border: `2px solid ${selected ? color : '#e8e8e8'}`,
                                borderRadius: 12,
                                padding: '10px 8px',
                                cursor: 'pointer',
                                transition: 'background 0.2s ease, border 0.2s ease',
                                flex: 1,
                            }}
                        >
                            {Icon && (
                                <Icon size={18} color={selected ? color : '#999'} style={{ transition: 'color 0.2s ease' }} />
                            )}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

function OpenQuestion({ question, value, onChange }) {
    return (
        <div>
            <p style={{
                fontSize: 14, fontWeight: 600,
                fontFamily: 'Nunito, sans-serif',
                color: '#1a1a1a', margin: '0 0 8px',
            }}>{question.question}</p>
            <textarea
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.blur() } }}
                placeholder="Go on, tell us!"
                rows={3}
                enterKeyHint="done"
                style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1.5px solid #e8e8e8',
                    background: '#fff',
                    fontSize: 14, fontWeight: 500,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#1a1a1a',
                    resize: 'none',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s ease',
                }}
                onFocus={e => { e.target.style.borderColor = '#147B75' }}
                onBlur={e => { e.target.style.borderColor = '#e8e8e8' }}
            />
        </div>
    )
}

function SingleChoiceQuestion({ question, value, onChange }) {
    return (
        <div>
            <p style={{
                fontSize: 14, fontWeight: 600,
                fontFamily: 'Nunito, sans-serif',
                color: '#1a1a1a', margin: '0 0 8px',
            }}>{question.question}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(question.choices || []).map(choice => {
                    const selected = value === choice
                    return (
                        <button
                            key={choice}
                            onClick={() => onChange(choice)}
                            style={{
                                padding: '10px 14px',
                                borderRadius: 10,
                                border: 'none',
                                outline: selected ? '2px solid #147B75' : '1px solid #e8e8e8',
                                background: selected ? '#f0faf9' : '#f5f5f5',
                                fontSize: 14, fontWeight: 600,
                                fontFamily: 'Nunito, sans-serif',
                                color: selected ? '#147B75' : '#444',
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'all 0.2s ease',
                            }}
                        >{choice}</button>
                    )
                })}
            </div>
        </div>
    )
}

function MultipleChoiceQuestion({ question, value, onChange }) {
    const selected = value || []
    const toggle = (choice) => {
        onChange(
            selected.includes(choice)
                ? selected.filter(c => c !== choice)
                : [...selected, choice]
        )
    }

    return (
        <div>
            <p style={{
                fontSize: 14, fontWeight: 600,
                fontFamily: 'Nunito, sans-serif',
                color: '#1a1a1a', margin: '0 0 8px',
            }}>{question.question}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(question.choices || []).map(choice => {
                    const isSelected = selected.includes(choice)
                    return (
                        <button
                            key={choice}
                            onClick={() => toggle(choice)}
                            style={{
                                padding: '10px 14px',
                                borderRadius: 10,
                                border: 'none',
                                outline: isSelected ? '2px solid #147B75' : '1px solid #e8e8e8',
                                background: isSelected ? '#f0faf9' : '#f5f5f5',
                                fontSize: 14, fontWeight: 600,
                                fontFamily: 'Nunito, sans-serif',
                                color: isSelected ? '#147B75' : '#444',
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'all 0.2s ease',
                            }}
                        >{choice}</button>
                    )
                })}
            </div>
        </div>
    )
}

export default function FeedbackScreen() {
    const [survey, setSurvey] = useState(null)
    const [responses, setResponses] = useState({})
    const [submitted, setSubmitted] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [formLoaded, setFormLoaded] = useState(false)
    const scrollRef = useRef(null)

    useEffect(() => {
        analytics.track(FEEDBACK_EVENTS.VIEWED)

        if (!POSTHOG_SURVEY_ID) return
        posthog.getSurveys((surveys) => {
            const match = surveys.find(s => s.id === POSTHOG_SURVEY_ID)
            if (match) {
                setSurvey(match)
                posthog.capture('survey shown', {
                    $survey_id: POSTHOG_SURVEY_ID,
                    $survey_name: match.name,
                })
            }
        }, true)
    }, [])

    const setResponse = (index, value) => {
        setResponses(prev => ({ ...prev, [index]: value }))
    }

    const hasRequiredResponses = () => {
        if (!survey?.questions) return false
        return survey.questions.some((q, i) => {
            if (q.optional) return false
            const val = responses[i]
            if (val === undefined || val === null || val === '') return false
            if (Array.isArray(val) && val.length === 0) return false
            return true
        })
    }

    const handleSubmit = () => {
        if (!hasRequiredResponses()) return
        setSubmitting(true)

        const payload = { $survey_id: POSTHOG_SURVEY_ID }
        survey.questions.forEach((_, i) => {
            const key = i === 0 ? '$survey_response' : `$survey_response_${i}`
            const val = responses[i]
            if (val !== undefined && val !== null && val !== '') {
                payload[key] = Array.isArray(val) ? val.join(', ') : val
            }
        })

        posthog.capture('survey sent', payload)
        analytics.track(FEEDBACK_EVENTS.QUICK_SUBMITTED, {
            question_count: survey.questions.length,
            responses_given: Object.keys(responses).length,
        })

        setTimeout(() => {
            setSubmitting(false)
            setSubmitted(true)
        }, 400)
    }

    const handleReset = () => {
        setResponses({})
        setSubmitted(false)
    }

    const renderQuestion = (question, index) => {
        const value = responses[index]
        const onChange = (val) => setResponse(index, val)

        switch (question.type) {
            case 'rating':
                return <RatingQuestion key={index} question={question} value={value} onChange={onChange} />
            case 'open':
                return <OpenQuestion key={index} question={question} value={value} onChange={onChange} />
            case 'single_choice':
                return <SingleChoiceQuestion key={index} question={question} value={value} onChange={onChange} />
            case 'multiple_choice':
                return <MultipleChoiceQuestion key={index} question={question} value={value} onChange={onChange} />
            default:
                return <OpenQuestion key={index} question={question} value={value} onChange={onChange} />
        }
    }

    return (
        <div style={{
            display: 'flex', flexDirection: 'column',
            height: '100%',
            background: '#fff',
        }}>
            {/* Header */}
            <div style={{
                paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
                padding: 'calc(env(safe-area-inset-top, 0px) + 16px) 20px 12px',
                background: '#fff',
            }}>
                <h1 style={{
                    fontSize: 24, fontWeight: 800,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#1a1a1a', margin: 0,
                }}>Feedback</h1>
            </div>

            <div ref={scrollRef} style={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                padding: '0 16px 0',
                paddingBottom: 'calc(180px + env(safe-area-inset-bottom, 0px))',
            }}>

                <p style={{
                    fontSize: 14, fontWeight: 500,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#888', margin: '0 6px 16px',
                    lineHeight: 1.5,
                }}>Budge Up is at a very early stage, and students' finances are all so different! We'd really appreciate you sharing your unique perspective.</p>

                {/* Suggestion Box Card */}
                {survey && (
                    <div style={{
                        background: '#f0f4f4',
                        borderRadius: 14,
                        padding: '20px 18px',
                        marginBottom: 12,
                        animation: 'surveyFadeIn 0.35s ease',
                    }}>
                        {!submitted ? (
                            <>
                                <p style={{
                                    fontSize: 16, fontWeight: 700,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: '#1a1a1a', margin: '0 0 4px',
                                }}>Suggestion Box</p>
                                <p style={{
                                    fontSize: 13, fontWeight: 500,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: '#888', margin: '0 0 18px',
                                    lineHeight: 1.5,
                                }}>Any bugs, complaints, suggestions, or praise?</p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                                    {survey.questions.map((q, i) => renderQuestion(q, i))}
                                </div>

                                {/* Submit */}
                                <div style={{
                                    maxHeight: hasRequiredResponses() ? 70 : 0,
                                    opacity: hasRequiredResponses() ? 1 : 0,
                                    overflow: 'hidden',
                                    transition: 'max-height 0.3s ease, opacity 0.25s ease',
                                }}>
                                    <button
                                        onClick={handleSubmit}
                                        disabled={submitting}
                                        style={{
                                            width: '100%',
                                            marginTop: 18,
                                            padding: '13px',
                                            borderRadius: 12,
                                            border: 'none',
                                            background: '#147B75',
                                            color: '#fff',
                                            fontSize: 15, fontWeight: 700,
                                            fontFamily: 'Nunito, sans-serif',
                                            cursor: submitting ? 'default' : 'pointer',
                                            display: 'flex', alignItems: 'center',
                                            justifyContent: 'center', gap: 8,
                                            opacity: submitting ? 0.7 : 1,
                                            transition: 'opacity 0.2s ease',
                                        }}
                                    >
                                        <Send size={16} />
                                        {submitting ? 'Sending...' : 'Send feedback'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div style={{
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', padding: '16px 0',
                                animation: 'feedbackFadeIn 0.4s ease',
                            }}>
                                <div style={{
                                    width: 52, height: 52, borderRadius: 26,
                                    background: '#147B75',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    marginBottom: 14,
                                }}>
                                    <Check size={26} color="#fff" strokeWidth={3} />
                                </div>
                                <p style={{
                                    fontSize: 17, fontWeight: 700,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: '#1a1a1a', margin: '0 0 4px',
                                }}>
                                    {survey.appearance?.thankYouMessageHeader || 'Thanks for your feedback!'}
                                </p>
                                <p style={{
                                    fontSize: 13, fontWeight: 500,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: '#888', margin: '0 0 16px',
                                    textAlign: 'center',
                                }}>
                                    {survey.appearance?.thankYouMessageDescription || 'Your input helps us make Budge Up better'}
                                </p>
                                <button
                                    onClick={handleReset}
                                    style={{
                                        background: '#f3f3f3', border: 'none',
                                        color: '#147B75', fontSize: 14,
                                        fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                                        cursor: 'pointer', padding: '8px 20px',
                                        borderRadius: 99,
                                    }}
                                >Send another</button>
                            </div>
                        )}
                    </div>
                )}

                {/* Loading skeleton for survey */}
                {!survey && POSTHOG_SURVEY_ID && (
                    <div style={{
                        background: '#f0f4f4', borderRadius: 14,
                        padding: '20px 18px', marginBottom: 12,
                        animation: 'skeletonFadeIn 0.3s ease',
                    }}>
                        <div style={{ width: '45%', height: 18, borderRadius: 9, background: '#ebebeb', animation: 'skeleton-pulse 1.2s ease-in-out infinite', marginBottom: 6 }} />
                        <div style={{ width: '65%', height: 13, borderRadius: 7, background: '#f0f0f0', animation: 'skeleton-pulse 1.2s ease-in-out infinite', animationDelay: '0.08s', marginBottom: 18 }} />
                        <div style={{ width: '55%', height: 14, borderRadius: 7, background: '#ebebeb', animation: 'skeleton-pulse 1.2s ease-in-out infinite', animationDelay: '0.15s', marginBottom: 12 }} />
                        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} style={{
                                    flex: 1, display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', gap: 6, padding: '10px 0',
                                }}>
                                    <div style={{ width: 32, height: 32, borderRadius: 16, background: '#ebebeb', animation: 'skeleton-pulse 1.2s ease-in-out infinite', animationDelay: `${0.2 + i * 0.06}s` }} />
                                    <div style={{ width: 30, height: 10, borderRadius: 5, background: '#f0f0f0', animation: 'skeleton-pulse 1.2s ease-in-out infinite', animationDelay: `${0.25 + i * 0.06}s` }} />
                                </div>
                            ))}
                        </div>
                        <div style={{ width: '70%', height: 14, borderRadius: 7, background: '#ebebeb', animation: 'skeleton-pulse 1.2s ease-in-out infinite', animationDelay: '0.55s', marginBottom: 10 }} />
                        <div style={{ width: '100%', height: 72, borderRadius: 10, background: '#f0f0f0', animation: 'skeleton-pulse 1.2s ease-in-out infinite', animationDelay: '0.6s' }} />
                    </div>
                )}

                {/* Quick Post-Setup Survey */}
                <div style={{
                    borderRadius: 14,
                    overflow: 'hidden',
                    marginBottom: 12,
                    background: '#f0f4f4',
                    position: 'relative',
                }}>
                    <div style={{ padding: '18px 18px 0' }}>
                        <p style={{
                            fontSize: 16, fontWeight: 700,
                            fontFamily: 'Nunito, sans-serif',
                            color: '#1a1a1a', margin: 0,
                        }}>Quick Survey</p>
                        <p style={{
                            fontSize: 13, fontWeight: 500,
                            fontFamily: 'Nunito, sans-serif',
                            color: '#888', margin: '4px 0 0',
                            lineHeight: 1.4,
                        }}>A few quick questions to help us understand your needs</p>
                    </div>
                    <div style={{ height: 8 }} />
                    {!formLoaded && (
                        <div style={{
                            padding: '20px 18px',
                            display: 'flex', flexDirection: 'column', gap: 16,
                        }}>
                            <div style={{ width: '60%', height: 14, borderRadius: 7, background: '#e8e8e8', animation: 'skeleton-pulse 1.2s ease-in-out infinite' }} />
                            <div style={{ width: '100%', height: 40, borderRadius: 10, background: '#e8e8e8', animation: 'skeleton-pulse 1.2s ease-in-out infinite', animationDelay: '0.1s' }} />
                            <div style={{ width: '45%', height: 14, borderRadius: 7, background: '#e8e8e8', animation: 'skeleton-pulse 1.2s ease-in-out infinite', animationDelay: '0.2s' }} />
                            <div style={{ width: '100%', height: 80, borderRadius: 10, background: '#e8e8e8', animation: 'skeleton-pulse 1.2s ease-in-out infinite', animationDelay: '0.3s' }} />
                        </div>
                    )}
                    <iframe
                        src="https://docs.google.com/forms/d/e/1FAIpQLSdOCeCs4tTbidXiCCQnJdb-34MgybgseESE1OX-Y-H5iiNfQg/viewform?embedded=true"
                        onLoad={() => setFormLoaded(true)}
                        style={{
                            width: '100%', height: 560,
                            border: 'none',
                            borderRadius: 14,
                            opacity: formLoaded ? 1 : 0,
                            transition: 'opacity 0.3s ease',
                        }}
                        title="Quick post-setup survey"
                    />
                </div>

            </div>

            <style>{`
                @keyframes feedbackFadeIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                @keyframes surveyFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes skeletonFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes skeleton-pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.4; }
                }
            `}</style>
        </div>
    )
}
