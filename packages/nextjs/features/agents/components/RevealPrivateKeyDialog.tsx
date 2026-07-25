"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Stepper } from "@/components/ui/Stepper";
import { revealAgentPrivateKey } from "@/lib/api/agents";
import type { AgentDetail, KeyExportResult } from "@/lib/types/aegis";
import { KeyRound, Loader2, ShieldOff, TriangleAlert } from "lucide-react";

const STEPS = ["Risk", "Verify", "Confirm"];

/**
 * Irreversible key export. Three gates on purpose: acknowledge the consequence,
 * pass a 2FA challenge, then re-type the agent name.
 *
 * TODO(2FA): the code field is a placeholder shell. Wire it to the real
 * authenticator/WebAuthn challenge when the backend exposes it — only the
 * `code`/`codeValid` bits and `revealAgentPrivateKey` need to change.
 */
export function RevealPrivateKeyDialog({
  open,
  agent,
  onClose,
}: {
  open: boolean;
  agent: AgentDetail;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);
  const [code, setCode] = useState("");
  const [typedName, setTypedName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<KeyExportResult | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setStep(0);
      setAcknowledged(false);
      setCode("");
      setTypedName("");
      setSubmitting(false);
      setResult(null);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const codeValid = /^\d{6}$/.test(code);
  const nameValid = typedName.trim() === agent.name;

  async function submit() {
    setSubmitting(true);
    setResult(await revealAgentPrivateKey(agent.id, code));
    setSubmitting(false);
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={e => {
        if (e.target === dialogRef.current) onClose();
      }}
      className="m-auto w-[min(560px,calc(100vw-32px))] rounded-xl bg-surface-raised p-8 text-foreground shadow-xl backdrop:bg-foreground/25 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-soft">
          <KeyRound className="h-5 w-5 text-danger" />
        </span>
        <div>
          <h2 className="text-h3">Reveal the AEGIS private key</h2>
          <p className="mt-1 text-body-sm text-muted">
            {agent.name} · <span className="font-mono text-mono-sm">{agent.id}</span>
          </p>
        </div>
      </div>

      {result === null ? (
        <>
          <div className="mt-6">
            <Stepper steps={STEPS} current={step} />
          </div>

          {step === 0 && (
            <div className="mt-6">
              <div className="rounded-md border border-danger/25 bg-danger-soft/40 p-4">
                <p className="flex items-center gap-2 text-body-sm font-semibold text-danger">
                  <TriangleAlert className="h-4 w-4 shrink-0" />
                  This permanently retires {agent.name} from AEGIS.
                </p>
                <ul className="mt-3 space-y-1.5 text-body-sm text-muted">
                  <li>· Whoever holds the key can sign for the agent without any policy check.</li>
                  <li>· The AEGIS co-signature is revoked, so the 2-of-3 gate no longer protects this wallet.</li>
                  <li>· {agent.name} stops being able to operate through AEGIS — you must register a new agent.</li>
                  <li>· The key is shown once and cannot be re-issued.</li>
                </ul>
              </div>
              <label className="mt-5 flex cursor-pointer items-start gap-3 text-body-sm">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={e => setAcknowledged(e.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-danger)]"
                />
                <span>
                  I understand this is irreversible and that {agent.name} will be unavailable on AEGIS afterwards.
                </span>
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="mt-6">
              <label className="block text-label text-muted" htmlFor="reveal-2fa">
                Verification code
              </label>
              <input
                id="reveal-2fa"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                className="mt-2 h-12 w-full rounded-md border border-border bg-surface px-4 text-center font-mono text-mono-md tracking-[0.5em] outline-none transition-colors duration-[120ms] focus:border-brand"
              />
              <p className="mt-2 text-caption text-subtle">
                Placeholder for the authenticator challenge — any 6 digits pass until 2FA is wired.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="mt-6">
              <label className="block text-label text-muted" htmlFor="reveal-confirm-name">
                Type <span className="font-mono text-mono-sm text-foreground">{agent.name}</span> to confirm
              </label>
              <input
                id="reveal-confirm-name"
                value={typedName}
                onChange={e => setTypedName(e.target.value)}
                autoComplete="off"
                className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-4 font-mono text-mono-sm outline-none transition-colors duration-[120ms] focus:border-brand"
              />
            </div>
          )}

          <div className="mt-8 flex justify-end gap-3">
            <Button variant="secondary" onClick={step === 0 ? onClose : () => setStep(step - 1)}>
              {step === 0 ? "Cancel" : "Back"}
            </Button>
            {step < 2 ? (
              <Button onClick={() => setStep(step + 1)} disabled={step === 0 ? !acknowledged : !codeValid}>
                Continue
              </Button>
            ) : (
              <Button variant="destructive" onClick={submit} disabled={!nameValid || submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Reveal key & retire agent
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="mt-6">
          {result.status === "revealed" ? (
            <>
              <p className="text-body-sm text-muted">
                Copy it now — it is not stored and will not be shown again. {agent.name} no longer operates through
                AEGIS.
              </p>
              <p className="mt-3 break-all rounded-md border border-danger/25 bg-danger-soft/40 p-4 font-mono text-mono-sm">
                {result.privateKey}
              </p>
            </>
          ) : (
            <p
              className={
                result.status === "rejected"
                  ? "rounded-md bg-danger-soft px-4 py-3 text-body-sm text-danger"
                  : "rounded-md bg-info-soft px-4 py-3 text-body-sm text-info"
              }
            >
              {result.message}
            </p>
          )}
          <div className="mt-8 flex justify-end gap-3">
            {result.status === "rejected" && (
              <Button variant="secondary" onClick={() => setResult(null)}>
                Try again
              </Button>
            )}
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      )}

      <p className="mt-6 flex items-center gap-2 border-t border-border pt-4 text-caption text-subtle">
        <ShieldOff className="h-3.5 w-3.5 shrink-0" />
        AEGIS never stores this key in the dashboard. Nothing leaves your browser until the export endpoint is live.
      </p>
    </dialog>
  );
}
