export default function StepProgress({ progress }) {
    return (
        <div
            style={{
                background: '#ffffff',
                padding: '16px 0',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%'
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
                        transition: 'width 0.3s ease-out'
                    }}
                />
            </div>
        </div>
    )
}
