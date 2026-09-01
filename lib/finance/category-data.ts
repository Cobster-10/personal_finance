export const CATEGORY_PURPOSES = [
  { value: "spend", label: "Spend", description: "Everyday spending", className: "purpose-spend" },
  { value: "save_grow", label: "Save/Grow", description: "Saving and investing", className: "purpose-save-grow" },
  { value: "move", label: "Move", description: "Transfers between accounts", className: "purpose-move" },
  { value: "give", label: "Give", description: "Charity and gifts", className: "purpose-give" },
] as const;

export type CategoryPurpose = (typeof CATEGORY_PURPOSES)[number]["value"];

export function normalizeCategoryPurpose(value: unknown): CategoryPurpose {
  return CATEGORY_PURPOSES.some((purpose) => purpose.value === value)
    ? (value as CategoryPurpose)
    : "spend";
}
