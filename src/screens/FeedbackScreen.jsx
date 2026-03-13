import { useState, useEffect, useRef } from 'react'
import { Send, ChevronDown, Check } from 'react-feather'
import posthog from 'posthog-js'
import { analytics, FEEDBACK_EVENTS } from '../lib/analytics/index.js'

const POSTHOG_SURVEY_ID = import.meta.env.VITE_POSTHOG_FEEDBACK_SURVEY_ID

const RATING_EMOJIS = ['😡', '😕', '😐', '🙂', '😍']
const RATING_LABELS = ['Terrible', 'Bad', 'Okay', 'Good', 'Love it']

function RatingQuestion({ question, value, onChange }) {
    const scale = question.scale || 5
    const useEmoji = question.display === 'emoji'
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
                gap: 4,
            }}>
                {options.map(num => {
                    const selected = value === num
                    return (
                        <button
                            key={num}
                            onClick={() => onChange(value === num ? null : num)}
                            style={{
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', gap: 4,
                                background: selected ? 'rgba(20, 123, 117, 0.1)' : 'transparent',
                                border: selected ? '2px solid #147B75' : '2px solid transparent',
                                borderRadius: 12,
                                padding: useEmoji ? '10px 8px' : '12px 8px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                flex: 1,
                                transform: selected ? 'scale(1.08)' : 'scale(1)',
                            }}
                        >
                            {useEmoji ? (
                                <>
                                    <span style={{ fontSize: 28, lineHeight: 1 }}>
                                        {RATING_EMOJIS[num - 1] || num}
                                    </span>
                                    <span style={{
                                        fontSize: 11, fontWeight: 600,
                                        fontFamily: 'Nunito, sans-serif',
                                        color: selected ? '#147B75' : '#888',
                                        transition: 'color 0.2s ease',
                                    }}>{RATING_LABELS[num - 1] || num}</span>
                                </>
                            ) : (
                                <span style={{
                                    fontSize: 18, fontWeight: 700,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: selected ? '#147B75' : '#666',
                                    transition: 'color 0.2s ease',
                                }}>{num}</span>
                            )}
                        </button>
                    )
                })}
            </div>
            {!useEmoji && question.lowerBoundLabel && question.upperBoundLabel && (
                <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    marginTop: 4, padding: '0 4px',
                }}>
                    <span style={{ fontSize: 11, color: '#aaa', fontFamily: 'Nunito, sans-serif' }}>
                        {question.lowerBoundLabel}
                    </span>
                    <span style={{ fontSize: 11, color: '#aaa', fontFamily: 'Nunito, sans-serif' }}>
                        {question.upperBoundLabel}
                    </span>
                </div>
            )}
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
                placeholder={question.placeholder || 'Type your response...'}
                rows={3}
                enterKeyHint="done"
                style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1.5px solid #e0e0e0',
                    background: '#fff',
                    fontSize: 14, fontWeight: 500,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#1a1a1a',
                    resize: 'none',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s ease',
                }}
                onFocus={e => e.target.style.borderColor = '#147B75'}
                onBlur={e => e.target.style.borderColor = '#e0e0e0'}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(question.choices || []).map(choice => {
                    const selected = value === choice
                    return (
                        <button
                            key={choice}
                            onClick={() => onChange(choice)}
                            style={{
                                padding: '10px 14px',
                                borderRadius: 10,
                                border: selected ? '2px solid #147B75' : '1.5px solid #e0e0e0',
                                background: selected ? 'rgba(20, 123, 117, 0.06)' : '#fff',
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(question.choices || []).map(choice => {
                    const isSelected = selected.includes(choice)
                    return (
                        <button
                            key={choice}
                            onClick={() => toggle(choice)}
                            style={{
                                padding: '10px 14px',
                                borderRadius: 10,
                                border: isSelected ? '2px solid #147B75' : '1.5px solid #e0e0e0',
                                background: isSelected ? 'rgba(20, 123, 117, 0.06)' : '#fff',
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
    const [showForm, setShowForm] = useState(false)
    const [formLoaded, setFormLoaded] = useState(false)
    const formSectionRef = useRef(null)

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

        // Build PostHog survey response payload
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

    const toggleForm = () => {
        const next = !showForm
        setShowForm(next)
        if (next) {
            analytics.track(FEEDBACK_EVENTS.FORM_OPENED)
            setTimeout(() => {
                formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }, 350)
        }
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
            background: '#f0f0f0',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 'calc(90px + env(safe-area-inset-bottom, 0px))',
        }}>
            {/* Header */}
            <div style={{ padding: '50px 20px 16px', flexShrink: 0 }}>
                <h1 style={{
                    fontSize: 22, fontWeight: 800,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#000', margin: 0,
                }}>Feedback</h1>
                <p style={{
                    fontSize: 13, fontWeight: 500,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#888', margin: '4px 0 0',
                }}>Help us improve Budge Up</p>
            </div>

            {/* PostHog Survey Card */}
            {survey && (
                <div style={{
                    padding: '0 20px 16px', flexShrink: 0,
                    animation: 'surveyFadeIn 0.35s ease',
                }}>
                    <div style={{
                        background: '#f8f9fa',
                        borderRadius: 16,
                        padding: '20px',
                    }}>
                        {!submitted ? (
                            <>
                                <p style={{
                                    fontSize: 15, fontWeight: 700,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: '#1a1a1a', margin: '0 0 4px',
                                }}>Quick feedback</p>
                                <p style={{
                                    fontSize: 13, fontWeight: 500,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: '#888', margin: '0 0 16px',
                                    lineHeight: 1.5,
                                }}>Send feedback anytime — bugs, feature ideas, or just how you're finding the app!</p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                                            marginTop: 16,
                                            padding: '12px',
                                            borderRadius: 10,
                                            border: 'none',
                                            background: 'linear-gradient(135deg, #147B75 0%, #1E9C94 100%)',
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
                                alignItems: 'center', padding: '12px 0',
                                animation: 'feedbackFadeIn 0.4s ease',
                            }}>
                                <div style={{
                                    width: 48, height: 48, borderRadius: 24,
                                    background: 'linear-gradient(135deg, #147B75 0%, #1E9C94 100%)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    marginBottom: 12,
                                }}>
                                    <Check size={24} color="#fff" strokeWidth={3} />
                                </div>
                                <p style={{
                                    fontSize: 16, fontWeight: 700,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: '#1a1a1a', margin: '0 0 4px',
                                }}>
                                    {survey.appearance?.thankYouMessageHeader || 'Thanks for your feedback!'}
                                </p>
                                <p style={{
                                    fontSize: 13, fontWeight: 500,
                                    fontFamily: 'Nunito, sans-serif',
                                    color: '#888', margin: '0 0 12px',
                                    textAlign: 'center',
                                }}>
                                    {survey.appearance?.thankYouMessageDescription || 'Your input helps us make Budge Up better'}
                                </p>
                                <button
                                    onClick={handleReset}
                                    style={{
                                        background: 'none', border: 'none',
                                        color: '#147B75', fontSize: 13,
                                        fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                                        cursor: 'pointer', padding: '4px 8px',
                                    }}
                                >Send another</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Loading state if survey hasn't loaded yet */}
            {!survey && POSTHOG_SURVEY_ID && (
                <div style={{
                    padding: '0 20px 16px', flexShrink: 0,
                    animation: 'skeletonFadeIn 0.3s ease',
                }}>
                    <div style={{
                        background: '#f8f9fa', borderRadius: 16, padding: '20px',
                    }}>
                        {/* "Quick feedback" title */}
                        <div style={{ width: '45%', height: 18, borderRadius: 9, background: '#ebebeb', animation: 'skeleton-pulse 1.2s ease-in-out infinite', marginBottom: 6 }} />
                        {/* Subtitle */}
                        <div style={{ width: '65%', height: 13, borderRadius: 7, background: '#f0f0f0', animation: 'skeleton-pulse 1.2s ease-in-out infinite', animationDelay: '0.08s', marginBottom: 18 }} />
                        {/* Question label */}
                        <div style={{ width: '55%', height: 14, borderRadius: 7, background: '#ebebeb', animation: 'skeleton-pulse 1.2s ease-in-out infinite', animationDelay: '0.15s', marginBottom: 12 }} />
                        {/* Emoji rating buttons */}
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
                        {/* Open text question label */}
                        <div style={{ width: '70%', height: 14, borderRadius: 7, background: '#ebebeb', animation: 'skeleton-pulse 1.2s ease-in-out infinite', animationDelay: '0.55s', marginBottom: 10 }} />
                        {/* Textarea placeholder */}
                        <div style={{ width: '100%', height: 72, borderRadius: 10, background: '#f0f0f0', animation: 'skeleton-pulse 1.2s ease-in-out infinite', animationDelay: '0.6s' }} />
                    </div>
                </div>
            )}

            {/* Detailed Feedback Section */}
            <div style={{ padding: '0 20px 0', flexShrink: 0 }} ref={formSectionRef}>
                <button
                    onClick={toggleForm}
                    style={{
                        width: '100%',
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between',
                        background: '#f8f9fa',
                        borderRadius: showForm ? '16px 16px 0 0' : 16,
                        padding: '18px 20px',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'border-radius 0.3s ease',
                    }}
                >
                    <div>
                        <p style={{
                            fontSize: 15, fontWeight: 700,
                            fontFamily: 'Nunito, sans-serif',
                            color: '#1a1a1a', margin: 0,
                            textAlign: 'left',
                        }}>Detailed feedback</p>
                        <p style={{
                            fontSize: 13, fontWeight: 500,
                            fontFamily: 'Nunito, sans-serif',
                            color: '#888', margin: '2px 0 0',
                            textAlign: 'left',
                        }}>Have more to say? Fill out our full form</p>
                    </div>
                    <div style={{
                        transition: 'transform 0.3s ease',
                        transform: showForm ? 'rotate(180deg)' : 'rotate(0deg)',
                        color: '#888',
                    }}>
                        <ChevronDown size={20} />
                    </div>
                </button>

                {/* Collapsible Google Form */}
                <div style={{
                    maxHeight: showForm ? 560 : 0,
                    opacity: showForm ? 1 : 0,
                    overflow: 'hidden',
                    transition: 'max-height 0.4s ease, opacity 0.3s ease',
                    background: '#f8f9fa',
                    borderRadius: '0 0 16px 16px',
                }}>
                    <div style={{
                        height: 560,
                        position: 'relative',
                        padding: '0 4px 10px',
                    }}>
                        {showForm && !formLoaded && (
                            <div style={{
                                padding: '20px 16px',
                                display: 'flex', flexDirection: 'column', gap: 16,
                            }}>
                                <div style={{ width: '60%', height: 14, borderRadius: 7, background: '#e8e8e8', animation: 'skeleton-pulse 1.2s ease-in-out infinite' }} />
                                <div style={{ width: '100%', height: 40, borderRadius: 10, background: '#e8e8e8', animation: 'skeleton-pulse 1.2s ease-in-out infinite', animationDelay: '0.1s' }} />
                                <div style={{ width: '45%', height: 14, borderRadius: 7, background: '#e8e8e8', animation: 'skeleton-pulse 1.2s ease-in-out infinite', animationDelay: '0.2s' }} />
                                <div style={{ width: '100%', height: 80, borderRadius: 10, background: '#e8e8e8', animation: 'skeleton-pulse 1.2s ease-in-out infinite', animationDelay: '0.3s' }} />
                            </div>
                        )}
                        {showForm && (
                            <iframe
                                src="https://docs.google.com/forms/d/e/1FAIpQLSdOCeCs4tTbidXiCCQnJdb-34MgybgseESE1OX-Y-H5iiNfQg/viewform?embedded=true"
                                onLoad={() => setFormLoaded(true)}
                                style={{
                                    width: '100%', height: '100%',
                                    border: 'none',
                                    borderRadius: '0 0 16px 16px',
                                    opacity: formLoaded ? 1 : 0,
                                    transition: 'opacity 0.3s ease',
                                }}
                                title="Detailed feedback form"
                            />
                        )}
                    </div>
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
