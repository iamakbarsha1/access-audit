import { describe, it, expect } from "vitest";
import { isReservedSlug, RESERVED_SLUGS } from "@/lib/reserved-slugs";

// Slug generation logic extracted from the onboarding page component
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

describe("onboarding slug generation", () => {
  describe("generateSlug", () => {
    it("converts to lowercase and hyphenates spaces", () => {
      expect(generateSlug("Acme Agency")).toBe("acme-agency");
    });

    it("removes special characters", () => {
      expect(generateSlug("My Agency!")).toBe("my-agency");
    });

    it("strips leading and trailing hyphens", () => {
      expect(generateSlug("-test-")).toBe("test");
    });

    it("handles non-Latin characters by removing them", () => {
      const result = generateSlug("شركة");
      expect(result).toBe("");
    });

    it("handles all-special-chars input", () => {
      expect(generateSlug("!!!@@@")).toBe("");
    });

    it("collapses multiple hyphens", () => {
      expect(generateSlug("a---b")).toBe("a-b");
    });

    it("preserves numbers", () => {
      expect(generateSlug("Agency123")).toBe("agency123");
    });

    it("handles mixed alphanumeric and special chars", () => {
      expect(generateSlug("My Cool Agency #1 (2024)")).toBe("my-cool-agency-1-2024");
    });

    it("handles single character input", () => {
      expect(generateSlug("a")).toBe("a");
    });

    it("handles empty string", () => {
      expect(generateSlug("")).toBe("");
    });
  });

  describe("reserved slug detection", () => {
    it("detects all 19 reserved slugs", () => {
      const reservedList = [
        "www", "api", "app", "admin", "mail", "smtp", "ftp",
        "status", "blog", "docs", "help", "support", "cdn",
        "static", "assets", "staging", "dev", "test", "demo",
      ];
      expect(RESERVED_SLUGS.size).toBe(19);
      for (const slug of reservedList) {
        expect(isReservedSlug(slug)).toBe(true);
      }
    });

    it("is case-insensitive", () => {
      expect(isReservedSlug("WWW")).toBe(true);
      expect(isReservedSlug("Api")).toBe(true);
      expect(isReservedSlug("ADMIN")).toBe(true);
    });

    it("allows non-reserved slugs", () => {
      expect(isReservedSlug("my-agency")).toBe(false);
      expect(isReservedSlug("acme-corp")).toBe(false);
      expect(isReservedSlug("cool-company")).toBe(false);
    });

    it("does not match partial reserved words", () => {
      expect(isReservedSlug("api-gateway")).toBe(false);
      expect(isReservedSlug("my-blog")).toBe(false);
      expect(isReservedSlug("test-site")).toBe(false);
    });
  });
});
