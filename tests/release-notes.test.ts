import { describe, expect, it } from "vitest";
import { markdownToGameBananaHtml, parseChangeLog } from "../src/release-notes.js";

describe("release notes conversion", () => {
  it("renders the supported markdown subset with escaped text", () => {
    expect(
      markdownToGameBananaHtml(`## Added
- New timer <mode>
- Better "reset"

Plain & direct.`),
    ).toMatchInlineSnapshot(`
      "<h3>Added</h3>
      <ul>
      <li>New timer &lt;mode&gt;</li>
      <li>Better &quot;reset&quot;</li>
      </ul>
      <p>Plain &amp; direct.</p>"
    `);
  });

  it("maps heading groups to GameBanana changelog categories", () => {
    expect(
      parseChangeLog(`## Added
- Practice menu

## Fixed
- Crash on save

## Removed
- Old link`, "v1.2.3"),
    ).toEqual([
      { cat: "Addition", text: "Practice menu" },
      { cat: "BugFix", text: "Crash on save" },
      { cat: "Removal", text: "Old link" },
    ]);
  });

  it("falls back when notes contain no bullet entries", () => {
    expect(parseChangeLog("Published manually.", "v1.2.3")).toEqual([
      { cat: "Addition", text: "Published v1.2.3." },
    ]);
  });
});
