import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertEditFormAvailable, promoteUploadedFileInList } from "../src/browser.js";

let browser: Awaited<ReturnType<typeof chromium.launch>>;

beforeAll(async () => {
  const executablePath = process.env.GITBANANA_CHROMIUM_EXECUTABLE;
  browser = await chromium.launch(
    executablePath ? { executablePath, headless: true } : { headless: true },
  );
});

afterAll(async () => {
  await browser?.close();
});

describe("browser helpers", () => {
  it("promotes the newest uploaded file row to the top", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <section id="Files">
        <ul id="Example_UploadedFiles">
          <li id="old"><input value="old.zip"></li>
          <li id="new"><input value="new.zip"></li>
        </ul>
      </section>
    `);

    await promoteUploadedFileInList(page, { previousFileCount: 1 });
    expect(await page.locator("#Example_UploadedFiles li").first().getAttribute("id")).toBe("new");
    await page.close();
  });

  it("promotes an existing file row by id", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <section id="Files">
        <ul id="Example_UploadedFiles">
          <li id="first"><a href="/files/10">first.zip</a></li>
          <li id="target"><a href="/files/20">target.zip</a></li>
        </ul>
      </section>
    `);

    await promoteUploadedFileInList(page, { file: { _idRow: 20, _sFile: "target.zip" } });
    expect(await page.locator("#Example_UploadedFiles li").first().getAttribute("id")).toBe("target");
    await page.close();
  });

  it("notifies GameBanana legacy jQuery handlers after promoting a file row", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <section id="Files">
        <ul id="Example_UploadedFiles">
          <li id="old"><input value="old.zip"></li>
          <li id="new"><input value="new.zip"></li>
        </ul>
        <script>
          window.triggeredEvents = [];
          window.jQuery = function () {
            return {
              trigger: function (eventName) {
                window.triggeredEvents.push(eventName);
                return this;
              }
            };
          };
        </script>
      </section>
    `);

    await promoteUploadedFileInList(page, { previousFileCount: 1 });
    await expect(page.evaluate(() => (window as unknown as { triggeredEvents: string[] }).triggeredEvents)).resolves.toEqual([
      "sortupdate",
      "change",
    ]);
    await page.close();
  });

  it("explains the GitHub runner egress failure mode when the edit form rejects auth", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <section id="EditFormModule">
        <div class="LogMessages">You must be user Microck</div>
      </section>
    `);

    await expect(assertEditFormAvailable(page)).rejects.toThrow("GitHub-hosted runner IP");
    await page.close();
  });

  it("accepts a real file input fixture without writing to GameBanana", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "gitbanana-test-"));
    const asset = join(tempDir, "asset.zip");
    await writeFile(asset, "fixture");

    const page = await browser.newPage();
    await page.setContent(`
      <section id="EditFormModule"></section>
      <section id="Files">
        <form>
          <input type="file">
          <button type="submit">Save</button>
          <ul id="Example_UploadedFiles"></ul>
          <div class="UploadMessage">Upload complete</div>
        </form>
      </section>
    `);
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(asset);
    expect(await fileInput.evaluate((input) => (input as HTMLInputElement).files?.[0]?.name)).toBe(
      "asset.zip",
    );
    await page.close();
  });
});
