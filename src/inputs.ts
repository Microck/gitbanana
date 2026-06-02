import { gunzipSync } from "node:zlib";
import type { PublishInput } from "./types.js";

export type ActionInputReader = (name: string, options?: { required?: boolean }) => string;

export function requiredText(name: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${name} is required.`);
  }
  return trimmed;
}

export function optionalText(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function decodeStorageState(
  plainBase64: string | undefined,
  gzipBase64: string | undefined,
): string {
  const hasPlain = Boolean(plainBase64?.trim());
  const hasGzip = Boolean(gzipBase64?.trim());

  if (hasPlain && hasGzip) {
    throw new Error("Set only one of storage-state-b64 or storage-state-b64-gz.");
  }

  if (hasGzip) {
    return gunzipSync(Buffer.from(requiredText("storage-state-b64-gz", gzipBase64 ?? ""), "base64"))
      .toString("utf8");
  }

  if (hasPlain) {
    return Buffer.from(requiredText("storage-state-b64", plainBase64 ?? ""), "base64").toString(
      "utf8",
    );
  }

  throw new Error("storage-state-b64-gz or storage-state-b64 is required.");
}

export function assertValidStorageStateJson(value: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(
      `Playwright storage state must be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Playwright storage state must be a JSON object.");
  }

  const candidate = parsed as { cookies?: unknown; origins?: unknown };
  if (!Array.isArray(candidate.cookies) || !Array.isArray(candidate.origins)) {
    throw new Error("Playwright storage state must include cookies and origins arrays.");
  }
}

export function readActionInput(getInput: ActionInputReader, storageStatePath: string): PublishInput {
  const releaseTag = requiredText("release-tag", getInput("release-tag", { required: true }));
  const releaseName = optionalText(getInput("release-name"), releaseTag);

  return {
    submissionId: requiredText("submission-id", getInput("submission-id", { required: true })),
    asset: requiredText("asset", getInput("asset", { required: true })),
    releaseTag,
    releaseName,
    releaseNotes: requiredText("release-notes", getInput("release-notes", { required: true })),
    storageStatePath,
    apiSection: optionalText(getInput("api-section"), "Mod"),
    pageSection: optionalText(getInput("page-section"), "mods"),
    browser: parseBrowser(optionalText(getInput("browser"), "cloakbrowser")),
    debugDir: optionalText(getInput("debug-dir"), ""),
  };
}

function parseBrowser(value: string): "cloakbrowser" | "chromium" {
  if (value !== "cloakbrowser" && value !== "chromium") {
    throw new Error(
      `Unsupported browser ${JSON.stringify(value)}. Supported values are cloakbrowser and chromium.`,
    );
  }
  return value;
}
