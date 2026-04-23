export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="flex h-16 items-center justify-between border-b px-6">
        <span className="text-xl font-bold text-primary">AccessAudit</span>
        <nav className="flex items-center gap-4">
          <a
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Sign in
          </a>
          <a
            href="/signup"
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            Start Free Trial
          </a>
        </nav>
      </header>
      {children}
    </div>
  );
}
