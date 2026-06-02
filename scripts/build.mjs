import { copyFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { build } from "esbuild";

await rm("dist", { recursive: true, force: true });
const require = createRequire(import.meta.url);

const shared = {
  bundle: true,
  platform: "node",
  target: "node24",
  sourcemap: false,
  packages: "bundle",
  external: ["chromium-bidi/*"],
};

await Promise.all([
  build({
    ...shared,
    format: "esm",
    entryPoints: ["src/action.ts"],
    outfile: "dist/index.js",
  }),
  build({
    ...shared,
    format: "cjs",
    banner: {
      js: "#!/usr/bin/env node",
    },
    entryPoints: ["src/cli.ts"],
    outfile: "dist/cli.cjs",
  }),
]);

const playwrightCoreRoot = dirname(require.resolve("playwright-core/package.json"));
await copyFile(join(playwrightCoreRoot, "browsers.json"), "browsers.json");
