export type GameBananaSection = {
  apiSection: string;
  pageSection: string;
};

export type PublishInput = GameBananaSection & {
  submissionId: string;
  asset: string;
  releaseTag: string;
  releaseName: string;
  releaseNotes: string;
  storageStatePath: string;
  browser: "cloakbrowser" | "chromium";
  proxy?: ProxySettings;
  debugDir?: string;
};

export type PublishOutput = {
  fileId: number;
  fileUrl: string;
  updateId: number;
  alreadyPublished: boolean;
};

export type GameBananaRecordList<T> = T[] | { _aRecords?: T[] };

export type GameBananaFile = {
  _idRow?: number | string;
  _sFile?: string;
  _sVersion?: string;
  _bIsArchived?: boolean;
  _tsDateAdded?: number | string;
  _aFiles?: unknown;
  _aFileRowIds?: unknown;
};

export type GameBananaUpdate = {
  _idRow?: number | string;
  _sName?: string;
  _sVersion?: string;
  _tsDateAdded?: number | string;
  _aFiles?: unknown;
  _aFileRowIds?: unknown;
};

export type ChangeLogEntry = {
  text: string;
  cat: "Addition" | "Adjustment" | "BugFix" | "Improvement" | "Removal";
};

export type ProxySettings = {
  server: string;
  bypass?: string;
  username?: string;
  password?: string;
};
