export const CATEGORY_PURPOSES = [
  { value: "spend", label: "Spend", description: "Everyday spending", className: "purpose-spend" },
  { value: "save_grow", label: "Save/Grow", description: "Saving and investing", className: "purpose-save-grow" },
  { value: "move", label: "Move", description: "Transfers between accounts", className: "purpose-move" },
  { value: "give", label: "Give", description: "Charity and gifts", className: "purpose-give" },
] as const;

export type CategoryPurpose = (typeof CATEGORY_PURPOSES)[number]["value"] | "ignore";

export function normalizeCategoryPurpose(value: unknown): CategoryPurpose {
  if (value === "ignore") {
    return "ignore";
  }

  return CATEGORY_PURPOSES.some((purpose) => purpose.value === value)
    ? (value as CategoryPurpose)
    : "spend";
}

export function isIgnoredCategoryPurpose(value: unknown): boolean {
  return normalizeCategoryPurpose(value) === "ignore";
}
