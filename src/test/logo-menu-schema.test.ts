import { describe, expect, it } from "vitest";
import { normalizeMenuItemsSnapshot } from "@/utils/menuSchema";
import { getSettingsLogo, normalizeSettingsLogos, sanitizeLogoSource } from "@/utils/logo";

describe("logo storage safety", () => {
  it("accepts static paths and HTTPS URLs but rejects base64 payloads", () => {
    expect(sanitizeLogoSource("/logo.webp")).toBe("/logo.webp");
    expect(sanitizeLogoSource("https://cdn.example.com/logo.webp")).toBe("https://cdn.example.com/logo.webp");
    expect(sanitizeLogoSource("data:image/webp;base64,abc")).toBeNull();
    expect(sanitizeLogoSource("//untrusted.example/logo.webp")).toBeNull();
  });

  it("removes legacy aliases from normalized settings", () => {
    const normalized = normalizeSettingsLogos({
      cafeLogo: "data:image/png;base64,large",
      logoUrl: "https://cdn.example.com/logo.webp",
    });
    expect(normalized).toEqual({ logo: "https://cdn.example.com/logo.webp" });
    expect(getSettingsLogo(normalized)).toBe("https://cdn.example.com/logo.webp");
  });
});

describe("menu snapshot compatibility", () => {
  it("reads legacy numeric keys and uses deterministic display order", () => {
    const result = normalizeMenuItemsSnapshot({
      0: { id: "tea", name: "Tea", categoryId: "hot", price: 50 },
      1: { id: "coffee", name: "Coffee", categoryId: "hot", price: 80, displayOrder: 0 },
    });
    expect(result.isSafe).toBe(true);
    expect(result.records.map((item) => item.id)).toEqual(["tea", "coffee"]);
    expect(result.records.every((item) => item.available)).toBe(true);
  });

  it("fails closed for duplicate menu IDs", () => {
    const result = normalizeMenuItemsSnapshot({
      first: { id: "tea", name: "Tea", categoryId: "hot", price: 50 },
      second: { id: "tea", name: "Different", categoryId: "hot", price: 60 },
    });
    expect(result.isSafe).toBe(false);
    expect(result.issues.some((issue) => issue.kind === "duplicate-id")).toBe(true);
  });
});