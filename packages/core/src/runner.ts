import { spawn } from "node:child_process";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import {
  normalizeConfig,
  type ScreenboardConfig,
  type Screen,
  type State,
  type Viewport,
  type ReadySpec,
  type SelectorSpec,
  type Flow
} from "./config";
import { createManifest, type Manifest, type ScreenManifestEntry } from "./manifest";
import { ensureDir, expandTemplate, fileSafeName, resolveUrl, sleep, uniqueStrings } from "./utils";

export interface RunCaptureOptions {
  baseUrl?: string;
  headless?: boolean;
  outDir?: string;
  debug?: boolean;
}

export interface CaptureResult {
  manifest: Manifest;
  outDir: string;
}

export async function runCapture(configInput: ScreenboardConfig, options: RunCaptureOptions = {}): Promise<CaptureResult> {
  const config = normalizeConfig(configInput);
  const baseUrl = options.baseUrl ?? config.app.baseUrl;
  const outDir = options.outDir ?? config.output.dir;
  const headless = options.headless ?? true;
  const debug = options.debug ?? false;
  const logger = createLogger(debug);

  await ensureDir(outDir);
  await ensureDir(join(outDir, "screens"));

  const { child, cleanup } = await ensureAppRunning(config, baseUrl, logger);
  const manifest = createManifest(config, baseUrl);

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless });
    const discoveredUrls = new Set<string>();

    for (const state of config.states) {
      const context = await browser.newContext({ storageState: state.storageState });
      const page = await context.newPage();
      registerDiscovery(page, discoveredUrls);

      if (state.setup) {
        await state.setup(page);
      }

      for (const viewport of config.viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        for (const screen of config.screens) {
          if (!matchesState(screen, state) || !matchesViewport(screen, viewport)) {
            continue;
          }
          const screenUrls = resolveScreenUrls(screen);
          for (const variant of screenUrls) {
            const targetUrl = resolveUrl(baseUrl, variant.url);
            logger("capture", screen.name, targetUrl);
            await page.goto(targetUrl, { waitUntil: "networkidle" });
            await waitForReady(page, screen.ready);
            await sleep(150);
            const entry = await capturePage({
              page,
              screen,
              state,
              viewport,
              outDir,
              variantId: variant.variantId
            });
            manifest.screens.push(entry);
          }
        }
      }
      await context.close();
    }

    for (const flow of config.flows) {
      const entry = await runFlow({ browser, flow, config, baseUrl, outDir, logger, discoveredUrls, manifest });
      manifest.flows.push(entry);
    }

    manifest.discoveredUrls = uniqueStrings(Array.from(discoveredUrls));
    return { manifest, outDir };
  } finally {
    if (browser) {
      await browser.close();
    }
    await cleanup();
    if (child && !child.killed) {
      child.kill("SIGTERM");
    }
  }
}

async function runFlow({
  browser,
  flow,
  config,
  baseUrl,
  outDir,
  logger,
  discoveredUrls,
  manifest
}: {
  browser: Browser;
  flow: Flow;
  config: ScreenboardConfig;
  baseUrl?: string;
  outDir: string;
  logger: (...args: unknown[]) => void;
  discoveredUrls: Set<string>;
  manifest: Manifest;
}) {
  const state = config.states?.find((item) => item.id === flow.state) ?? config.states?.[0];
  const viewport = config.viewports?.find((item) => item.id === flow.viewport) ?? config.viewports?.[0];
  const context = await browser.newContext({ storageState: state?.storageState });
  const page = await context.newPage();
  registerDiscovery(page, discoveredUrls);
  if (state?.setup) {
    await state.setup(page);
  }
  if (viewport) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
  }

  let stepIndex = 0;

  for (const step of flow.steps) {
    switch (step.type) {
      case "goto":
        logger("flow goto", step.url);
        await page.goto(resolveUrl(baseUrl, step.url), { waitUntil: "networkidle" });
        break;
      case "click":
        await locatorFor(page, step.selector).click();
        break;
      case "fill":
        await locatorFor(page, step.selector).fill(step.value);
        break;
      case "press":
        await locatorFor(page, step.selector).press(step.key);
        break;
      case "waitFor":
        if (step.selector) {
          await locatorFor(page, step.selector).waitFor({ timeout: step.timeoutMs ?? 5000 });
        } else if (step.timeoutMs) {
          await sleep(step.timeoutMs);
        }
        break;
      case "capture": {
        const screenName = step.name ?? `${flow.name} Step ${stepIndex + 1}`;
        const screen: Screen = {
          id: `${flow.id}-step-${stepIndex + 1}`,
          name: screenName
        };
        const entry = await capturePage({
          page,
          screen,
          state: state ?? { id: "default", name: "Default" },
          viewport: viewport ?? { id: "desktop", name: "Desktop", width: 1280, height: 720 },
          outDir
        });
        entry.flowId = flow.id;
        entry.stepIndex = stepIndex;
        manifest.screens.push(entry);
        stepIndex += 1;
        break;
      }
      default:
        break;
    }
  }

  await context.close();

  return {
    id: flow.id,
    name: flow.name,
    steps: flow.steps
  };
}

async function capturePage({
  page,
  screen,
  state,
  viewport,
  outDir,
  variantId
}: {
  page: Page;
  screen: Screen;
  state: State;
  viewport: Viewport;
  outDir: string;
  variantId?: string;
}): Promise<ScreenManifestEntry> {
  const url = page.url();
  const baseId = variantId ? `${screen.id}-${variantId}` : screen.id;
  const fileName = `${fileSafeName(`${baseId}-${state.id}-${viewport.id}`)}.png`;
  const outputPath = join(outDir, "screens", fileName);
  await page.screenshot({ path: outputPath, fullPage: true });

  return {
    id: `${baseId}-${state.id}-${viewport.id}`,
    name: screen.name,
    url,
    image: `screens/${fileName}`,
    width: viewport.width,
    height: viewport.height,
    viewportId: viewport.id,
    stateId: state.id
  };
}

function resolveScreenUrls(screen: Screen) {
  if (screen.url) {
    return [{ url: screen.url }];
  }
  if (screen.template) {
    const urls = expandTemplate(screen.template, screen.params);
    if (urls.length <= 1) {
      return [{ url: urls[0] ?? screen.template }];
    }
    return urls.map((url, index) => ({ url, variantId: `variant-${index + 1}` }));
  }
  return [{ url: "/" }];
}

function matchesState(screen: Screen, state: State) {
  if (!screen.states || screen.states.length === 0) {
    return true;
  }
  return screen.states.includes(state.id);
}

function matchesViewport(screen: Screen, viewport: Viewport) {
  if (!screen.viewports || screen.viewports.length === 0) {
    return true;
  }
  return screen.viewports.includes(viewport.id);
}

async function waitForReady(page: Page, ready?: ReadySpec) {
  if (!ready) {
    return;
  }
  if ("timeoutMs" in ready) {
    await sleep(ready.timeoutMs);
    return;
  }
  await locatorFor(page, ready).waitFor({ timeout: 5000 });
}

export function locatorFor(page: Page, selector: SelectorSpec) {
  if ("testId" in selector) {
    return page.getByTestId(selector.testId);
  }
  if ("role" in selector) {
    return page.getByRole(selector.role as never, selector.name ? { name: selector.name } : undefined);
  }
  if ("text" in selector) {
    return page.getByText(selector.text);
  }
  return page.locator(selector.css);
}

function registerDiscovery(page: Page, discoveredUrls: Set<string>) {
  page.on("framenavigated", (frame) => {
    const url = frame.url();
    if (url && !url.startsWith("about:")) {
      discoveredUrls.add(url);
    }
  });
}

async function ensureAppRunning(
  config: ScreenboardConfig,
  baseUrl: string | undefined,
  logger: (...args: unknown[]) => void
) {
  if (!config.app?.command) {
    if (baseUrl) {
      await waitForUrl(baseUrl, logger);
    }
    return { child: undefined, cleanup: async () => undefined };
  }
  const child = spawn(config.app.command, {
    cwd: config.app.cwd ?? process.cwd(),
    env: process.env,
    shell: true,
    stdio: "inherit"
  });
  if (baseUrl) {
    await waitForUrl(baseUrl, logger);
  }
  return {
    child,
    cleanup: async () => {
      if (child && !child.killed) {
        child.kill("SIGTERM");
      }
    }
  };
}

async function waitForUrl(url: string, logger: (...args: unknown[]) => void) {
  const timeoutMs = 60_000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) {
        return;
      }
    } catch {
      // ignore
    }
    logger("waiting for", url);
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function createLogger(enabled: boolean) {
  return (...args: unknown[]) => {
    if (enabled) {
      console.log("[screenboard]", ...args);
    }
  };
}
