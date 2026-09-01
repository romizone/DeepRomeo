export type Mode = "chat" | "work";
export type ModelId = "flash" | "vision" | "pro";
export type Role = "user" | "assistant" | "system" | "tool";

export type ToolName =
  | "web_search"
  | "deep_research"
  | "python"
  | "open_canvas"
  | "update_canvas"
  | "generate_image"
  | "create_document"
  | "update_document"
  | "create_presentation"
  | "update_slide"
  | "add_slide"
  | "create_spreadsheet"
  | "update_spreadsheet"
  | "create_pdf"
  | "read_pdf"
  | "verify_pdf"
  | "create_plan"
  | "update_plan"
  | "request_permission"
  | "submit_deliverable"
  | "remember"
  | "recall_memory";

export type ComposerTool =
  | "search"
  | "canvas"
  | "python"
  | "research"
  | "image"
  | "documents"
  | "presentations"
  | "pdf"
  | "spreadsheets";

export type CanvasKind = "document" | "code" | "presentation" | "spreadsheet" | "pdf";

export interface Slide {
  id: string;
  title: string;
  bullets: string[];
  notes?: string;
}

export interface SpreadsheetData {
  headers: string[];
  rows: string[][];
}

export interface SearchSource {
  title: string;
  url: string;
  snippet?: string;
}

export interface GeneratedFile {
  name: string;
  url: string;
  mime: string;
}

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  url: string;
  kind: "image" | "file";
  text?: string;
}

export interface ToolCallUI {
  id: string;
  name: string;
  status: "running" | "done" | "error";
  input?: unknown;
  output?: unknown;
}

export interface CanvasState {
  id: string;
  title: string;
  language: string;
  content: string;
  kind: CanvasKind;
  slides?: Slide[];
  sheet?: SpreadsheetData;
  fileUrl?: string;
  fileName?: string;
}

export interface PlanStep {
  id: string;
  title: string;
  status: "pending" | "running" | "done" | "blocked";
  detail?: string;
}

export interface PlanState {
  title: string;
  steps: PlanStep[];
}

export interface PermissionRequest {
  id: string;
  action: string;
  detail: string;
  status: "pending" | "approved" | "denied";
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  thinking?: string;
  thinkingMs?: number;
  toolCalls?: ToolCallUI[];
  images?: string[];
  files?: GeneratedFile[];
  sources?: SearchSource[];
  attachments?: Attachment[];
  canvas?: CanvasState;
  plan?: PlanState;
  permission?: PermissionRequest;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  mode: Mode;
  model: ModelId;
  skillId?: string | null;
  projectId?: string | null;
  temporary?: boolean;
  pinned?: boolean;
  archived?: boolean;
  messages: Message[];
  canvas?: CanvasState | null;
  plan?: PlanState | null;
  deliverable?: { title: string; html?: string; markdown?: string } | null;
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  id: string;
  name: string;
  instructions: string;
  createdAt: number;
}

export interface MemoryItem {
  id: string;
  content: string;
  createdAt: number;
}

export interface Skill {
  id: string;
  slug: string;
  name: string;
  description: string;
  instructions: string;
  tools: ComposerTool[];
  icon: string;
  builtin: boolean;
}

export interface Plugin {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  manifest: {
    functions: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    }[];
  };
}

export interface McpServer {
  id: string;
  name: string;
  transport: "stdio" | "sse";
  command?: string;
  args?: string;
  url?: string;
  enabled: boolean;
}

export interface AppSettings {
  theme: "system" | "light" | "dark";
  memoryEnabled: boolean;
  spokenLanguage: string;
}

export const MODELS: {
  id: ModelId;
  name: string;
  tag: string;
  description: string;
}[] = [
  {
    id: "flash",
    name: "DeepRomeo Flash",
    tag: "Fast",
    description: "Instant answers for everyday questions",
  },
  {
    id: "vision",
    name: "DeepRomeo Vision",
    tag: "Vision",
    description: "Reads images, screenshots, and diagrams",
  },
  {
    id: "pro",
    name: "DeepRomeo Pro",
    tag: "Pro",
    description: "Deep reasoning for complex work",
  },
];
