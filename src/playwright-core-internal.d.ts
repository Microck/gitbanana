declare module "playwright-core/lib/server/registry/index.js" {
  export function installBrowsersForNpmInstall(browsers: string[]): Promise<void>;
}
