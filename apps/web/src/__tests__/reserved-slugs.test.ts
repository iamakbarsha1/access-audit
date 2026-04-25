import { describe, it, expect } from "vitest";
import { RESERVED_SLUGS, isReservedSlug } from "@/lib/reserved-slugs";

describe("RESERVED_SLUGS", () => {
  it("contains exactly 19 reserved slugs", () => {
    expect(RESERVED_SLUGS.size).toBe(19);
  });

  const expectedSlugs = [
    "www", "api", "app", "admin", "mail", "smtp", "ftp", "status", "blog",
    "docs", "help", "support", "cdn", "static", "assets", "staging", "dev",
    "test", "demo",
  ];

  it.each(expectedSlugs)("contains reserved slug '%s'", (slug) => {
    expect(RESERVED_SLUGS.has(slug)).toBe(true);
  });
});

describe("isReservedSlug", () => {
  describe("recognizes all reserved slugs", () => {
    const allSlugs = [
      "www", "api", "app", "admin", "mail", "smtp", "ftp", "status", "blog",
      "docs", "help", "support", "cdn", "static", "assets", "staging", "dev",
      "test", "demo",
    ];

    it.each(allSlugs)("returns true for '%s'", (slug) => {
      expect(isReservedSlug(slug)).toBe(true);
    });
  });

  describe("case insensitivity", () => {
    it("returns true for 'WWW' (all uppercase)", () => {
      expect(isReservedSlug("WWW")).toBe(true);
    });

    it("returns true for 'Api' (mixed case)", () => {
      expect(isReservedSlug("Api")).toBe(true);
    });

    it("returns true for 'ADMIN' (all uppercase)", () => {
      expect(isReservedSlug("ADMIN")).toBe(true);
    });

    it("returns true for 'StAtUs' (alternating case)", () => {
      expect(isReservedSlug("StAtUs")).toBe(true);
    });

    it("returns true for 'Blog' (capitalized)", () => {
      expect(isReservedSlug("Blog")).toBe(true);
    });
  });

  describe("non-reserved slugs return false", () => {
    it("returns false for 'my-agency'", () => {
      expect(isReservedSlug("my-agency")).toBe(false);
    });

    it("returns false for 'acme-corp'", () => {
      expect(isReservedSlug("acme-corp")).toBe(false);
    });

    it("returns false for 'dashboard'", () => {
      expect(isReservedSlug("dashboard")).toBe(false);
    });

    it("returns false for 'hello'", () => {
      expect(isReservedSlug("hello")).toBe(false);
    });

    it("returns false for 'testing' (superstring of reserved 'test')", () => {
      expect(isReservedSlug("testing")).toBe(false);
    });

    it("returns false for 'development' (superstring of reserved 'dev')", () => {
      expect(isReservedSlug("development")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns false for empty string", () => {
      expect(isReservedSlug("")).toBe(false);
    });

    it("returns false for slug with special characters", () => {
      expect(isReservedSlug("www!")).toBe(false);
    });

    it("returns false for slug with spaces", () => {
      expect(isReservedSlug("api ")).toBe(false);
    });

    it("returns false for slug with hyphens wrapping reserved word", () => {
      expect(isReservedSlug("-admin-")).toBe(false);
    });

    it("returns false for slug with numbers", () => {
      expect(isReservedSlug("api123")).toBe(false);
    });

    it("returns false for slug with dots", () => {
      expect(isReservedSlug("www.com")).toBe(false);
    });
  });
});
