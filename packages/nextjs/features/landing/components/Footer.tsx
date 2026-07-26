import { LogoWordmark } from "@/components/ui/LogoMark";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "#flow" },
      { label: "Docs", href: "#docs" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Architecture", href: "#flow" },
      { label: "Audit log", href: "#flow" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface/40">
      <div className="mx-auto w-full max-w-[1200px] px-6 py-14">
        <div className="flex flex-col justify-between gap-10 md:flex-row">
          <div className="max-w-[36ch]">
            <LogoWordmark />
            <p className="mt-4 text-body-sm text-muted">
              A safety layer for agents that move value — protected Safe wallets, verified decisions, co‑signed
              execution.
            </p>
          </div>
          <div className="flex gap-16">
            {COLUMNS.map(column => (
              <nav key={column.title} aria-label={column.title}>
                <p className="font-mono text-overline uppercase text-subtle">{column.title}</p>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map(link => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-body-sm text-muted transition-colors duration-[120ms] hover:text-brand-strong"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>
        <div className="mt-12 border-t border-border pt-6">
          <p className="text-caption text-subtle">
            AEGIS prevents unauthorized or non‑compliant execution. It does not insure, compensate or remediate
            counterparty failures.
          </p>
          <p className="mt-2 font-mono text-mono-sm text-subtle">© 2026 AEGIS · Hedera testnet demo</p>
        </div>
      </div>
    </footer>
  );
}
