import type { Flow, ScreenboardConfig, Viewport, State } from "./config";

export interface ScreenManifestEntry {
  id: string;
  name: string;
  url: string;
  image: string;
  width: number;
  height: number;
  viewportId: string;
  stateId: string;
  flowId?: string;
  stepIndex?: number;
}

export interface FlowManifestEntry {
  id: string;
  name: string;
  steps: Flow["steps"];
}

export interface Manifest {
  title?: string;
  generatedAt: string;
  baseUrl?: string;
  screens: ScreenManifestEntry[];
  flows: FlowManifestEntry[];
  viewports: Viewport[];
  states: State[];
  discoveredUrls: string[];
}

export function createManifest(config: ScreenboardConfig, baseUrl?: string): Manifest {
  return {
    title: config.output?.title,
    generatedAt: new Date().toISOString(),
    baseUrl,
    screens: [],
    flows: [],
    viewports: config.viewports ?? [],
    states: config.states ?? [],
    discoveredUrls: []
  };
}
