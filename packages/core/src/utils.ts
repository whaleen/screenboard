import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const DEFAULT_VIEWPORT = {
  id: "desktop",
  name: "Desktop",
  width: 1280,
  height: 720
};

export const DEFAULT_STATE = {
  id: "default",
  name: "Default"
};

export const DEFAULT_OUTPUT_DIR = "screenboard";

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function fileSafeName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function ensureDir(path: string) {
  await mkdir(path, { recursive: true });
}

export async function writeJson(path: string, data: unknown) {
  await ensureDir(dirname(path));
  await writeFile(path, JSON.stringify(data, null, 2), "utf8");
}

export function resolveUrl(baseUrl: string | undefined, url: string) {
  if (!baseUrl) {
    return url;
  }
  try {
    const parsed = new URL(url);
    return parsed.toString();
  } catch {
    return new URL(url, baseUrl).toString();
  }
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

export function expandTemplate(template: string, params?: Record<string, string[]>) {
  if (!params || Object.keys(params).length === 0) {
    return [template];
  }
  const entries = Object.entries(params);
  const combos: Record<string, string>[] = [{}];
  for (const [key, values] of entries) {
    const next: Record<string, string>[] = [];
    for (const combo of combos) {
      for (const value of values) {
        next.push({ ...combo, [key]: value });
      }
    }
    combos.splice(0, combos.length, ...next);
  }

  return combos.map((combo) => {
    let url = template;
    for (const [key, value] of Object.entries(combo)) {
      url = url.replace(new RegExp(`:${key}\\b`, "g"), value);
      url = url.replace(new RegExp(`\\{${key}\\}`, "g"), value);
    }
    return url;
  });
}
