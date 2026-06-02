import type { ChangeLogEntry } from "./types.js";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function markdownToGameBananaHtml(markdown: string): string {
  const html: string[] = [];
  let listOpen = false;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line) {
      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }
      continue;
    }

    const heading = line.match(/^#{2,6}\s+(.*)$/);
    if (heading?.[1]) {
      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }
      html.push(`<h3>${escapeHtml(heading[1])}</h3>`);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet?.[1]) {
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${escapeHtml(bullet[1])}</li>`);
      continue;
    }

    if (listOpen) {
      html.push("</ul>");
      listOpen = false;
    }
    html.push(`<p>${escapeHtml(line)}</p>`);
  }

  if (listOpen) {
    html.push("</ul>");
  }

  return html.join("\n");
}

export function parseChangeLog(markdown: string, releaseTag: string): ChangeLogEntry[] {
  const entries: ChangeLogEntry[] = [];
  let currentCategory: ChangeLogEntry["cat"] = "Adjustment";

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    const heading = line.match(/^#{2,6}\s+(.*)$/);
    if (heading?.[1]) {
      currentCategory = categoryForHeading(heading[1]);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet?.[1]) {
      entries.push({
        text: bullet[1].replace(/\s+/g, " ").trim(),
        cat: currentCategory,
      });
    }
  }

  return entries.length > 0 ? entries : [{ text: `Published ${releaseTag}.`, cat: "Addition" }];
}

function categoryForHeading(heading: string): ChangeLogEntry["cat"] {
  const normalized = heading.toLowerCase();
  if (normalized.includes("fix")) return "BugFix";
  if (normalized.includes("remove")) return "Removal";
  if (normalized.includes("add")) return "Addition";
  if (normalized.includes("change") || normalized.includes("improve")) return "Improvement";
  return "Adjustment";
}
