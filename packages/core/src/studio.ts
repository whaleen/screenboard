import { spawn } from "node:child_process";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { ScreenboardConfig, SelectorSpec, Flow, Screen } from "./config";
import { normalizeConfig } from "./config";
import { locatorFor } from "./runner";
import type { ScreenManifestEntry } from "./manifest";
import { ensureDir, fileSafeName, resolveUrl, sleep, slugify } from "./utils";

export interface StudioLaunchOptions {
  baseUrl?: string;
  headless?: boolean;
  viewportId?: string;
  stateId?: string;
}

export interface StudioCaptureOptions {
  name: string;
  url?: string;
  viewportId?: string;
  stateId?: string;
}

export interface StudioStatus {
  connected: boolean;
  url?: string;
  baseUrl?: string;
  recording?: boolean;
}

export class StudioController {
  private config: ScreenboardConfig;
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private child?: ReturnType<typeof spawn>;
  private baseUrl?: string;
  private recordingFlow?: Flow;
  private discovered = new Set<string>();
  private lastNavUrl?: string;
  private currentStateId?: string;
  private currentViewportId?: string;
  private recorderReady = false;

  constructor(config: ScreenboardConfig) {
    this.config = normalizeConfig(config);
  }

  getStatus(): StudioStatus {
    return {
      connected: !!this.page,
      url: this.page?.url(),
      baseUrl: this.baseUrl,
      recording: !!this.recordingFlow
    };
  }

  updateConfig(nextConfig: ScreenboardConfig) {
    this.config = normalizeConfig(nextConfig);
  }

  async launch(options: StudioLaunchOptions) {
    this.baseUrl = options.baseUrl ?? this.config.app?.baseUrl;

    if (!this.browser) {
      await this.ensureAppRunning();
      this.browser = await chromium.launch({ headless: options.headless ?? false });
    }

    await this.ensureContext(options.stateId, options.viewportId);

    if (this.baseUrl) {
      await this.page?.goto(this.baseUrl, { waitUntil: "domcontentloaded" });
    }
  }

  async goto(url: string) {
    if (!this.page) {
      throw new Error("Browser not launched");
    }
    await this.page.goto(resolveUrl(this.baseUrl, url), { waitUntil: "networkidle" });
  }

  async capture(options: StudioCaptureOptions): Promise<{ screen: Screen; shot: ScreenManifestEntry }> {
    if (!this.page) {
      throw new Error("Browser not launched");
    }
    await this.ensureContext(options.stateId, options.viewportId);

    if (options.url) {
      await this.page.goto(resolveUrl(this.baseUrl, options.url), { waitUntil: "networkidle" });
      await sleep(150);
    }

    const viewport = this.getViewport(options.viewportId);
    const state = this.getState(options.stateId);
    const outDir = this.config.output?.dir ?? "screenboard";
    await ensureDir(join(outDir, "screens"));

    const fileName = `${fileSafeName(`${options.name}-${state.id}-${viewport.id}`)}.png`;
    const path = join(outDir, "screens", fileName);
    await this.page.screenshot({ path, fullPage: true });

    const screen: Screen = {
      id: slugify(options.name),
      name: options.name,
      url: this.page.url(),
      states: [state.id],
      viewports: [viewport.id]
    };

    const shot: ScreenManifestEntry = {
      id: `${screen.id}-${state.id}-${viewport.id}`,
      name: screen.name,
      url: this.page.url(),
      image: `screens/${fileName}`,
      width: viewport.width,
      height: viewport.height,
      viewportId: viewport.id,
      stateId: state.id
    };

    return { screen, shot };
  }

  async validateSelector(selector: SelectorSpec) {
    if (!this.page) {
      throw new Error("Browser not launched");
    }
    const locator = locatorFor(this.page, selector);
    const count = await locator.count();
    return { count };
  }

  async startRecording(name: string) {
    if (!this.page) {
      throw new Error("Browser not launched");
    }
    const flowId = slugify(name || "flow");
    this.recordingFlow = { id: flowId, name, steps: [] };
    this.lastNavUrl = this.page.url();
    if (!this.recorderReady) {
      await installRecorder(this.page, (payload) => {
        if (!this.recordingFlow) return;
        if (payload.type === "click" && payload.selector) {
          this.recordingFlow.steps.push({ type: "click", selector: payload.selector });
        }
        if (payload.type === "goto" && payload.url) {
          this.recordingFlow.steps.push({ type: "goto", url: payload.url });
        }
      });
      this.recorderReady = true;
    }
  }

  stopRecording() {
    const flow = this.recordingFlow;
    this.recordingFlow = undefined;
    if (flow) {
      flow.state = this.currentStateId;
      flow.viewport = this.currentViewportId;
    }
    return flow;
  }

  getDiscoveredUrls() {
    return Array.from(this.discovered);
  }

  async close() {
    if (this.context) {
      await this.context.close();
      this.context = undefined;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
    }
    if (this.child && !this.child.killed) {
      this.child.kill("SIGTERM");
    }
  }

  private async ensureContext(stateId?: string, viewportId?: string) {
    const state = this.getState(stateId);
    const viewport = this.getViewport(viewportId);
    const needsNewContext =
      !this.context || this.currentStateId !== state.id || this.currentViewportId !== viewport.id;

    if (needsNewContext) {
      if (this.context) {
        await this.context.close();
      }
      this.context = await this.browser!.newContext({ storageState: state.storageState });
      this.page = await this.context.newPage();
      this.recorderReady = false;
      this.page.on("framenavigated", (frame) => {
        const url = frame.url();
        if (url && !url.startsWith("about:")) {
          this.discovered.add(url);
        }
        if (this.recordingFlow && frame === this.page?.mainFrame()) {
          if (url && url !== this.lastNavUrl) {
            this.lastNavUrl = url;
            this.recordingFlow.steps.push({ type: "goto", url });
          }
        }
      });
      await this.page.setViewportSize({ width: viewport.width, height: viewport.height });
      if (state.setup) {
        await state.setup(this.page);
      }
      this.currentStateId = state.id;
      this.currentViewportId = viewport.id;
    }
  }

  private getState(stateId?: string) {
    return this.config.states?.find((item) => item.id === stateId) ?? this.config.states?.[0]!;
  }

  private getViewport(viewportId?: string) {
    return this.config.viewports?.find((item) => item.id === viewportId) ?? this.config.viewports?.[0]!;
  }

  private async ensureAppRunning() {
    if (!this.config.app?.command) {
      if (this.baseUrl) {
        await waitForUrl(this.baseUrl);
      }
      return;
    }
    this.child = spawn(this.config.app.command, {
      cwd: this.config.app.cwd ?? process.cwd(),
      env: process.env,
      shell: true,
      stdio: "inherit"
    });
    if (this.baseUrl) {
      await waitForUrl(this.baseUrl);
    }
  }
}

async function installRecorder(page: Page, onRecord: (payload: { selector?: SelectorSpec; type: string; url?: string }) => void) {
  await page.exposeFunction("screenboardRecord", onRecord);
  await page.evaluate(() => {
    if ((window as any).__screenboardRecorderInstalled) {
      return;
    }
    (window as any).__screenboardRecorderInstalled = true;
    const getSelector = (el: Element) => {
      const testId = el.getAttribute("data-testid");
      if (testId) return { testId };
      const role = el.getAttribute("role");
      const name = el.getAttribute("aria-label") || el.textContent?.trim();
      if (role) return { role, name };
      const text = el.textContent?.trim();
      if (text && text.length < 80) return { text };
      if (el.id) return { css: `#${el.id}` };
      const className = (el.getAttribute("class") || "").split(" ").filter(Boolean)[0];
      if (className) return { css: `${el.tagName.toLowerCase()}.${className}` };
      return { css: el.tagName.toLowerCase() };
    };
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target as Element | null;
        if (!target) return;
        const selector = getSelector(target);
        (window as any).screenboardRecord({ type: "click", selector });
      },
      true
    );
  });
}

async function waitForUrl(url: string) {
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
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for ${url}`);
}
