import IncomeExpenseCard from '../components/IncomeExpenseCard'
import { CATEGORY_MAP } from '../config/categories'

/**
 * Generic step component for any income/expense category.
 * Looks up config from categories.js and renders IncomeExpenseCard.
 */
export default function CategoryStep({ categoryId, entries = [], updateEntries, compact = false }) {
    const cat = CATEGORY_MAP[categoryId]
    if (!cat) return null

    const isExpense = !![
        'uni_fees', 'rent', 'bills', 'phone_subscriptions', 'holiday_trips',
        'savings_goals', 'predictable_travel', 'big_gifts', 'rental_deposit',
        'insurance', 'sending_money_home', 'council_tax', 'loan_repayment',
        'graduation', 'other_expense',
    ].includes(categoryId)

    return (
        <IncomeExpenseCard
            entries={entries}
            updateEntries={updateEntries}
            subtitle={cat.subtitle}
            entryLabel={cat.entryLabel}
            addLabel={cat.addLabel}
            frequencyOptions={cat.frequencyOptions}
            defaultFrequency={cat.defaultFrequency}
            defaultMonths={cat.defaultMonths}
            defaultDates={cat.defaultDates}
            isExpense={isExpense}
            icon={cat.Icon}
            iconColor={cat.color}
            nameEditable={!!cat.nameEditable}
            compact={compact}
            frequencyLabels={cat.frequencyLabels}
        />
    )
}
