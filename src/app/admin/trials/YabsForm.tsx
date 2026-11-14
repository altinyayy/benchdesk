"use client";

import { useActionState, useState } from "react";
import { addYabsResult, type FormState } from "../actions";

type Choice = {
  id: number;
  name: string;
  plans: { id: number; name: string; priceUsd: number; vcpu: number }[];
  locations: { id: number; city: string; country: string }[];
};

/**
 * Inputs are controlled so a failed save doesn't wipe the pasted output
 * (React resets uncontrolled fields after every form action).
 */
export function YabsForm({ providers }: { providers: Choice[] }) {
  const [planId, setPlanId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [source, setSource] = useState("official");
  const [output, setOutput] = useState("");

  const [state, formAction, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const r = await addYabsResult(prev, fd);
    if (r.ok) setOutput("");
    return r;
  }, {});

  const providerOfPlan = providers.find((p) => p.plans.some((pl) => String(pl.id) === planId));
  const locs = providerOfPlan?.locations ?? [];

  return (
    <form action={formAction} className="af">
      <div className="grid2">
        <label>
          Plan
          <select
            name="planId"
            required
            value={planId}
            onChange={(e) => {
              setPlanId(e.target.value);
              setLocationId("");
            }}
          >
            <option value="">Choose a plan…</option>
            {providers
              .filter((p) => p.plans.length)
              .map((p) => (
                <optgroup key={p.id} label={p.name}>
                  {p.plans.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name} · {pl.vcpu} vCPU · ${pl.priceUsd.toFixed(2)}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
        </label>
        <label>
          Location
          <select name="locationId" value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={!locs.length}>
            <option value="">{locs.length ? "Not specified" : "No locations for this provider"}</option>
            {locs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.city}, {l.country}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="radios">
        <legend>Source</legend>
        <label className="check">
          <input type="radio" name="source" value="official" checked={source === "official"} onChange={() => setSource("official")} />
          Official: we ran it on a clean server (scored and ranked)
        </label>
        <label className="check">
          <input type="radio" name="source" value="community" checked={source === "community"} onChange={() => setSource("community")} />
          Community: someone else ran it (unverified, never ranked)
        </label>
      </fieldset>

      <label>
        yabs.sh output (text or JSON)
        <textarea
          name="output"
          required
          rows={14}
          spellCheck={false}
          value={output}
          onChange={(e) => setOutput(e.target.value)}
          placeholder={"# ## ## ## ## ## ## ## ## ## ## ## ## ## ## ## ## ## #\n#              Yet-Another-Bench-Script              #\n…"}
        />
      </label>

      <div className="af-foot">
        <button className="btn p sm" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save result"}
        </button>
        {state.error && (
          <span className="af-err" role="alert">
            {state.error}
          </span>
        )}
        {state.ok && (
          <span className="af-ok" role="status">
            {state.ok}
          </span>
        )}
      </div>
      {!!state.warnings?.length && (
        <ul className="af-warn" role="status">
          {state.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
