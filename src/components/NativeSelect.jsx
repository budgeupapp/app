import './NativeSelect.css'

export default function NativeSelect({
    value,
    onChange,
    options,
    placeholder,
    label,
    style,
    required = false,
    disabled = false
}) {
    return (
        <div className="native-select-wrapper" style={style}>
            {label && (
                <label className="native-select-label">
                    {label}
                </label>
            )}
            <div className="native-select-container">
                <select
                    className="native-select"
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
                    {options.map((option) => (
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
