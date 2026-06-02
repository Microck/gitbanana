import { appendFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeStorageState, assertValidStorageStateJson, readActionInput } from "./inputs.js";

async function main(): Promise<void> {
  const storageStateJson = decodeStorageState(
    getInput("storage-state-b64"),
    getInput("storage-state-b64-gz"),
  );
  assertValidStorageStateJson(storageStateJson);

  const tempDir = await mkdtemp(join(tmpdir(), "gitbanana-"));
  const storageStatePath = join(tempDir, "storage-state.json");
  await writeFile(storageStatePath, storageStateJson, "utf8");

  const { publish } = await import("./publish.js");
  const output = await publish(readActionInput(getInput, storageStatePath));
  await setOutput("file-id", String(output.fileId));
  await setOutput("file-url", output.fileUrl);
  await setOutput("update-id", String(output.updateId));
  await setOutput("already-published", String(output.alreadyPublished));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`::error::${escapeWorkflowCommand(message)}`);
  process.exitCode = 1;
});

function getInput(name: string, options?: { required?: boolean }): string {
  const envName = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  const value = process.env[envName] ?? "";
  if (options?.required && !value.trim()) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

async function setOutput(name: string, value: string): Promise<void> {
  if (!process.env.GITHUB_OUTPUT) {
    console.log(`${name}=${value}`);
    return;
  }

  const delimiter = `gitbanana_${name.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`;
  await appendFile(process.env.GITHUB_OUTPUT, `${name}<<${delimiter}\n${value}\n${delimiter}\n`, "utf8");
}

function escapeWorkflowCommand(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}
