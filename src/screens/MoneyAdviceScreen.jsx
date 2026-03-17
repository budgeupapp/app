import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { analytics, MONEY_ADVICE_EVENTS } from '../lib/analytics/index.js'
import { ExternalLink, Mail, ChevronRight } from 'react-feather'
import { PiLifebuoy, PiChatCircle, PiMoney, PiBriefcase, PiBookOpen, PiHeart, PiWarning, PiShieldCheck } from 'react-icons/pi'

const STORAGE_KEY = 'budgeup_onboarding_state'

function getUniversity() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
            const parsed = JSON.parse(saved)
            return parsed.formData?.university || ''
        }
    } catch { /* ignore */ }
    return ''
}

const SITUATION_LABELS = [
    { value: 1, label: 'Code red!', color: '#e06470' },
    { value: 2, label: 'Struggling', color: '#EC8C17' },
    { value: 3, label: 'Getting by', color: '#d4b44a' },
    { value: 4, label: 'Doing okay', color: '#1a9e97' },
    { value: 5, label: 'Chilling', color: '#147b75' },
]

function MoodFace({ mood, size = 40, active = false }) {
    const c = active ? '#fff' : '#999'
    return (
        <svg width={size} height={size} viewBox="0 0 100 100">
            {mood === 1 && <>
                <path d="M26 36 Q34 46 42 36" stroke={c} strokeWidth="7" fill="none" strokeLinecap="round" />
                <path d="M58 36 Q66 46 74 36" stroke={c} strokeWidth="7" fill="none" strokeLinecap="round" />
                <path d="M28 72 Q50 56 72 72" stroke={c} strokeWidth="7" fill="none" strokeLinecap="round" />
            </>}
            {mood === 2 && <>
                <circle cx="35" cy="38" r="5.5" fill={c} />
                <circle cx="65" cy="38" r="5.5" fill={c} />
                <path d="M32 70 Q50 58 68 70" stroke={c} strokeWidth="6.5" fill="none" strokeLinecap="round" />
            </>}
            {mood === 3 && <>
                <circle cx="35" cy="38" r="5.5" fill={c} />
                <circle cx="65" cy="38" r="5.5" fill={c} />
                <line x1="34" y1="66" x2="66" y2="66" stroke={c} strokeWidth="6.5" strokeLinecap="round" />
            </>}
            {mood === 4 && <>
                <circle cx="35" cy="38" r="5.5" fill={c} />
                <circle cx="65" cy="38" r="5.5" fill={c} />
                <path d="M30 60 Q50 76 70 60" stroke={c} strokeWidth="6.5" fill="none" strokeLinecap="round" />
            </>}
            {mood === 5 && <>
                <path d="M26 44 Q34 34 42 44" stroke={c} strokeWidth="7" fill="none" strokeLinecap="round" />
                <path d="M58 44 Q66 34 72 44" stroke={c} strokeWidth="7" fill="none" strokeLinecap="round" />
                <path d="M26 58 Q50 80 74 58" stroke={c} strokeWidth="7" fill="none" strokeLinecap="round" />
            </>}
        </svg>
    )
}

function ResourceCard({ icon: Icon, iconColor, title, description, href, onClick }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
                onClick?.()
                analytics.track(MONEY_ADVICE_EVENTS.BUTTON_CLICKED, { resource: title })
            }}
            style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '16px 18px',
                background: '#f0f4f4', borderRadius: 14,
                textDecoration: 'none', cursor: 'pointer',
                marginBottom: 10,
                transition: 'transform 0.1s ease',
            }}
        >
            <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `${iconColor}12`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
            }}>
                <Icon size={18} color={iconColor} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a', marginBottom: 3 }}>
                    {title}
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#888', lineHeight: 1.4 }}>
                    {description}
                </div>
            </div>
            <ExternalLink size={14} color="#bbb" style={{ flexShrink: 0, marginTop: 4 }} />
        </a>
    )
}

function Toggle({ on, onChange, loading }) {
    return (
        <button onClick={onChange} style={{
            width: 48, height: 26, borderRadius: 13,
            background: on ? '#147b75' : '#e0e0e0',
            border: 'none', cursor: 'pointer', padding: 0,
            position: 'relative', flexShrink: 0,
            opacity: loading ? 0.5 : 1,
            transition: 'background 0.2s ease, opacity 0.2s ease',
        }}>
            <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: '#fff', position: 'absolute', top: 2,
                left: on ? 24 : 2,
                transition: 'left 0.2s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            }} />
        </button>
    )
}

// Bristol-specific resources ordered by urgency
function getBristolResources(situation) {
    const urgent = [
        {
            icon: PiWarning,
            iconColor: '#e06470',
            title: 'Emergency £50 Food Voucher',
            description: 'If you have less than £100 right now, get a free food voucher by tomorrow.',
            href: 'https://forms.office.com/pages/responsepage.aspx?id=MH_ksn3NTkql2rGM8aQVG3okPmcberBHt-iwi1k7fYJUQTYzT1FPR01NVVBPTFVPNUo4S0tENFg4RiQlQCN0PWcu&route=shorturl',
            priority: 1,
        },
        {
            icon: PiMoney,
            iconColor: '#e06470',
            title: 'Financial Assistance Fund — £300',
            description: 'If you\'ll have less than £100 at any point in the next 3 months.',
            href: 'https://forms.office.com/pages/responsepage.aspx?id=MH_ksn3NTkql2rGM8aQVG3okPmcberBHt-iwi1k7fYJUMFk0WlVDVEZYUDcyTVpETDJZRTZWR1FCViQlQCN0PWcu&route=shorturl',
            priority: 1,
        },
        {
            icon: PiLifebuoy,
            iconColor: '#e06470',
            title: 'Financial Assistance Fund — £600',
            description: 'If you\'re also in overdraft or working lots of hours to get by.',
            href: 'https://forms.office.com/pages/responsepage.aspx?id=MH_ksn3NTkql2rGM8aQVG3okPmcberBHt-iwi1k7fYJUMFk0WlVDVEZYUDcyTVpETDJZRTZWR1FCViQlQCN0PWcu&route=shorturl',
            priority: 1,
        },
    ]

    const support = [
        {
            icon: PiChatCircle,
            iconColor: '#147b75',
            title: 'Money Advice Drop-in Sessions',
            description: 'Free online drop-ins at 10am and 2pm every weekday. Ask anything!',
            href: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_ZGM0ZGVmYTgtZGUzZi00ZDZjLWIxMTctODYyNTIzNDk5YTdl%40thread.v2/0?context=%7b%22Tid%22%3a%22b2e47f30-cd7d-4a4e-a5da-b18cf1a4151b%22%2c%22Oid%22%3a%228935e5e7-c59d-401f-ab88-dcd2d56714bb%22%7d',
            priority: 2,
        },
        {
            icon: PiShieldCheck,
            iconColor: '#147b75',
            title: 'IT Equipment Support — £250',
            description: 'If you apply for the Financial Assistance Fund, you can also get £250 for IT equipment.',
            href: 'https://www.bristol.ac.uk/students/support/finances/advice/',
            priority: 2,
        },
        {
            icon: PiHeart,
            iconColor: '#147b75',
            title: 'SU Activity Hardship Fund — up to £200',
            description: 'Support towards SU activities. Check the deadlines!',
            href: 'https://www.bristolsu.org.uk/support-centre/support-for-committees/group-finance/activity-hardship-fund',
            priority: 3,
        },
        {
            icon: PiBriefcase,
            iconColor: '#147b75',
            title: 'Find Part-Time Work',
            description: 'The careers service has advice on finding part-time work alongside your studies.',
            href: 'https://mycareer.bristol.ac.uk/student/svc/cms.html#/content/article/fa8664f7-a43f-4973-9a26-07dec1b3670e',
            priority: 4,
        },
        {
            icon: Mail,
            iconColor: '#147b75',
            title: 'Email Money Advice',
            description: <>Get in touch directly at <span style={{ color: '#147b75', textDecoration: 'underline' }}>money-advice@bristol.ac.uk</span></>,
            href: 'mailto:money-advice@bristol.ac.uk',
            priority: 5,
        },
    ]

    // Sort: urgent stuff first for low scores, support stuff first for higher scores
    if (situation <= 2) return [...urgent, ...support]
    if (situation === 3) return [...support.slice(0, 2), ...urgent.slice(1), ...support.slice(2)]
    return [...support, ...urgent.slice(1)]
}

const GENERIC_RESOURCES = [
    {
        icon: PiBookOpen,
        iconColor: '#147b75',
        title: 'MoneySavingExpert — Student Finance',
        description: 'The UK\'s biggest consumer finance site. Great guides on student loans, budgeting & saving.',
        href: 'https://www.moneysavingexpert.com/students/',
    },
    {
        icon: PiMoney,
        iconColor: '#147b75',
        title: 'UCAS — Student Finance Guide',
        description: 'Official guidance on student finance, bursaries, and managing money at uni.',
        href: 'https://www.ucas.com/finance',
    },
    {
        icon: PiLifebuoy,
        iconColor: '#e06470',
        title: 'Turn2us — Benefits Calculator',
        description: 'Check if you\'re missing out on any grants, benefits, or financial support.',
        href: 'https://www.turn2us.org.uk/',
    },
    {
        icon: PiHeart,
        iconColor: '#e06470',
        title: 'StepChange — Debt Advice',
        description: 'Free, confidential debt advice if you\'re worried about money.',
        href: 'https://www.stepchange.org/',
    },
]

export default function MoneyAdviceScreen() {
    const university = getUniversity()
    const isBristol = university === 'University of Bristol'
    const [situation, setSituation] = useState(() => {
        const saved = localStorage.getItem('budgeup_financial_situation')
        return saved ? parseInt(saved, 10) : 3
    })
    const [newsletterOn, setNewsletterOn] = useState(() => localStorage.getItem('budgeup_newsletter') !== 'false')
    const [newsletterLoading, setNewsletterLoading] = useState(false)
    const userIdRef = useRef(null)

    useEffect(() => {
        analytics.track(MONEY_ADVICE_EVENTS.VIEWED)
        supabase.auth.getUser().then(async ({ data }) => {
            if (!data?.user) return
            userIdRef.current = data.user.id
            // Load saved financial situation from Supabase
            const { data: profile } = await supabase.from('user_profiles')
                .select('financial_situation')
                .eq('id', data.user.id)
                .maybeSingle()
            if (profile?.financial_situation != null) {
                setSituation(profile.financial_situation)
                localStorage.setItem('budgeup_financial_situation', String(profile.financial_situation))
            }
        })
    }, [])

    const handleSituationChange = async (value) => {
        setSituation(value)
        localStorage.setItem('budgeup_financial_situation', String(value))
        if (userIdRef.current) {
            await supabase.from('user_profiles')
                .update({ financial_situation: value })
                .eq('id', userIdRef.current)
        }
    }

    const handleNewsletterToggle = async () => {
        if (newsletterLoading || !userIdRef.current) return
        const newVal = !newsletterOn
        setNewsletterOn(newVal)
        localStorage.setItem('budgeup_newsletter', String(newVal))
        setNewsletterLoading(true)
        try {
            const { data: existing } = await supabase.from('user_consents')
                .select('id')
                .eq('user_id', userIdRef.current)
                .eq('scope', 'newsletter')
                .limit(1)
                .maybeSingle()
            if (newVal) {
                if (existing) {
                    await supabase.from('user_consents')
                        .update({ revoked_at: null, granted_at: new Date().toISOString() })
                        .eq('id', existing.id)
                } else {
                    await supabase.from('user_consents').insert({
                        user_id: userIdRef.current,
                        provider: 'budgeup',
                        scope: 'newsletter',
                        policy_version: 'v1',
                        granted_at: new Date().toISOString(),
                    })
                }
            } else {
                if (existing) {
                    await supabase.from('user_consents')
                        .update({ revoked_at: new Date().toISOString() })
                        .eq('id', existing.id)
                }
            }
        } catch { /* ignore */ }
        finally { setNewsletterLoading(false) }
    }

    const bristolResources = isBristol ? getBristolResources(situation) : []
    const currentLabel = SITUATION_LABELS.find(s => s.value === situation)

    return (
        <div style={{
            height: '100%', display: 'flex', flexDirection: 'column',
            background: '#fff',
        }}>
            {/* Header */}
            <div style={{
                paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
                padding: 'calc(env(safe-area-inset-top, 0px) + 16px) 20px 12px',
                background: '#fff',
            }}>
                <h1 style={{
                    fontSize: 24, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
                    color: '#1a1a1a', margin: 0,
                }}>Resources</h1>
            </div>

            {/* Scrollable content */}
            <div style={{
                flex: 1, overflowY: 'auto', overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                padding: '0 16px',
                paddingBottom: 'calc(150px + env(safe-area-inset-bottom, 0px))',
            }}>
                {/* Financial situation picker — Bristol only */}
                {isBristol && (
                    <div style={{
                        background: '#f0f4f4', borderRadius: 14, padding: '18px 18px 14px',
                        marginBottom: 12,
                    }}>
                        <p style={{
                            fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                            color: '#1a1a1a', margin: '0 0 4px',
                        }}>How's your financial situation?</p>
                        <p style={{
                            fontSize: 12, fontWeight: 500, fontFamily: 'Nunito, sans-serif',
                            color: '#999', margin: '0 0 14px',
                        }}>We'll show the most relevant resources first.</p>

                        {/* Mood face picker */}
                        <div style={{
                            display: 'flex', alignItems: 'center',
                            background: '#fff', borderRadius: 50,
                            padding: 4, position: 'relative',
                            height: 52,
                        }}>
                            {SITUATION_LABELS.map(s => {
                                const isActive = situation === s.value
                                return (
                                    <button
                                        key={s.value}
                                        onClick={() => handleSituationChange(s.value)}
                                        style={{
                                            flex: 1, border: 'none', cursor: 'pointer',
                                            background: 'none', padding: 0, margin: 0,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            position: 'relative', zIndex: isActive ? 2 : 1,
                                            height: '100%',
                                        }}
                                    >
                                        <div style={{
                                            width: isActive ? 56 : 30,
                                            height: isActive ? 56 : 30,
                                            borderRadius: '50%',
                                            background: isActive ? s.color : 'transparent',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            transition: isActive
                                                ? 'width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), height 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease, box-shadow 0.3s ease'
                                                : 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1), height 0.25s cubic-bezier(0.4, 0, 0.2, 1), background 0.15s ease, box-shadow 0.2s ease',
                                            boxShadow: isActive ? `0 4px 16px ${s.color}55` : 'none',
                                        }}>
                                            <div style={{
                                                transition: isActive
                                                    ? 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease'
                                                    : 'transform 0.2s ease, opacity 0.15s ease',
                                                transform: isActive ? 'scale(1)' : 'scale(0.9)',
                                                opacity: isActive ? 1 : 0.8,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <MoodFace mood={s.value} size={isActive ? 42 : 32} active={isActive} />
                                            </div>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                        <div style={{ display: 'flex', position: 'relative', height: 20, marginTop: 12, padding: '0 4px' }}>
                            <div style={{
                                position: 'absolute', top: 0,
                                left: `clamp(0%, ${(situation - 1) * 20 + 10}% , calc(100% - 30px))`,
                                transform: 'translateX(-50%)',
                                transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                whiteSpace: 'nowrap',
                                display: 'flex', justifyContent: 'center',
                            }}>
                                <span style={{
                                    fontSize: 12, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                                    color: currentLabel.color,
                                    transition: 'color 0.2s ease',
                                }}>
                                    {currentLabel.label}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* University-specific resources */}
                {isBristol && (
                    <>
                        <p style={{
                            fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                            color: '#1a1a1a',
                            padding: '0 6px', marginBottom: 8, marginTop: 4,
                        }}>
                            {university} Support
                        </p>

                        {situation <= 2 && (
                            <div style={{
                                background: '#fdf0f1', borderRadius: 14, padding: '14px 18px',
                                marginBottom: 12, border: '1px solid #f0c4c8',
                            }}>
                                <p style={{
                                    fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                                    color: '#c0392b', margin: '0 0 4px',
                                }}>
                                    The university has emergency support for students in your exact situation.
                                </p>
                                <p style={{
                                    fontSize: 12, fontWeight: 500, fontFamily: 'Nunito, sans-serif',
                                    color: '#b03a2e', margin: 0, lineHeight: 1.4,
                                }}>
                                    It's for everyone — home and international, from those really struggling to those caught out by how confusing student money is.
                                </p>
                            </div>
                        )}

                        {bristolResources.map((r, i) => (
                            <ResourceCard key={i} {...r} />
                        ))}
                    </>
                )}

                {/* Generic resources for all students */}
                <p style={{
                    fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                    color: '#1a1a1a',
                    padding: '0 6px', marginBottom: 8, marginTop: isBristol ? 16 : 4,
                }}>
                    General Resources
                </p>

                {GENERIC_RESOURCES.map((r, i) => (
                    <ResourceCard key={`gen-${i}`} {...r} />
                ))}

                {/* Newsletter signup */}
                <div style={{
                    background: '#f0f4f4', borderRadius: 14, padding: '16px 18px',
                    marginTop: 16, marginBottom: 12,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: '#147b7512',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <Mail size={18} color="#147b75" />
                        </div>
                        <div style={{ flex: 1 }}>
                            <p style={{
                                fontSize: 14, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                                color: '#1a1a1a', margin: '0 0 2px',
                            }}>Stay in the loop</p>
                            <p style={{
                                fontSize: 12, fontWeight: 500, fontFamily: 'Nunito, sans-serif',
                                color: '#999', margin: 0,
                            }}>Behind-the-scenes updates & tips</p>
                        </div>
                        <Toggle on={newsletterOn} onChange={handleNewsletterToggle} loading={newsletterLoading} />
                    </div>
                </div>

                {/* Disclaimer */}
                <p style={{
                    fontSize: 10, fontWeight: 500, fontFamily: 'Nunito, sans-serif',
                    color: '#bbb', padding: '0 6px', lineHeight: 1.5, margin: '8px 0 0',
                }}>
                    Budge Up is not a financial advisor. Do not make rash decisions based on this app. Budge Up only provides information summaries based on inputs you enter, and an informational list of resources that one could use to seek support or advice.
                </p>
            </div>
        </div>
    )
}
