import { useEffect, useState } from 'react'

export default function ScrollProgress({ scrollRef }) {
    const [progress, setProgress] = useState(0)

    useEffect(() => {
        if (!scrollRef?.current) return

        const el = scrollRef.current

        const handleScroll = () => {
            const scrollTop = el.scrollTop
            const scrollHeight = el.scrollHeight - el.clientHeight

            if (scrollHeight <= 0) {
                setProgress(0)
                return
            }

            const scrolled = (scrollTop / scrollHeight) * 100
            setProgress(Math.min(100, Math.max(0, scrolled)))
        }

        el.addEventListener('scroll', handleScroll)
        handleScroll()

        return () => el.removeEventListener('scroll', handleScroll)
    }, [scrollRef])

    return (
        <div
            style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                background: '#ffffff',
                padding: '16px 0',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '101%'
            }}
        >
            <img src="/logo.svg" alt="" style={{ height: 32 }} />

            <div
                style={{
                    flex: 1,
                    height: 8,
                    background: '#FBE7CF',
                    borderRadius: 999,
                    overflow: 'hidden'
                }}
            >
                <div
                    style={{
                        height: '100%',
                        width: `${progress}%`,
                        background: '#EC8C17',
                        borderRadius: 999,
                        transition: 'width 0.15s ease-out'
                    }}
                />
            </div>
        </div>
    )
}