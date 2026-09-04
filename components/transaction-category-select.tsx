"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type CategoryOption = {
  id: string;
  name: string;
  category_type: string;
};

export function TransactionCategorySelect({
  transactionId,
  amountCents,
  categoryId,
  description,
  categories,
}: {
  transactionId: string;
  amountCents: number;
  categoryId: string | null;
  description: string;
  categories: CategoryOption[];
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState(categoryId ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const categoryType = amountCents < 0 ? "expense" : "income";
  const compatibleCategories = categories.filter((category) => category.category_type === categoryType);

  async function handleChange(nextCategoryId: string) {
    const previousCategoryId = selectedCategoryId;
    setSelectedCategoryId(nextCategoryId);
    setErrorMessage(null);
    setIsSaving(true);

    const { error } = await createClient()
      .from("transactions")
      .update({ category_id: nextCategoryId || null })
      .eq("id", transactionId);

    if (error) {
      setSelectedCategoryId(previousCategoryId);
      setErrorMessage("Could not save");
    }

    setIsSaving(false);
  }

  return (
    <div className="ledger-category-control">
      <label>
        <span className="sr-only">Category for {description}</span>
        <select
          aria-label={`Category for ${description}`}
          value={selectedCategoryId}
          disabled={isSaving}
          onChange={(event) => void handleChange(event.target.value)}
        >
          <option value="">Uncategorized</option>
          {compatibleCategories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
      </label>
      {errorMessage ? <span className="ledger-category-error" role="status">{errorMessage}</span> : null}
    </div>
  );
}
