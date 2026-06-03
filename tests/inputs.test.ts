import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  assertValidStorageStateJson,
  decodeStorageState,
  parseProxy,
  readActionInput,
} from "../src/inputs.js";

const storageState = JSON.stringify({ cookies: [], origins: [] });

describe("input handling", () => {
  it("decodes gzip-compressed storage state", () => {
    const encoded = gzipSync(Buffer.from(storageState)).toString("base64");
    expect(decodeStorageState(undefined, encoded)).toBe(storageState);
  });

  it("rejects cookie-like JSON that is not Playwright storage state", () => {
    expect(() => assertValidStorageStateJson(JSON.stringify({ cookies: [] }))).toThrow(
      "cookies and origins arrays",
    );
  });

  it("rejects ambiguous auth inputs", () => {
    expect(() => decodeStorageState("e30=", "e30=")).toThrow("Set only one");
  });

  it("reads action inputs with defaults", () => {
    const values = new Map([
      ["submission-id", "123"],
      ["asset", "mod.zip"],
      ["release-tag", "v1.0.0"],
      ["release-notes", "notes"],
    ]);

    const input = readActionInput((name) => values.get(name) ?? "", "/tmp/state.json");
    expect(input).toMatchObject({
      submissionId: "123",
      asset: "mod.zip",
      releaseTag: "v1.0.0",
      releaseName: "v1.0.0",
      apiSection: "Mod",
      pageSection: "mods",
      browser: "cloakbrowser",
    });
    expect(input).not.toHaveProperty("proxy");
  });

  it("parses proxy URLs without leaking credentials through the server field", () => {
    expect(parseProxy("http://user:p%40ss@example.com:8080")).toEqual({
      server: "http://example.com:8080",
      username: "user",
      password: "p@ss",
    });
  });

  it("accepts Playwright short proxy form", () => {
    expect(parseProxy("example.com:8080")).toEqual({
      server: "example.com:8080",
    });
  });

  it("rejects unsupported proxy protocols", () => {
    expect(() => parseProxy("ftp://example.com:21")).toThrow("Unsupported proxy protocol");
  });
});
