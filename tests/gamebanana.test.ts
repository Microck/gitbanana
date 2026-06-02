import { describe, expect, it } from "vitest";
import {
  activeFileIdsInDisplayOrder,
  assertExistingUpdateLinkedToMatchingFile,
  assertFirstActiveFile,
  fileUrl,
  findReleaseUpdate,
  releaseFileMatches,
} from "../src/gamebanana.js";

describe("GameBanana record helpers", () => {
  it("finds the newest matching release update", () => {
    expect(
      findReleaseUpdate(
        {
          _aRecords: [
            { _idRow: 1, _sName: "Old", _sVersion: "1.0.0", _tsDateAdded: 1 },
            { _idRow: 2, _sName: "Release v1.0.0", _sVersion: "1.0.0", _tsDateAdded: 2 },
          ],
        },
        "Release v1.0.0",
        "1.0.0",
      )?._idRow,
    ).toBe(2);
  });

  it("matches release files by version or filename", () => {
    expect(releaseFileMatches({ _sVersion: "v1.2.3" }, "1.2.3")).toBe(true);
    expect(releaseFileMatches({ _sFile: "Example-v1.2.3.zip" }, "1.2.3")).toBe(true);
  });

  it("keeps only active file ids in display order", () => {
    expect(
      activeFileIdsInDisplayOrder([
        { _idRow: 10 },
        { _idRow: 9, _bIsArchived: true },
        { _idRow: "8" },
      ]),
    ).toEqual([10, 8]);
  });

  it("fails when rerun update is linked to the wrong file", () => {
    expect(() =>
      assertExistingUpdateLinkedToMatchingFile(
        { _idRow: 4, _aFileRowIds: [10], _sVersion: "1.2.3" },
        [{ _idRow: 10, _sVersion: "1.0.0" }],
        "1.2.3",
      ),
    ).toThrow("Fix the GameBanana update manually");
  });

  it("asserts first active file and builds public file URL", () => {
    expect(() => assertFirstActiveFile([{ _idRow: 12 }, { _idRow: 11 }], 11)).toThrow(
      "active file order is 12, 11",
    );
    expect(fileUrl(123)).toBe("https://gamebanana.com/mmdl/123");
  });
});
