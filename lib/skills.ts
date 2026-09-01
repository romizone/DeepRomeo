import type { ComposerTool, Skill } from "./types";

export const BUILTIN_SKILLS: Skill[] = [
  {
    id: "skill-writing",
    slug: "writer",
    name: "Writer",
    description: "Draft emails, posts, and long-form copy",
    icon: "pen",
    builtin: true,
    tools: ["documents", "canvas"],
    instructions:
      "You are a world-class writing partner. Help with tone, structure, and edits. Prefer create_document for anything longer than a few paragraphs.",
  },
  {
    id: "skill-coding",
    slug: "coding",
    name: "Coding",
    description: "Write, debug, and explain code",
    icon: "code",
    builtin: true,
    tools: ["python", "canvas"],
    instructions:
      "You are a senior software engineer. Write correct, well-commented code. Use canvas for files and python to verify behavior when useful.",
  },
  {
    id: "skill-data",
    slug: "data-analyst",
    name: "Data analyst",
    description: "Analyze spreadsheets and visualize data",
    icon: "chart",
    builtin: true,
    tools: ["spreadsheets", "python", "canvas"],
    instructions:
      "You are a data analyst. Use create_spreadsheet for tables and python for calculations. Explain findings clearly with tables and takeaways.",
  },
  {
    id: "skill-research",
    slug: "research",
    name: "Research",
    description: "Search the web and cite sources",
    icon: "search",
    builtin: true,
    tools: ["search", "research", "canvas"],
    instructions:
      "You are a research assistant. Always search before answering time-sensitive questions. Cite sources with titles and URLs.",
  },
  {
    id: "skill-tutor",
    slug: "tutor",
    name: "Tutor",
    description: "Explain concepts step by step",
    icon: "book",
    builtin: true,
    tools: ["canvas", "python"],
    instructions:
      "You are a patient tutor. Break ideas into steps, check understanding, and offer practice problems.",
  },
  {
    id: "skill-image",
    slug: "image-gen",
    name: "Image generator",
    description: "Create images from a description",
    icon: "image",
    builtin: true,
    tools: ["image"],
    instructions:
      "You generate images from detailed prompts. Ask a clarifying question only if the request is extremely vague, then call generate_image.",
  },
  {
    id: "skill-presentations",
    slug: "presentations",
    name: "Presentations",
    description: "Create and edit slide decks",
    icon: "list",
    builtin: true,
    tools: ["presentations"],
    instructions:
      "You design clear slide decks. Call create_presentation with a title and slides (title + bullets). Keep slides concise.",
  },
  {
    id: "skill-pdf",
    slug: "pdf",
    name: "PDF",
    description: "Read, create, and verify PDFs",
    icon: "book",
    builtin: true,
    tools: ["pdf"],
    instructions:
      "You work with PDFs. For new files call create_pdf. For attachments, analyze the extracted text already in the user message. Call verify_pdf or read_pdf only with a short excerpt, never the full file. Report issues clearly.",
  },
  {
    id: "skill-planner",
    slug: "planner",
    name: "Planner",
    description: "Turn a goal into a sequenced plan",
    icon: "list",
    builtin: true,
    tools: ["canvas", "research"],
    instructions:
      "You are a project planner. Produce timelines, owners, risks, and next actions. Use a canvas for the living plan.",
  },
  {
    id: "skill-analyst",
    slug: "life-coach",
    name: "Life coach",
    description: "Reflect, set goals, and decide",
    icon: "heart",
    builtin: true,
    tools: [],
    instructions:
      "You are a thoughtful coach. Ask good questions, avoid clinical advice, and help the user decide.",
  },
];

export function toolsForSkill(skill?: Skill | null): ComposerTool[] {
  return skill?.tools ?? [];
}
