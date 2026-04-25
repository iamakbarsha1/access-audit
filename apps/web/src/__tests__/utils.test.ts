import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn utility", () => {
  describe("merges multiple class strings", () => {
    it("combines two class strings", () => {
      expect(cn("foo", "bar")).toBe("foo bar");
    });

    it("combines three class strings", () => {
      expect(cn("a", "b", "c")).toBe("a b c");
    });

    it("handles a single class string", () => {
      expect(cn("text-red-500")).toBe("text-red-500");
    });
  });

  describe("handles conditional classes", () => {
    it("includes class when condition is true", () => {
      const isActive = true;
      expect(cn("base", isActive && "active")).toBe("base active");
    });

    it("excludes class when condition is false", () => {
      const isActive = false;
      expect(cn("base", isActive && "active")).toBe("base");
    });

    it("handles object syntax for conditionals", () => {
      expect(cn({ "text-red-500": true, "text-blue-500": false })).toBe(
        "text-red-500"
      );
    });

    it("handles mixed string and object syntax", () => {
      expect(cn("base", { active: true, disabled: false })).toBe(
        "base active"
      );
    });
  });

  describe("handles undefined/null/false values", () => {
    it("handles undefined", () => {
      expect(cn("base", undefined)).toBe("base");
    });

    it("handles null", () => {
      expect(cn("base", null)).toBe("base");
    });

    it("handles false", () => {
      expect(cn("base", false)).toBe("base");
    });

    it("handles mix of falsy values", () => {
      expect(cn("base", undefined, null, false, "active")).toBe("base active");
    });

    it("handles empty string", () => {
      expect(cn("base", "", "active")).toBe("base active");
    });
  });

  describe("Tailwind merge resolves conflicts", () => {
    it("last padding wins: p-4 + p-2 results in p-2", () => {
      expect(cn("p-4", "p-2")).toBe("p-2");
    });

    it("last margin wins: m-4 + m-2 results in m-2", () => {
      expect(cn("m-4", "m-2")).toBe("m-2");
    });

    it("last text color wins", () => {
      expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
    });

    it("last background color wins", () => {
      expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
    });

    it("non-conflicting classes are preserved", () => {
      expect(cn("p-4", "m-2", "text-red-500")).toBe("p-4 m-2 text-red-500");
    });

    it("conflicting and non-conflicting classes mixed", () => {
      expect(cn("p-4 text-red-500", "p-2 font-bold")).toBe(
        "text-red-500 p-2 font-bold"
      );
    });
  });

  describe("empty inputs", () => {
    it("returns empty string with no arguments", () => {
      expect(cn()).toBe("");
    });

    it("returns empty string with only falsy arguments", () => {
      expect(cn(undefined, null, false)).toBe("");
    });
  });

  describe("array inputs", () => {
    it("handles array of class names", () => {
      expect(cn(["foo", "bar"])).toBe("foo bar");
    });

    it("handles nested arrays", () => {
      expect(cn(["foo", ["bar", "baz"]])).toBe("foo bar baz");
    });
  });
});
