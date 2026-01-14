import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import jiti from "jiti";
import { mergeConfig, parseScreenboardJson, type ScreenboardConfig } from "@screenboard/core";

export interface LoadedConfig {
  config: ScreenboardConfig;
  configPath?: string;
  jsonPath?: string;
  hasAny: boolean;
}

export function loadConfig({ cwd, configPath }: { cwd: string; configPath?: string }): LoadedConfig {
  const resolvedConfigPath = configPath ? resolve(cwd, configPath) : findDefaultConfig(cwd);
  const jsonPath = resolve(cwd, "screenboard.json");

  const hasConfigFile = resolvedConfigPath ? existsSync(resolvedConfigPath) : false;
  const hasJsonFile = existsSync(jsonPath);

  let config: ScreenboardConfig = {};

  if (hasConfigFile && resolvedConfigPath) {
    const loader = jiti(cwd, { interopDefault: true, esmResolve: true });
    const loaded = loader(resolvedConfigPath);
    config = (loaded?.default ?? loaded) as ScreenboardConfig;
  }

  if (hasJsonFile) {
    const jsonRaw = JSON.parse(readFileSync(jsonPath, "utf8"));
    const jsonConfig = parseScreenboardJson(jsonRaw);
    config = mergeConfig(config, jsonConfig);
  }

  return {
    config,
    configPath: hasConfigFile ? resolvedConfigPath ?? undefined : undefined,
    jsonPath: hasJsonFile ? jsonPath : undefined,
    hasAny: hasConfigFile || hasJsonFile
  };
}

function findDefaultConfig(cwd: string) {
  const candidates = ["screenboard.config.ts", "screenboard.config.js", "screenboard.config.mjs"];
  for (const candidate of candidates) {
    const full = resolve(cwd, candidate);
    if (existsSync(full)) {
      return full;
    }
  }
  return undefined;
}
