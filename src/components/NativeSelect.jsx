import './NativeSelect.css'
import { Typography } from 'antd'


export default function NativeSelect({
    value,
    onChange,
    options,
    placeholder,
    label,
    containerStyle,
    style,
    required = false,
    disabled = false,
}) {
    // Normalize options to {value, label} format
    const normalizedOptions = options.map(option => {
        if (typeof option === 'string') {
            return { value: option, label: option }
        }
        return option
    })

    const { Title, Text } = Typography

    return (
        <div className="native-select-wrapper" style={containerStyle}>
            {label && (
                <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
                    {label}
                </Text>
            )}
            <div className="native-select-container">
                <select
                    className="native-select"
                    style={style}
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    required={required}
                    disabled={disabled}
                >
                    {placeholder && (
                        <option value="" disabled>
                            {placeholder}
                        </option>
                    )}
                    {normalizedOptions.map((option) => (
                        <option
                            key={option.value}
                            value={option.value}
                        >
                            {option.label}
                        </option>
                    ))}
                </select>
                <div className="native-select-arrow">
                    <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
                        <path
                            d="M1 1.5L6 6.5L11 1.5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </div>
            </div>
        </div>
    )
}
