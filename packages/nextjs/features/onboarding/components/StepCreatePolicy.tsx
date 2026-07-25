"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { createPolicy } from "@/lib/api/onboarding";
import type { AgentProfile, PolicyRecord } from "@/lib/types/aegis";
import { ArrowLeft, Loader2 } from "lucide-react";

const POLICY_FIELDS: Array<{
  key: string;
  label: string;
  type: "text" | "number" | "select" | "textarea";
  placeholder?: string;
  options?: string[];
}> = [
  {
    key: "field1",
    label: "Lorem ipsum dolor",
    type: "text",
    placeholder: "Sit amet consectetur",
  },
  {
    key: "field2",
    label: "Adipiscing elit sed",
    type: "text",
    placeholder: "Do eiusmod tempor incididunt",
  },
  {
    key: "field3",
    label: "Ut labore et dolore",
    type: "select",
    options: ["Magna aliqua", "Enim ad minim veniam", "Quis nostrud exercitation", "Ullamco laboris nisi"],
  },
  {
    key: "field4",
    label: "Laboris nisi ut aliquip",
    type: "number",
    placeholder: "42",
  },
  {
    key: "field5",
    label: "Ex ea commodo consequat",
    type: "textarea",
    placeholder: "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore.",
  },
];

const inputClass =
  "mt-2 h-10 w-full rounded-md border border-border bg-surface-raised px-3 text-body-sm outline-none transition-colors duration-[120ms] focus:border-brand";

export function StepCreatePolicy({
  agent,
  initial,
  onBack,
  onCreated,
}: {
  agent: AgentProfile;
  initial?: PolicyRecord;
  onBack: () => void;
  onCreated: (policy: PolicyRecord) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(initial?.fields ?? {});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setValue(key: string, value: string) {
    setValues(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const created = await createPolicy(agent.id, values);
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creating policy failed. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <section className="rounded-lg bg-surface p-6 shadow-md">
        <h2 className="text-h4">
          Policy for <span className="text-brand-strong">{agent.name}</span>
        </h2>
        <p className="mt-1 text-body-sm text-muted">
          Placeholder form — the real policy schema is still being defined with the backend team. These fields exist to
          give the wizard shape; they’ll be replaced once the spec lands.
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {POLICY_FIELDS.map(field => (
            <div key={field.key} className={field.type === "textarea" ? "sm:col-span-2" : undefined}>
              <label htmlFor={field.key} className="text-label">
                {field.label}
              </label>
              {field.type === "select" ? (
                <select
                  id={field.key}
                  value={values[field.key] ?? ""}
                  onChange={e => setValue(field.key, e.target.value)}
                  className={inputClass}
                >
                  <option value="" disabled>
                    Select an option
                  </option>
                  {field.options?.map(opt => (
                    <option key={opt}>{opt}</option>
                  ))}
                </select>
              ) : field.type === "textarea" ? (
                <textarea
                  id={field.key}
                  value={values[field.key] ?? ""}
                  onChange={e => setValue(field.key, e.target.value)}
                  rows={3}
                  placeholder={field.placeholder}
                  className="mt-2 w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-body-sm outline-none transition-colors duration-[120ms] focus:border-brand"
                />
              ) : (
                <input
                  id={field.key}
                  type={field.type}
                  value={values[field.key] ?? ""}
                  onChange={e => setValue(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className={inputClass}
                />
              )}
            </div>
          ))}
        </div>

        {error && <p className="mt-5 rounded-md bg-danger-soft px-4 py-3 text-body-sm text-danger">{error}</p>}
      </section>

      <div className="mt-6 flex items-center justify-between gap-4">
        <Button type="button" variant="secondary" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <span className="flex items-center gap-4">
          {submitting && (
            <span role="status" className="flex items-center gap-2 font-mono text-mono-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Registering policy…
            </span>
          )}
          <Button type="submit" disabled={submitting}>
            Create policy
          </Button>
        </span>
      </div>
    </form>
  );
}
