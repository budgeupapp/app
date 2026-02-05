import { supabase } from '../supabaseClient'

export async function savePlannedCashflows(userId, data) {
  const rows = []

  if (data.debt) {
    rows.push({
      user_id: userId,
      type: 'debt',
      amount: data.debt.amount,
      currency: 'GBP',
      frequency: data.debt.frequency,
      start_date: data.debt.date,
      next_due: data.debt.date,
      source: 'manual',
      description: 'Debt / credit'
    })
  }

  if (data.rentBills) {
    rows.push({
      user_id: userId,
      type: 'bill',
      amount: data.rentBills.amount,
      currency: 'GBP',
      frequency: data.rentBills.frequency,
      start_date: data.rentBills.date,
      next_due: data.rentBills.date,
      source: 'manual',
      description: 'Rent or bills'
    })
  }

  if (data.income) {
    rows.push({
      user_id: userId,
      type: 'income',
      amount: data.income.amount,
      currency: 'GBP',
      frequency: data.income.frequency,
      start_date: data.income.date,
      next_due: data.income.date,
      source: 'manual',
      description: 'Expected income'
    })
  }

  if (data.surprise) {
    rows.push({
      user_id: userId,
      type: 'other',
      amount: data.surprise.amount,
      currency: 'GBP',
      frequency: data.surprise.frequency,
      start_date: data.surprise.date,
      next_due: data.surprise.date,
      source: 'manual',
      description: 'Unexpected expense'
    })
  }

  if (!rows.length) return

  const { error } = await supabase
    .from('planned_cashflows')
    .insert(rows)

  if (error) throw error
}