import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center bg-background px-6 py-24">
      <div className="text-center">
        <h1 className="text-display font-extrabold text-foreground">404</h1>
        <h2 className="mt-2 text-h2 text-foreground">Page not found</h2>
        <p className="mt-2 text-body-sm text-muted">The page you&apos;re looking for doesn&apos;t exist.</p>
        <Link
          href="/"
          className="mt-8 inline-flex h-10 items-center justify-center rounded-md bg-brand px-5 text-body-sm font-semibold text-foreground shadow-md transition-colors duration-[120ms] hover:bg-[color-mix(in_srgb,var(--color-brand),var(--color-brand-strong)_18%)] hover:shadow-lg"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
