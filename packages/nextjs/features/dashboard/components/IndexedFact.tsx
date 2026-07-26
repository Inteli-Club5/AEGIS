"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

export function IndexedFact({ label, value, href }: { label: string; value: string; href?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div>
      <dt className="text-label text-muted">{label}</dt>
      <dd className="mt-1 flex min-w-0 items-start gap-2 font-mono text-mono-sm">
        {href ? (
          <a
            className="min-w-0 break-all text-brand-strong underline-offset-4 hover:underline"
            href={href}
            target="_blank"
            rel="noreferrer"
          >
            {value}
            <ExternalLink className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" />
          </a>
        ) : (
          <span className="min-w-0 break-all">{value}</span>
        )}
        <button
          type="button"
          className="mt-0.5 shrink-0 text-subtle transition-colors hover:text-brand-strong"
          aria-label={`Copy ${label}`}
          title={`Copy ${label}`}
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1_500);
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </dd>
    </div>
  );
}
