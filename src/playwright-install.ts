import { existsSync } from "node:fs";
import { chromium } from "playwright";

type PlaywrightRegistryModule = {
  installBrowsersForNpmInstall?: (browsers: string[]) => Promise<void>;
};

export async function ensureChromiumInstalled(): Promise<void> {
  if (existsSync(chromium.executablePath())) {
    return;
  }

  try {
    const registry = (await import(
      "playwright-core/lib/server/registry/index.js"
    )) as PlaywrightRegistryModule;
    await registry.installBrowsersForNpmInstall?.(["chromium"]);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Playwright Chromium is not installed and gitbanana could not install it automatically: ${reason}`,
    );
  }
}
