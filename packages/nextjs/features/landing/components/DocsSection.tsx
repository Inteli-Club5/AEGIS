const DOCS_URL = "https://github.com/Inteli-Club5/AEGIS";

export function DocsSection() {
  return (
    <section id="docs" className="py-24 lg:py-32">
      <div className="mx-auto w-full max-w-[1200px] px-6 text-center">
        <p className="font-mono text-overline uppercase text-brand-strong">Documentation</p>
        <h2 className="mx-auto mt-4 max-w-[28ch] text-h2">Access our solution docs</h2>
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-8 inline-flex h-12 items-center justify-center rounded-md bg-brand px-6 text-body font-semibold text-foreground shadow-sm transition-colors duration-[120ms] hover:bg-[color-mix(in_srgb,var(--color-brand),var(--color-brand-strong)_18%)] hover:shadow-md"
        >
          Open docs
        </a>
      </div>
    </section>
  );
}
