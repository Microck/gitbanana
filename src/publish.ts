import { stat } from "node:fs/promises";
import { request as playwrightRequest, chromium, type BrowserContext } from "playwright";
import { uploadReleaseAsset, captureDebugArtifact, promoteExistingReleaseFile } from "./browser.js";
import {
  activeFileIdsInDisplayOrder,
  assertExistingUpdateLinkedToMatchingFile,
  assertFirstActiveFile,
  fileUrl,
  filesUrl,
  findFileById,
  findReleaseUpdate,
  gameBananaOrigin,
  updateFileRowIds,
  updatesUrl,
  updateUrl,
} from "./gamebanana.js";
import { markdownToGameBananaHtml, parseChangeLog } from "./release-notes.js";
import { ensureChromiumInstalled } from "./playwright-install.js";
import type {
  GameBananaFile,
  GameBananaRecordList,
  GameBananaUpdate,
  PublishInput,
  PublishOutput,
  ProxySettings,
} from "./types.js";

type RequestLike = {
  fetch: (
    url: string,
    options?: {
      method?: string;
      headers?: Record<string, string>;
      data?: unknown;
    },
  ) => Promise<{
    ok: () => boolean;
    status: () => number;
    text: () => Promise<string>;
  }>;
};

export async function publish(input: PublishInput): Promise<PublishOutput> {
  await stat(input.asset);
  await ensureBrowserInstalled(input.browser);

  const version = input.releaseTag.replace(/^v/i, "");
  const browserSession = await createBrowserSession(input.browser, input.storageStatePath, input.proxy);
  const { context } = browserSession;
  const page = await context.newPage();

  try {
    const existingUpdates = await fetchJson<GameBananaRecordList<GameBananaUpdate>>(
      context.request,
      updatesUrl(input, input.submissionId),
    );
    const existingUpdate = findReleaseUpdate(existingUpdates, input.releaseName, version);

    if (existingUpdate) {
      const files = await fetchJson<GameBananaRecordList<GameBananaFile>>(
        context.request,
        filesUrl(input, input.submissionId),
      );
      const existingFileId = assertExistingUpdateLinkedToMatchingFile(existingUpdate, files, version);
      const existingFile = findFileById(files, existingFileId);
      if (existingFile?._bIsArchived === true) {
        throw new Error(
          `GameBanana update ${existingUpdate._idRow ?? "(unknown id)"} is linked to archived file ${existingFileId}. Unarchive or fix it manually before rerunning gitbanana.`,
        );
      }
      if (!existingFile) {
        throw new Error(
          `GameBanana update ${existingUpdate._idRow ?? "(unknown id)"} is linked to missing file ${existingFileId}. Fix the GameBanana update manually before rerunning gitbanana.`,
        );
      }

      if (activeFileIdsInDisplayOrder(files)[0] !== existingFileId) {
        try {
          await promoteExistingReleaseFile(page, input, input.submissionId, existingFile);
        } catch (error) {
          await captureDebugArtifact(page, input.debugDir, "gamebanana-promote-existing-file-failed", [
            input.storageStatePath,
          ]);
          throw error;
        }
        await waitForFirstActiveFile(context.request, input, input.submissionId, existingFileId);
      }

      return {
        fileId: existingFileId,
        fileUrl: fileUrl(existingFileId),
        updateId: numericId(existingUpdate._idRow, "GameBanana update id"),
        alreadyPublished: true,
      };
    }

    const beforeFiles = await fetchJson<GameBananaRecordList<GameBananaFile>>(
      context.request,
      filesUrl(input, input.submissionId),
    );
    const beforeIds = new Set(activeFileIdsInDisplayOrder(beforeFiles));

    try {
      await uploadReleaseAsset(page, input, input.submissionId, input.asset);
    } catch (error) {
      await captureDebugArtifact(page, input.debugDir, "gamebanana-upload-failed", [
        input.storageStatePath,
      ]);
      throw error;
    }

    const uploadedFileId = await waitForUploadedFileId(
      context.request,
      input,
      input.submissionId,
      beforeIds,
    );

    await waitForFirstActiveFile(context.request, input, input.submissionId, uploadedFileId);
    await publishReleaseUpdate(context.request, input, version, uploadedFileId);
    const update = await waitForLinkedReleaseUpdate(
      context.request,
      input,
      input.submissionId,
      input.releaseName,
      version,
      uploadedFileId,
    );
    await waitForFirstActiveFile(context.request, input, input.submissionId, uploadedFileId);

    return {
      fileId: uploadedFileId,
      fileUrl: fileUrl(uploadedFileId),
      updateId: numericId(update._idRow, "GameBanana update id"),
      alreadyPublished: false,
    };
  } finally {
    await context.close().catch(() => undefined);
    await browserSession.close().catch(() => undefined);
  }
}

export async function fetchJson<T>(request: RequestLike, url: string, options = {}): Promise<T> {
  const response = await request.fetch(url, {
    ...options,
    headers: {
      accept: "application/json",
      ...("headers" in options && typeof options.headers === "object" ? options.headers : {}),
    },
  });

  const text = await response.text();
  if (!response.ok()) {
    throw new Error(`${"method" in options ? options.method : "GET"} ${url} failed with ${response.status()}: ${text}`);
  }

  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${url} returned non-JSON response: ${text.slice(0, 500)}`);
  }

  if (payload && typeof payload === "object" && "_sErrorCode" in payload) {
    throw new Error(`${url} returned GameBanana error: ${JSON.stringify(payload)}`);
  }

  return payload as T;
}

async function publishReleaseUpdate(
  request: RequestLike,
  input: PublishInput,
  version: string,
  fileId: number,
): Promise<void> {
  await fetchJson(request, updateUrl(input, input.submissionId), {
    method: "POST",
    data: {
      _aChangeLog: parseChangeLog(input.releaseNotes, input.releaseTag),
      _aFileRowIds: [fileId],
      _sName: input.releaseName,
      _sVersion: version,
      _sText: markdownToGameBananaHtml(input.releaseNotes),
    },
  });
}

async function waitForUploadedFileId(
  request: RequestLike,
  input: PublishInput,
  submissionId: string,
  beforeIds: Set<number>,
): Promise<number> {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const files = await fetchJson<GameBananaRecordList<GameBananaFile>>(
      request,
      filesUrl(input, submissionId),
    );
    const newIds = activeFileIdsInDisplayOrder(files).filter((id) => !beforeIds.has(id));
    if (newIds.length > 0) {
      return Math.max(...newIds);
    }
    await delay(5_000);
  }

  throw new Error("Could not determine the GameBanana file row id for the uploaded asset.");
}

async function waitForFirstActiveFile(
  request: RequestLike,
  input: PublishInput,
  submissionId: string,
  expectedFileId: number,
): Promise<void> {
  let files: GameBananaRecordList<GameBananaFile> = [];
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    files = await fetchJson(request, filesUrl(input, submissionId));
    if (activeFileIdsInDisplayOrder(files)[0] === expectedFileId) {
      return;
    }
    await delay(5_000);
  }

  assertFirstActiveFile(files, expectedFileId);
}

async function waitForLinkedReleaseUpdate(
  request: RequestLike,
  input: PublishInput,
  submissionId: string,
  releaseName: string,
  version: string,
  fileId: number,
): Promise<GameBananaUpdate> {
  let releaseUpdate: GameBananaUpdate | undefined;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const updates = await fetchJson<GameBananaRecordList<GameBananaUpdate>>(
      request,
      updatesUrl(input, submissionId),
    );
    releaseUpdate = findReleaseUpdate(updates, releaseName, version);
    if (releaseUpdate && updateFileRowIds(releaseUpdate).has(fileId)) {
      return releaseUpdate;
    }

    await delay(5_000);
  }

  if (!releaseUpdate) {
    throw new Error(
      `GameBanana did not expose update ${JSON.stringify(releaseName)} or version ${JSON.stringify(version)} after publishing.`,
    );
  }

  const linkedFileIds = [...updateFileRowIds(releaseUpdate)].sort((left, right) => left - right);
  throw new Error(
    `GameBanana update ${releaseUpdate._idRow ?? "(unknown id)"} is linked to file IDs ${linkedFileIds.join(", ") || "(none)"} instead of uploaded file ${fileId}.`,
  );
}

export async function verifyStoredAuth(
  storageStatePath: string,
  section: { apiSection: string; pageSection: string },
  submissionId: string,
  proxy?: ProxySettings,
): Promise<void> {
  await ensureChromiumInstalled();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: storageStatePath,
    ...(proxy ? { proxy } : {}),
  });
  const page = await context.newPage();
  try {
    await page.goto(`${gameBananaOrigin}/${section.pageSection}/edit/${submissionId}`, {
      waitUntil: "domcontentloaded",
    });
    const fileInput = page.locator('#Files input[type="file"]').first();
    await fileInput.waitFor({ state: "attached", timeout: 60_000 });
  } finally {
    await context.storageState({ path: storageStatePath });
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function ensureBrowserInstalled(browserName: PublishInput["browser"]): Promise<void> {
  if (browserName === "cloakbrowser") {
    const { ensureBinary } = await import("cloakbrowser");
    await ensureBinary();
    return;
  }

  await ensureChromiumInstalled();
}

async function createBrowserSession(
  browserName: PublishInput["browser"],
  storageStatePath: string,
  proxy: ProxySettings | undefined,
): Promise<{ context: BrowserContext; close: () => Promise<void> }> {
  const contextOptions = { storageState: storageStatePath, ...(proxy ? { proxy } : {}) };
  if (browserName === "cloakbrowser") {
    const { launchContext } = await import("cloakbrowser");
    const context = await launchContext({
      headless: true,
      humanize: true,
      ...(proxy ? { proxy } : {}),
      contextOptions: { storageState: storageStatePath },
    });
    return { context, close: () => context.close() };
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(contextOptions);
  return { context, close: () => browser.close() };
}

export async function apiAuthCanReadSubmission(
  storageStatePath: string,
  section: { apiSection: string },
  submissionId: string,
  proxy?: ProxySettings,
): Promise<void> {
  const request = await playwrightRequest.newContext({
    storageState: storageStatePath,
    ...(proxy ? { proxy } : {}),
  });
  try {
    await fetchJson(request, filesUrl({ ...section, pageSection: "mods" }, submissionId));
  } finally {
    await request.dispose();
  }
}

function numericId(value: number | string | undefined, label: string): number {
  const id = Number(value);
  if (!Number.isFinite(id)) {
    throw new Error(`${label} is missing or not numeric.`);
  }
  return id;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
