import './NativeSegmented.css'

export default function NativeSegmented({ value, onChange, options }) {
    return (
        <div className="native-segmented">
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    className={`native-segmented-option ${value === option.value ? 'active' : ''}`}
                    onClick={() => onChange(option.value)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    )
}
