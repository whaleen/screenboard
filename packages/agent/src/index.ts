import fg from "fast-glob";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { slugify, DEFAULT_STATE, DEFAULT_VIEWPORT } from "@screenboard/core";
import type { ScreenboardJson, Screen } from "@screenboard/core";

export interface Suggestions extends ScreenboardJson {
  generatedAt: string;
  testIds?: string[];
}

const ROUTE_PATTERNS = [
  /href=["']([^"']+)["']/g,
  /to=["']([^"']+)["']/g,
  /navigate\(["'`]([^"'`]+)["'`]\)/g
];

const TESTID_PATTERN = /data-testid=["']([^"']+)["']/g;

export async function scanProject(root: string): Promise<Suggestions> {
  const files = await fg(["**/*.{ts,tsx,js,jsx,html}"], {
    cwd: root,
    ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/screenboard/**", "**/.screenboard/**"]
  });

  const routes = new Set<string>();
  const testIds = new Set<string>();

  for (const file of files) {
    const fullPath = resolve(root, file);
    const content = await readFile(fullPath, "utf8");
    for (const pattern of ROUTE_PATTERNS) {
      let match: RegExpExecArray | null = null;
      while ((match = pattern.exec(content))) {
        const value = match[1];
        if (!value) continue;
        if (value.startsWith("/") || value.startsWith("http")) {
          routes.add(value);
        }
      }
    }
    let match: RegExpExecArray | null = null;
    while ((match = TESTID_PATTERN.exec(content))) {
      const value = match[1];
      if (value) {
        testIds.add(value);
      }
    }
  }

  const screens: Screen[] = Array.from(routes).map((route) => ({
    id: slugify(route.replace(/\W+/g, " ") || "screen"),
    name: route,
    url: route
  }));

  return {
    generatedAt: new Date().toISOString(),
    testIds: Array.from(testIds),
    viewports: [DEFAULT_VIEWPORT],
    states: [DEFAULT_STATE],
    screens,
    flows: [],
    app: {},
    output: {
      dir: "screenboard"
    }
  };
}

export async function writeSuggestions(root: string, suggestions: Suggestions) {
  const dir = resolve(root, ".screenboard");
  await mkdir(dir, { recursive: true });
  const filePath = resolve(dir, "suggestions.json");
  await writeFile(filePath, JSON.stringify(suggestions, null, 2), "utf8");
}
