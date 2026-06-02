import type {
  GameBananaFile,
  GameBananaRecordList,
  GameBananaSection,
  GameBananaUpdate,
} from "./types.js";

export const gameBananaOrigin = "https://gamebanana.com";

export function getUpdateRecords<T>(value: GameBananaRecordList<T>): T[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object" && Array.isArray(value._aRecords)) {
    return value._aRecords;
  }

  return [];
}

export function normalizedVersion(value: string | undefined): string {
  return String(value ?? "").replace(/^v/i, "");
}

export function collectFileRowIds(value: unknown, ids = new Set<number>()): Set<number> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectFileRowIds(item, ids);
    }
    return ids;
  }

  if (!value || typeof value !== "object") {
    return ids;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (/(?:row|file).*id|id.*(?:row|file)|rowid|fileid/i.test(key)) {
      addNumericId(nestedValue, ids);
    }

    collectFileRowIds(nestedValue, ids);
  }

  return ids;
}

export function updateFileRowIds(update: GameBananaUpdate | undefined): Set<number> {
  const ids = new Set<number>();

  if (Array.isArray(update?._aFileRowIds)) {
    for (const id of update._aFileRowIds) {
      addNumericId(id, ids);
    }
  }

  collectFileRowIds(update?._aFiles, ids);
  return ids;
}

export function findReleaseUpdate(
  updates: GameBananaRecordList<GameBananaUpdate>,
  releaseName: string,
  version: string,
): GameBananaUpdate | undefined {
  return getUpdateRecords(updates)
    .filter((update) => update && typeof update === "object")
    .filter((update) => update._sVersion === version || update._sName === releaseName)
    .sort((left, right) => Number(right._tsDateAdded ?? 0) - Number(left._tsDateAdded ?? 0))[0];
}

export function findFileById(
  files: GameBananaRecordList<GameBananaFile>,
  fileId: number,
): GameBananaFile | undefined {
  return getUpdateRecords(files).find((file) => Number(file?._idRow) === fileId);
}

export function releaseFileMatches(file: GameBananaFile | undefined, version: string): boolean {
  if (!file || typeof file !== "object") {
    return false;
  }

  if (file._sVersion && normalizedVersion(file._sVersion) === normalizedVersion(version)) {
    return true;
  }

  const normalizedFileName = String(file._sFile ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const normalizedRelease = normalizedVersion(version).toLowerCase().replace(/[^a-z0-9]+/g, "");
  return normalizedRelease.length > 0 && normalizedFileName.includes(normalizedRelease);
}

export function activeFileIdsInDisplayOrder(files: GameBananaRecordList<GameBananaFile>): number[] {
  return getUpdateRecords(files)
    .filter((file) => file && typeof file === "object")
    .filter((file) => file._bIsArchived !== true)
    .map((file) => Number(file._idRow))
    .filter((fileId) => Number.isFinite(fileId));
}

export function assertFirstActiveFile(
  files: GameBananaRecordList<GameBananaFile>,
  expectedFileId: number,
): void {
  const activeFileIds = activeFileIdsInDisplayOrder(files);
  if (activeFileIds[0] === expectedFileId) {
    return;
  }

  throw new Error(
    `GameBanana file ${expectedFileId} was uploaded, but active file order is ${activeFileIds.join(", ") || "(none)"}. Refusing to publish with the newest release hidden below older files.`,
  );
}

export function assertExistingUpdateLinkedToMatchingFile(
  update: GameBananaUpdate,
  files: GameBananaRecordList<GameBananaFile>,
  version: string,
): number {
  const linkedFileIds = [...updateFileRowIds(update)];
  const matchingLinkedFileId = linkedFileIds.find((fileId) =>
    releaseFileMatches(findFileById(files, fileId), version),
  );

  if (matchingLinkedFileId !== undefined) {
    return matchingLinkedFileId;
  }

  throw new Error(
    `GameBanana already has update ${update._idRow ?? "(unknown id)"} for ${version}, but it is linked to file IDs ${linkedFileIds.join(", ") || "(none)"} and none match the release. Fix the GameBanana update manually before rerunning gitbanana.`,
  );
}

export function fileUrl(fileId: number): string {
  return `${gameBananaOrigin}/mmdl/${fileId}`;
}

export function updateUrl(section: GameBananaSection, submissionId: string): string {
  return `${gameBananaOrigin}/apiv11/${section.apiSection}/${submissionId}/Update`;
}

export function updatesUrl(section: GameBananaSection, submissionId: string): string {
  return `${gameBananaOrigin}/apiv11/${section.apiSection}/${submissionId}/Updates`;
}

export function filesUrl(section: GameBananaSection, submissionId: string): string {
  return `${gameBananaOrigin}/apiv11/${section.apiSection}/${submissionId}/Files`;
}

export function editUrl(section: GameBananaSection, submissionId: string): string {
  return `${gameBananaOrigin}/${section.pageSection}/edit/${submissionId}`;
}

function addNumericId(value: unknown, ids: Set<number>): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    ids.add(value);
    return;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    ids.add(Number(value));
  }
}
