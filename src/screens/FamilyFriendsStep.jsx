import IncomeExpenseCard from '../components/IncomeExpenseCard'

export default function FamilyFriendsStep({
    entries = [],
    updateEntries,
    compact = false,
    heading = 'Family & Friends',
    subtitle = 'Regular money from parents, family, or friends.',
    children,
}) {
    return (
        <IncomeExpenseCard
            entries={entries}
            updateEntries={updateEntries}
            subtitle={subtitle}
            entryLabel="Payment"
            addLabel="Add another payment"
            frequencyOptions={['weekly', 'monthly', 'yearly', 'irregular']}
            defaultFrequency="monthly"
            defaultMonths={[]}
            defaultDates={{}}
            isExpense={false}
        />
    )
}
