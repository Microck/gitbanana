import { mkdir, writeFile } from "node:fs/promises";
import type { Locator, Page } from "playwright";
import { editUrl } from "./gamebanana.js";
import type { GameBananaFile, GameBananaSection } from "./types.js";

export async function openEditFileManager(
  page: Page,
  section: GameBananaSection,
  submissionId: string,
): Promise<Locator> {
  await page.goto(editUrl(section, submissionId), { waitUntil: "domcontentloaded" });
  await assertEditFormAvailable(page);

  const mediaTab = page.getByText(/^media$/i).first();
  if (await mediaTab.isVisible().catch(() => false)) {
    await mediaTab.click();
  }

  const fileInput = page.locator('#Files input[type="file"]').first();
  await fileInput.waitFor({ state: "attached", timeout: 20_000 });
  return fileInput;
}

export async function assertEditFormAvailable(page: Page): Promise<void> {
  const permissionMessages = page.locator("#EditFormModule .LogMessages").first();
  if (await permissionMessages.isVisible().catch(() => false)) {
    const message = await permissionMessages.innerText();
    throw new Error(`GameBanana edit form is not available: ${message}`);
  }
}

export async function uploadReleaseAsset(
  page: Page,
  section: GameBananaSection,
  submissionId: string,
  assetPath: string,
): Promise<void> {
  const fileInput = await openEditFileManager(page, section, submissionId);
  const uploadedFileCount = await page.locator('#Files [id$="_UploadedFiles"] li').count();
  await fileInput.setInputFiles(assetPath);

  await page.waitForFunction(
    (previousCount) =>
      document.querySelectorAll('#Files [id$="_UploadedFiles"] li').length > previousCount &&
      document.querySelector("#Files .UploadMessage")?.textContent?.includes("Upload complete"),
    uploadedFileCount,
    { timeout: 120_000 },
  );

  await promoteNewestUploadedFile(page, uploadedFileCount);
  await submitFileManager(page, fileInput);
}

export async function promoteExistingReleaseFile(
  page: Page,
  section: GameBananaSection,
  submissionId: string,
  file: GameBananaFile,
): Promise<void> {
  const fileInput = await openEditFileManager(page, section, submissionId);
  await promoteUploadedFileInList(page, { file });
  await submitFileManager(page, fileInput);
}

export async function promoteNewestUploadedFile(
  page: Page,
  previousFileCount: number,
): Promise<{ fileName: string; previousIndex: number }> {
  return promoteUploadedFileInList(page, { previousFileCount });
}

export async function promoteUploadedFileInList(
  page: Page,
  target: { previousFileCount: number } | { file: GameBananaFile },
): Promise<{ fileName: string; previousIndex: number }> {
  return page.evaluate((target) => {
    function promoteUploadedListItem(list: Element, uploadedItem: Element) {
      const items: Element[] = Array.from(list.querySelectorAll("li"));
      const previousIndex = items.indexOf(uploadedItem);
      const fileName =
        uploadedItem.querySelector("[title]")?.getAttribute("title") ??
        uploadedItem.querySelector("input[type='hidden'][value]")?.getAttribute("value") ??
        uploadedItem.textContent?.replace(/\s+/g, " ").trim() ??
        "(unknown)";

      if (previousIndex > 0) {
        list.insertBefore(uploadedItem, list.firstElementChild);
      }

      list.dispatchEvent(new Event("input", { bubbles: true }));
      list.dispatchEvent(new Event("change", { bubbles: true }));
      list.dispatchEvent(new CustomEvent("sortupdate", { bubbles: true }));

      const maybeWindow = globalThis as typeof globalThis & {
        jQuery?: (element: Element) => { trigger: (eventName: string) => { trigger: (eventName: string) => unknown } };
      };
      if (maybeWindow.jQuery) {
        maybeWindow.jQuery(list).trigger("sortupdate").trigger("change");
      }

      const firstItem = list.querySelector("li");
      if (firstItem !== uploadedItem) {
        throw new Error("GameBanana uploaded file could not be moved to the top of the upload list.");
      }

      return { fileName, previousIndex };
    }

    const list = document.querySelector('#Files [id$="_UploadedFiles"]');
    if (!list) {
      throw new Error("GameBanana uploaded-files list is missing.");
    }

    const items = Array.from(list.querySelectorAll("li"));
    let uploadedItem: Element | undefined;

    if ("previousFileCount" in target) {
      if (items.length <= target.previousFileCount) {
        throw new Error(
          `GameBanana uploaded-files list has ${items.length} rows, expected more than ${target.previousFileCount}.`,
        );
      }

      // GameBanana appends uploads to the editable list, but the public file
      // order follows this list. Move the new row to the top before submit.
      uploadedItem = items.slice(target.previousFileCount).at(-1);
    } else {
      const fileId = String(target.file?._idRow ?? "");
      const fileName = String(target.file?._sFile ?? "");
      uploadedItem = items.find((item) => {
        const values = [
          item.id,
          item.textContent,
          ...Array.from(item.querySelectorAll("[href], [src], [value], [name], [id]")).flatMap(
            (element) => [
              element.getAttribute("href"),
              element.getAttribute("src"),
              element.getAttribute("value"),
              element.getAttribute("name"),
              element.getAttribute("id"),
            ],
          ),
        ]
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim());

        return (
          values.some((value) => value.includes(fileId)) ||
          (fileName.length > 0 && values.some((value) => value.includes(fileName)))
        );
      });

      if (!uploadedItem) {
        throw new Error(`Could not find GameBanana file row ${fileId || fileName} in upload list.`);
      }
    }

    if (!uploadedItem) {
      throw new Error("Could not identify uploaded GameBanana file row.");
    }

    return promoteUploadedListItem(list, uploadedItem);
  }, target);
}

export async function captureDebugArtifact(
  page: Page,
  debugDir: string | undefined,
  label: string,
  secrets: string[],
): Promise<void> {
  if (!debugDir) {
    return;
  }

  await mkdir(debugDir, { recursive: true });
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const [title, html, text] = await Promise.all([
    page.title().catch(() => ""),
    page.content().catch(() => ""),
    page.locator("body").innerText({ timeout: 2_000 }).catch(() => ""),
  ]);

  await writeFile(
    `${debugDir}/${slug}-summary.json`,
    JSON.stringify(
      {
        label,
        url: page.url(),
        title,
        bodyExcerpt: redactKnownSecrets(text.replace(/\s+/g, " ").trim(), secrets).slice(0, 500),
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(`${debugDir}/${slug}.html`, redactKnownSecrets(html, secrets), "utf8");
  await page.screenshot({ path: `${debugDir}/${slug}.png`, fullPage: true }).catch(() => undefined);
}

async function submitFileManager(page: Page, fileInput: Locator): Promise<void> {
  const uploadForm = page.locator("form", { has: fileInput }).first();
  const submitButton = uploadForm.locator('button[type="submit"], input[type="submit"]').last();
  await submitButton.waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(2_000);
  await Promise.all([page.waitForLoadState("networkidle").catch(() => undefined), submitButton.click()]);
}

function redactKnownSecrets(value: string, secrets: string[]): string {
  let redacted = value;
  for (const secret of secrets) {
    if (secret) {
      redacted = redacted.replaceAll(secret, "[secret]");
    }
  }
  return redacted;
}
