import type { AgentProfile, PolicyRecord } from "@/lib/types/aegis";

export interface OnboardingDraft {
  step: number;
  agent?: AgentProfile;
  policy?: PolicyRecord;
}

const KEY = "aegis.onboarding-draft";
const listeners = new Set<() => void>();

let cachedRaw: string | null = null;
let cached: OnboardingDraft | null = null;

export function readDraft(): OnboardingDraft | null {
  const raw = localStorage.getItem(KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cached = raw ? (JSON.parse(raw) as OnboardingDraft) : null;
    } catch {
      cached = null;
    }
  }
  return cached;
}

export function readDraftServer(): OnboardingDraft | null | undefined {
  return undefined;
}

export function writeDraft(draft: OnboardingDraft) {
  localStorage.setItem(KEY, JSON.stringify(draft));
  cachedRaw = null;
  listeners.forEach(notify => notify());
}

export function clearDraft() {
  localStorage.removeItem(KEY);
  cachedRaw = null;
  listeners.forEach(notify => notify());
}

export function subscribeDraft(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}
