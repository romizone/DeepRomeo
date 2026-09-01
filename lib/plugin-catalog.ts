import type { CanvasKind, CanvasState, ComposerTool } from "./types";

export type PluginIconId =
  | "documents"
  | "presentations"
  | "pdf"
  | "spreadsheets"
  | "search"
  | "image";

export interface PluginItem {
  id: ComposerTool;
  title: string;
  description: string;
  icon: PluginIconId;
}

export const PLUGIN_CATALOG: PluginItem[] = [
  {
    id: "documents",
    title: "Documents",
    description: "Create and edit documents",
    icon: "documents",
  },
  {
    id: "presentations",
    title: "Presentations",
    description: "Create and edit presentations",
    icon: "presentations",
  },
  {
    id: "pdf",
    title: "PDF",
    description: "Read, create, and verify PDFs",
    icon: "pdf",
  },
  {
    id: "spreadsheets",
    title: "Spreadsheets",
    description: "Create and edit spreadsheets",
    icon: "spreadsheets",
  },
  {
    id: "search",
    title: "Web search",
    description: "Find news and real-time info",
    icon: "search",
  },
  {
    id: "image",
    title: "Create image",
    description: "Visualize anything",
    icon: "image",
  },
];

export const ARTIFACT_TOOLS: ComposerTool[] = [
  "documents",
  "presentations",
  "pdf",
  "spreadsheets",
  "canvas",
];

export function composerToolLabel(id: ComposerTool): string {
  const plugin = PLUGIN_CATALOG.find((p) => p.id === id);
  if (plugin) return plugin.title;
  if (id === "research") return "Deep research";
  if (id === "canvas") return "Canvas";
  if (id === "python") return "Python";
  return id;
}

export function isArtifactTool(id: ComposerTool): boolean {
  return ARTIFACT_TOOLS.includes(id);
}

export function artifactKindForTools(tools: ComposerTool[]): CanvasKind | null {
  if (tools.includes("presentations")) return "presentation";
  if (tools.includes("spreadsheets")) return "spreadsheet";
  if (tools.includes("pdf")) return "pdf";
  if (tools.includes("documents") || tools.includes("canvas")) return "document";
  return null;
}

export function placeholderCanvasForTools(tools: ComposerTool[]): Omit<CanvasState, "id"> | null {
  const kind = artifactKindForTools(tools);
  if (kind === "presentation") {
    return { title: "Presentation", language: "slides", kind, content: "", slides: [] };
  }
  if (kind === "spreadsheet") {
    return { title: "Spreadsheet", language: "csv", kind, content: "", sheet: { headers: ["Column 1"], rows: [[""]] } };
  }
  if (kind === "pdf") {
    return { title: "PDF", language: "pdf", kind, content: "" };
  }
  if (kind === "document") {
    return { title: "Document", language: "markdown", kind, content: "" };
  }
  return null;
}
