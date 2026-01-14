import express from "express";
import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { normalizeConfig, parseScreenboardJson, type ScreenboardConfig, type ScreenboardJson } from "@screenboard/core";
import { StudioController } from "@screenboard/core";

export interface StudioServerOptions {
  config: ScreenboardConfig;
  port: number;
  baseUrl?: string;
  outDir?: string;
  open?: boolean;
}

export async function runStudioServer(options: StudioServerOptions) {
  const { createServer: createViteServer } = await import("vite");
  const openBrowser = (await import("open")).default;
  const normalized = normalizeConfig({
    ...options.config,
    app: { ...options.config.app, baseUrl: options.baseUrl ?? options.config.app?.baseUrl },
    output: { ...options.config.output, dir: options.outDir ?? options.config.output?.dir }
  });
  let currentConfig: ScreenboardConfig = normalized;
  const controller = new StudioController(currentConfig);

  const app = express();
  app.use(express.json({ limit: "10mb" }));

  app.get("/api/status", (_req, res) => {
    res.json(controller.getStatus());
  });

  app.get("/api/config", (_req, res) => {
    res.json(toJsonConfig(currentConfig));
  });

  app.get("/api/suggestions", async (_req, res) => {
    try {
      const suggestionsPath = resolve(process.cwd(), ".screenboard", "suggestions.json");
      const raw = await readFile(suggestionsPath, "utf8");
      res.json(JSON.parse(raw));
    } catch {
      res.json(null);
    }
  });

  app.post("/api/launch", async (req, res) => {
    try {
      if (req.body?.config) {
        const parsed = parseScreenboardJson(req.body.config as ScreenboardJson);
        currentConfig = { ...currentConfig, ...parsed };
        controller.updateConfig(currentConfig);
      }
      await controller.launch({
        baseUrl: req.body?.baseUrl,
        headless: req.body?.headless,
        viewportId: req.body?.viewportId,
        stateId: req.body?.stateId
      });
      res.json(controller.getStatus());
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/goto", async (req, res) => {
    try {
      await controller.goto(req.body?.url ?? "/");
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/capture", async (req, res) => {
    try {
      if (req.body?.config) {
        const parsed = parseScreenboardJson(req.body.config as ScreenboardJson);
        currentConfig = { ...currentConfig, ...parsed };
        controller.updateConfig(currentConfig);
      }
      const result = await controller.capture({
        name: req.body?.name ?? "Untitled",
        url: req.body?.url,
        viewportId: req.body?.viewportId,
        stateId: req.body?.stateId
      });
      currentConfig.screens = currentConfig.screens ? [...currentConfig.screens, result.screen] : [result.screen];
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/validateSelector", async (req, res) => {
    try {
      const result = await controller.validateSelector(req.body?.selector);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/record/start", async (req, res) => {
    try {
      await controller.startRecording(req.body?.name ?? "Flow");
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/record/stop", (_req, res) => {
    const flow = controller.stopRecording();
    if (flow) {
      currentConfig.flows = currentConfig.flows ? [...currentConfig.flows, flow] : [flow];
    }
    res.json(flow);
  });

  app.post("/api/save", async (req, res) => {
    try {
      const body = req.body ?? {};
      const parsed = parseScreenboardJson(body as ScreenboardJson);
      const filePath = resolve(process.cwd(), "screenboard.json");
      await writeFile(filePath, JSON.stringify(parsed, null, 2), "utf8");
      currentConfig = { ...currentConfig, ...parsed };
      controller.updateConfig(currentConfig);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/close", async (_req, res) => {
    await controller.close();
    res.json({ ok: true });
  });

  const studioRoot = resolve(__dirname, "..", "..", "studio");
  const vite = await createViteServer({
    root: studioRoot,
    server: { middlewareMode: true },
    appType: "spa"
  });

  app.use(vite.middlewares);

  app.listen(options.port, () => {
    const url = `http://localhost:${options.port}`;
    console.log(`[screenboard] Studio running at ${url}`);
    if (options.open) {
      openBrowser(url);
    }
  });
}

function toJsonConfig(config: ScreenboardConfig): ScreenboardJson {
  return {
    app: config.app,
    output: config.output,
    viewports: config.viewports,
    states: config.states?.map(({ setup, ...rest }) => rest),
    screens: config.screens,
    flows: config.flows
  };
}
