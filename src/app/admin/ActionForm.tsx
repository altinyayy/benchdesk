"use client";

import { useActionState } from "react";
import type { FormState } from "./actions";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

/** A form wired to a Server Action that shows its error or success message. */
export function ActionForm({
  action,
  submit,
  className,
  children,
}: {
  action: Action;
  submit: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className ?? "af"}>
      {children}
      <div className="af-foot">
        <button className="btn p sm" type="submit" disabled={pending}>
          {pending ? "Saving…" : submit}
        </button>
        {state.error && <span className="af-err" role="alert">{state.error}</span>}
        {state.ok && <span className="af-ok" role="status">{state.ok}</span>}
      </div>
    </form>
  );
}
