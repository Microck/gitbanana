import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { editUrl } from "./gamebanana.js";
import { parseProxy } from "./inputs.js";
import type { ProxySettings } from "./types.js";

type CaptureOptions = {
  submissionId: string;
  apiSection: string;
  pageSection: string;
  proxy?: ProxySettings;
  output?: string;
};

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  if (command === "capture") {
    await capture(parseCaptureOptions(rest));
    return;
  }

  if (command === "verify-auth") {
    await verifyAuth(parseVerifyAuthOptions(rest));
    return;
  }

  if (!command || command === "--help" || command === "-h" || command === "help") {
    printHelp();
    process.exitCode = 0;
    return;
  }

  printHelp();
  process.exitCode = 1;
}

export async function capture(options: CaptureOptions): Promise<void> {
  const { ensureChromiumInstalled } = await import("./playwright-install.js");
  const { chromium } = await import("playwright");
  await ensureChromiumInstalled();
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext(options.proxy ? { proxy: options.proxy } : {});
  const page = await context.newPage();
  let storageStateJson = "";

  try {
    await page.goto(editUrl(options, options.submissionId), { waitUntil: "domcontentloaded" });
    console.log("Log in to GameBanana and complete any verification in the opened browser.");
    console.log("gitbanana will continue once the target edit form is reachable.");
    await page.locator('#Files input[type="file"]').first().waitFor({ state: "attached", timeout: 0 });
    storageStateJson = JSON.stringify(await context.storageState({ indexedDB: true }));
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }

  const encoded = gzipSync(Buffer.from(storageStateJson, "utf8")).toString("base64");
  if (options.output) {
    await mkdir(dirname(resolve(options.output)), { recursive: true });
    await writeFile(options.output, encoded, "utf8");
    console.log(`Wrote gzipped base64 storage state to ${options.output}`);
  } else {
    console.log(encoded);
  }
}

export async function verifyAuth(options: {
  submissionId: string;
  apiSection: string;
  pageSection: string;
  storageState: string;
  proxy?: ProxySettings;
}): Promise<void> {
  const { apiAuthCanReadSubmission, verifyStoredAuth } = await import("./publish.js");
  await apiAuthCanReadSubmission(options.storageState, options, options.submissionId, options.proxy);
  await verifyStoredAuth(options.storageState, options, options.submissionId, options.proxy);
  console.log(`Verified GameBanana API and edit-form access for submission ${options.submissionId}.`);
}

function parseCaptureOptions(args: string[]): CaptureOptions {
  const options: CaptureOptions = {
    submissionId: "",
    apiSection: "Mod",
    pageSection: "mods",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (!arg?.startsWith("--")) {
      throw new Error(`Unexpected argument ${JSON.stringify(arg)}.`);
    }

    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${arg} requires a value.`);
    }

    index += 1;
    if (arg === "--submission-id") options.submissionId = value;
    else if (arg === "--api-section") options.apiSection = value;
    else if (arg === "--page-section") options.pageSection = value;
    else if (arg === "--proxy") {
      const proxy = parseProxy(value);
      if (proxy) options.proxy = proxy;
    }
    else if (arg === "--output") options.output = value;
    else throw new Error(`Unknown option ${arg}.`);
  }

  if (!options.submissionId) {
    throw new Error("--submission-id is required.");
  }

  return options;
}

function parseVerifyAuthOptions(args: string[]): {
  submissionId: string;
  apiSection: string;
  pageSection: string;
  storageState: string;
  proxy?: ProxySettings;
} {
  const options: {
    submissionId: string;
    apiSection: string;
    pageSection: string;
    storageState: string;
    proxy?: ProxySettings;
  } = {
    submissionId: "",
    apiSection: "Mod",
    pageSection: "mods",
    storageState: "",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (!arg?.startsWith("--")) {
      throw new Error(`Unexpected argument ${JSON.stringify(arg)}.`);
    }

    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${arg} requires a value.`);
    }

    index += 1;
    if (arg === "--submission-id") options.submissionId = value;
    else if (arg === "--api-section") options.apiSection = value;
    else if (arg === "--page-section") options.pageSection = value;
    else if (arg === "--storage-state") options.storageState = value;
    else if (arg === "--proxy") {
      const proxy = parseProxy(value);
      if (proxy) options.proxy = proxy;
    }
    else throw new Error(`Unknown option ${arg}.`);
  }

  if (!options.submissionId) throw new Error("--submission-id is required.");
  if (!options.storageState) throw new Error("--storage-state is required.");
  return options;
}

function printHelp(): void {
  console.log(`Usage:
  gitbanana capture --submission-id <id> [--page-section mods] [--api-section Mod] [--proxy http://host:port] [--output secret.txt]
  gitbanana verify-auth --submission-id <id> --storage-state <path> [--api-section Mod] [--page-section mods] [--proxy http://host:port]

Commands:
  capture      Open a headed browser, verify GameBanana edit access, and emit storage-state-b64-gz.
  verify-auth  Verify stored GameBanana API and edit-form access without publishing.`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
