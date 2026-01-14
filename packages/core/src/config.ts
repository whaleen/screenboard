import { z } from "zod";
import type { Page } from "playwright";
import { DEFAULT_OUTPUT_DIR, DEFAULT_STATE, DEFAULT_VIEWPORT } from "./utils";

export type SelectorSpec =
  | { testId: string }
  | { role: string; name?: string }
  | { text: string }
  | { css: string };

export type ReadySpec = SelectorSpec | { timeoutMs: number };

export interface Viewport {
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface State {
  id: string;
  name: string;
  storageState?: string;
  setup?: (page: Page) => Promise<void> | void;
}

export interface Screen {
  id: string;
  name: string;
  url?: string;
  template?: string;
  params?: Record<string, string[]>;
  ready?: ReadySpec;
  states?: string[];
  viewports?: string[];
}

export type FlowStep =
  | { type: "goto"; url: string }
  | { type: "click"; selector: SelectorSpec }
  | { type: "fill"; selector: SelectorSpec; value: string }
  | { type: "press"; selector: SelectorSpec; key: string }
  | { type: "waitFor"; selector?: SelectorSpec; timeoutMs?: number }
  | { type: "capture"; name?: string };

export interface Flow {
  id: string;
  name: string;
  viewport?: string;
  state?: string;
  steps: FlowStep[];
}

export interface ScreenboardConfig {
  app?: {
    baseUrl?: string;
    command?: string;
    cwd?: string;
  };
  output?: {
    dir?: string;
    title?: string;
  };
  viewports?: Viewport[];
  states?: State[];
  screens?: Screen[];
  flows?: Flow[];
}

export interface ScreenboardJson {
  app?: {
    baseUrl?: string;
    command?: string;
    cwd?: string;
  };
  output?: {
    dir?: string;
    title?: string;
  };
  viewports?: Viewport[];
  states?: Omit<State, "setup">[];
  screens?: Screen[];
  flows?: Flow[];
}

export function defineConfig(config: ScreenboardConfig) {
  return config;
}

const selectorSchema = z.union([
  z.object({ testId: z.string() }),
  z.object({ role: z.string(), name: z.string().optional() }),
  z.object({ text: z.string() }),
  z.object({ css: z.string() })
]);

const readySchema = z.union([selectorSchema, z.object({ timeoutMs: z.number().int().positive() })]);

const viewportSchema = z.object({
  id: z.string(),
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
});

const stateSchema = z.object({
  id: z.string(),
  name: z.string(),
  storageState: z.string().optional()
});

const screenSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().optional(),
  template: z.string().optional(),
  params: z.record(z.array(z.string())).optional(),
  ready: readySchema.optional(),
  states: z.array(z.string()).optional(),
  viewports: z.array(z.string()).optional()
});

const flowStepSchema = z.union([
  z.object({ type: z.literal("goto"), url: z.string() }),
  z.object({ type: z.literal("click"), selector: selectorSchema }),
  z.object({ type: z.literal("fill"), selector: selectorSchema, value: z.string() }),
  z.object({ type: z.literal("press"), selector: selectorSchema, key: z.string() }),
  z.object({ type: z.literal("waitFor"), selector: selectorSchema.optional(), timeoutMs: z.number().int().positive().optional() }),
  z.object({ type: z.literal("capture"), name: z.string().optional() })
]);

const flowSchema = z.object({
  id: z.string(),
  name: z.string(),
  viewport: z.string().optional(),
  state: z.string().optional(),
  steps: z.array(flowStepSchema)
});

export const screenboardJsonSchema = z.object({
  app: z
    .object({
      baseUrl: z.string().optional(),
      command: z.string().optional(),
      cwd: z.string().optional()
    })
    .optional(),
  output: z
    .object({
      dir: z.string().optional(),
      title: z.string().optional()
    })
    .optional(),
  viewports: z.array(viewportSchema).optional(),
  states: z.array(stateSchema).optional(),
  screens: z.array(screenSchema).optional(),
  flows: z.array(flowSchema).optional()
});

export function parseScreenboardJson(input: unknown): ScreenboardJson {
  return screenboardJsonSchema.parse(input);
}

export function mergeConfig(base: ScreenboardConfig, overlay: ScreenboardJson | undefined): ScreenboardConfig {
  if (!overlay) {
    return base;
  }
  return {
    app: { ...base.app, ...overlay.app },
    output: { ...base.output, ...overlay.output },
    viewports: overlay.viewports ?? base.viewports,
    states: overlay.states ?? base.states,
    screens: overlay.screens ?? base.screens,
    flows: overlay.flows ?? base.flows
  };
}

export function normalizeConfig(config: ScreenboardConfig): Required<ScreenboardConfig> {
  return {
    app: config.app ?? {},
    output: {
      dir: config.output?.dir ?? DEFAULT_OUTPUT_DIR,
      title: config.output?.title
    },
    viewports: config.viewports && config.viewports.length > 0 ? config.viewports : [DEFAULT_VIEWPORT],
    states: config.states && config.states.length > 0 ? config.states : [DEFAULT_STATE],
    screens: config.screens ?? [],
    flows: config.flows ?? []
  };
}
