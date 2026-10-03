export type GiveCommitment = {
  carryoverFromPriorMonths: number;
  monthlyBudget: number;
  spent: number;
  target: number;
  remaining: number;
};

export type MonthlyGiveProgress = {
  month: string;
  budgetCents: number;
  spentCents: number;
};

export type GiveCommitmentCents = {
  carryoverFromPriorMonthsCents: number;
  monthlyBudgetCents: number;
  spentCents: number;
  targetCents: number;
  remainingCents: number;
};

/**
 * Carries an unfulfilled Giving plan forward. Amounts are kept in cents so
 * historical calculations do not accumulate floating point rounding errors.
 */
export function calculateGiveCommitmentCents(
  selectedMonth: string,
  monthlyProgress: MonthlyGiveProgress[],
): GiveCommitmentCents {
  const progressByMonth = new Map<string, { budgetCents: number; spentCents: number }>();

  for (const entry of monthlyProgress) {
    if (entry.month > selectedMonth) continue;
    const current = progressByMonth.get(entry.month) ?? { budgetCents: 0, spentCents: 0 };
    current.budgetCents += entry.budgetCents;
    current.spentCents += entry.spentCents;
    progressByMonth.set(entry.month, current);
  }

  if (!progressByMonth.has(selectedMonth)) {
    progressByMonth.set(selectedMonth, { budgetCents: 0, spentCents: 0 });
  }

  let carryoverCents = 0;
  for (const [month, progress] of [...progressByMonth.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const targetCents = carryoverCents + progress.budgetCents;
    const remainingCents = Math.max(0, targetCents - progress.spentCents);

    if (month === selectedMonth) {
      return {
        carryoverFromPriorMonthsCents: carryoverCents,
        monthlyBudgetCents: progress.budgetCents,
        spentCents: progress.spentCents,
        targetCents,
        remainingCents,
      };
    }

    carryoverCents = remainingCents;
  }

  return {
    carryoverFromPriorMonthsCents: 0,
    monthlyBudgetCents: 0,
    spentCents: 0,
    targetCents: 0,
    remainingCents: 0,
  };
}

export function toGiveCommitment(commitment: GiveCommitmentCents): GiveCommitment {
  return {
    carryoverFromPriorMonths: commitment.carryoverFromPriorMonthsCents / 100,
    monthlyBudget: commitment.monthlyBudgetCents / 100,
    spent: commitment.spentCents / 100,
    target: commitment.targetCents / 100,
    remaining: commitment.remainingCents / 100,
  };
}
