import type { StatsPeriod } from "@/lib/types/aegis";

const OPTIONS: Array<{ value: StatsPeriod; label: string }> = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: "all", label: "All time" },
];

export function PeriodFilter({ value, onChange }: { value: StatsPeriod; onChange: (period: StatsPeriod) => void }) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-label text-muted">Period</span>
      <select
        value={String(value)}
        onChange={e => {
          const raw = e.target.value;
          onChange(raw === "all" ? "all" : (Number(raw) as StatsPeriod));
        }}
        className="h-9 rounded-md border border-border bg-surface-raised px-3 text-body-sm outline-none transition-colors duration-[120ms] focus:border-brand"
      >
        {OPTIONS.map(opt => (
          <option key={String(opt.value)} value={String(opt.value)}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
