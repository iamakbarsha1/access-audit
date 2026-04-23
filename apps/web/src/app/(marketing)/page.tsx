export default function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
        ADA Accessibility
        <br />
        <span className="text-primary">Made Simple</span>
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
        Scan websites for WCAG violations, get AI-powered fix suggestions, and
        generate branded compliance reports for your clients.
      </p>
      <div className="mt-10 flex gap-4">
        <a
          href="/signup"
          className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Start Free Trial
        </a>
        <a
          href="#features"
          className="rounded-md border px-6 py-3 text-sm font-semibold hover:bg-muted"
        >
          Learn More
        </a>
      </div>
    </main>
  );
}
