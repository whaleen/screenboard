#!/usr/bin/env node
import { Command } from "commander";
import { resolve } from "node:path";
import { runCapture, writeManifest, writeViewer } from "@screenboard/core";
import { loadConfig } from "./config";
import { runStudioServer } from "./studioServer";
import { scanProject, writeSuggestions } from "@screenboard/agent";

const program = new Command();

program
  .name("screenboard")
  .description("Generate a visual map of UI screens and flows")
  .option("--config <path>", "Path to screenboard.config.ts")
  .option("--baseUrl <url>", "Base URL for the app")
  .option("--outDir <dir>", "Output directory")
  .option("--port <port>", "Studio port", "7331")
  .option("--headless", "Run browser headless")
  .option("--no-headless", "Run browser with UI")
  .option("--open", "Open Studio in browser")
  .option("--debug", "Verbose logging");

program
  .command("studio")
  .description("Launch the Studio UI")
  .action(async () => {
    const opts = program.opts();
    const cwd = process.cwd();
    const loaded = loadConfig({ cwd, configPath: opts.config });
    await runStudioServer({
      config: loaded.config,
      port: Number(opts.port),
      baseUrl: opts.baseUrl,
      outDir: opts.outDir,
      open: Boolean(opts.open)
    });
  });

program
  .command("build")
  .description("Capture screens and generate the board")
  .action(async () => {
    const opts = program.opts();
    const headlessFlag = resolveHeadless();
    const cwd = process.cwd();
    const loaded = loadConfig({ cwd, configPath: opts.config });
    const { manifest, outDir } = await runCapture(loaded.config, {
      baseUrl: opts.baseUrl,
      outDir: opts.outDir,
      headless: headlessFlag ?? true,
      debug: opts.debug
    });
    await writeManifest(outDir, manifest);
    await writeViewer(outDir, manifest);
    console.log(`[screenboard] Board generated in ${resolve(cwd, outDir)}`);
  });

program
  .command("agent")
  .description("Generate draft suggestions and launch Studio")
  .action(async () => {
    const opts = program.opts();
    const cwd = process.cwd();
    const suggestions = await scanProject(cwd);
    await writeSuggestions(cwd, suggestions);
    const loaded = loadConfig({ cwd, configPath: opts.config });
    await runStudioServer({
      config: loaded.config,
      port: Number(opts.port),
      baseUrl: opts.baseUrl,
      outDir: opts.outDir,
      open: true
    });
  });

program.action(async () => {
  const opts = program.opts();
  const headlessFlag = resolveHeadless();
  const cwd = process.cwd();
  const loaded = loadConfig({ cwd, configPath: opts.config });
  if (!loaded.hasAny) {
    await runStudioServer({
      config: loaded.config,
      port: Number(opts.port),
      baseUrl: opts.baseUrl,
      outDir: opts.outDir,
      open: true
    });
    return;
  }
  const { manifest, outDir } = await runCapture(loaded.config, {
    baseUrl: opts.baseUrl,
    outDir: opts.outDir,
    headless: headlessFlag ?? true,
    debug: opts.debug
  });
  await writeManifest(outDir, manifest);
  await writeViewer(outDir, manifest);
  console.log(`[screenboard] Board generated in ${resolve(cwd, outDir)}`);
});

program.parseAsync(process.argv).catch((error) => {
  console.error(error);
  process.exit(1);
});

function resolveHeadless() {
  if (process.argv.includes("--headless")) return true;
  if (process.argv.includes("--no-headless")) return false;
  return undefined;
}
