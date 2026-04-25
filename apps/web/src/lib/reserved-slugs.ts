// Slugs that cannot be used as org slugs because they conflict
// with infrastructure subdomains or reserved names.
export const RESERVED_SLUGS = new Set([
  "www",
  "api",
  "app",
  "admin",
  "mail",
  "smtp",
  "ftp",
  "status",
  "blog",
  "docs",
  "help",
  "support",
  "cdn",
  "static",
  "assets",
  "staging",
  "dev",
  "test",
  "demo",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}
