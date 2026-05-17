"use client";

import { CheckCircle2 } from "lucide-react";
import { useFormStatus } from "react-dom";

/**
 * Issue #82 — bulk-confirm runs a `prisma.$transaction` per candidate
 * and during a large review batch ("Confirm all 47 high-confidence")
 * a double-click could submit the form twice in a row, racing two
 * transactions against the same set of candidates. The action itself
 * is family-scoped and idempotent (already-confirmed candidates are
 * filtered out by the action's `findMany`), but a no-op second pass
 * is confusing UX. Disable the button while React reports the form
 * as pending.
 */
export function BulkConfirmSubmit({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      aria-busy={pending}
      className="primaryButton"
      disabled={pending}
      type="submit"
    >
      <CheckCircle2 size={16} aria-hidden="true" />
      {pending
        ? `Confirming ${count}…`
        : `Confirm all (${count}) high-confidence`}
    </button>
  );
}
