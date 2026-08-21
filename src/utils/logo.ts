import type { Settings } from "@/types/pos";

export const DEFAULT_LOGO_PATH = "/icon-192.png";
const MAX_LOGO_URL_LENGTH = 2_048;

/**
 * Logos are rendered in the app shell and receipt HTML. Only allow lightweight
 * local paths or ordinary HTTP(S) URLs; data URIs are intentionally rejected so
 * settings updates never carry image payloads through Realtime Database.
 */
export function sanitizeLogoSource(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const source = value.trim();
  if (!source || source.length > MAX_LOGO_URL_LENGTH || source.startsWith("data:")) {
    return null;
  }
  if (source.startsWith("/") && !source.startsWith("//") && !source.includes("\\")) {
    return source;
  }
  try {
    const url = new URL(source);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function getSettingsLogo(settings: Partial<Settings> | null | undefined): string | null {
  return sanitizeLogoSource(settings?.logo)
    ?? sanitizeLogoSource(settings?.cafeLogo)
    ?? sanitizeLogoSource(settings?.logoUrl);
}

/**
 * Retire the legacy duplicate logo aliases. Existing base64 logo values are
 * never retained in browser storage or pushed back to Firebase.
 */
export function normalizeSettingsLogos<T extends Partial<Settings>>(
  settings: T,
): T {
  const normalized = { ...settings };
  const logo = getSettingsLogo(settings);
  delete normalized.cafeLogo;
  delete normalized.logoUrl;
  if (logo) normalized.logo = logo;
  else delete normalized.logo;
  return normalized;
}

/** Used only by the migration: a legacy image payload becomes the local default. */
export function migrateLegacyLogo(value: unknown): string | null {
  if (typeof value === "string" && value.trim().startsWith("data:")) {
    return DEFAULT_LOGO_PATH;
  }
  return sanitizeLogoSource(value);
}