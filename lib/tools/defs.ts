import type { ChatCompletionTool } from "../llm-types";

export function builtinToolDefs(opts: {
  mode: "chat" | "work";
  enabled: {
    search: boolean;
    canvas: boolean;
    python: boolean;
    research: boolean;
    image: boolean;
  };
  imageConfigured: boolean;
}): ChatCompletionTool[] {
  const tools: ChatCompletionTool[] = [];

  if (opts.enabled.search) {
    tools.push({
      type: "function",
      function: {
        name: "web_search",
        description: "Search the live web and return titled results with URLs and snippets.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
          },
          required: ["query"],
        },
      },
    });
  }

  if (opts.enabled.research) {
    tools.push({
      type: "function",
      function: {
        name: "deep_research",
        description: "Run several web searches and return a synthesized research pack.",
        parameters: {
          type: "object",
          properties: {
            topic: { type: "string" },
            questions: {
              type: "array",
              items: { type: "string" },
              description: "Sub-questions to investigate",
            },
          },
          required: ["topic"],
        },
      },
    });
  }

  if (opts.enabled.python) {
    tools.push({
      type: "function",
      function: {
        name: "python",
        description:
          "Run Python 3 for calculation, data analysis, or text processing. No network. Print the result.",
        parameters: {
          type: "object",
          properties: {
            code: { type: "string" },
          },
          required: ["code"],
        },
      },
    });
  }

  if (opts.enabled.canvas) {
    tools.push(
      {
        type: "function",
        function: {
          name: "open_canvas",
          description: "Open a side canvas with a document or a single code file.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              language: {
                type: "string",
                description: "markdown, python, javascript, html, tsx, etc.",
              },
              content: { type: "string" },
            },
            required: ["title", "content"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "update_canvas",
          description: "Replace the current canvas contents.",
          parameters: {
            type: "object",
            properties: {
              content: { type: "string" },
              title: { type: "string" },
            },
            required: ["content"],
          },
        },
      },
    );
  }

  if (opts.enabled.image) {
    tools.push({
      type: "function",
      function: {
        name: "generate_image",
        description: opts.imageConfigured
          ? "Generate an image from a detailed prompt and optional aspect ratio."
          : "Generate an image. If unavailable, explain that image generation is not configured.",
        parameters: {
          type: "object",
          properties: {
            prompt: { type: "string" },
            aspect_ratio: {
              type: "string",
              enum: ["1:1", "16:9", "9:16", "4:3", "3:4"],
            },
          },
          required: ["prompt"],
        },
      },
    });
  }

  tools.push(
    {
      type: "function",
      function: {
        name: "remember",
        description: "Store a durable fact about the user.",
        parameters: {
          type: "object",
          properties: { fact: { type: "string" } },
          required: ["fact"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "recall_memory",
        description: "List stored facts about the user.",
        parameters: { type: "object", properties: {} },
      },
    },
  );

  if (opts.mode === "work") {
    tools.push(
      {
        type: "function",
        function: {
          name: "create_plan",
          description: "Create the Work plan the user sees in the side panel.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              steps: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                  },
                  required: ["id", "title"],
                },
              },
            },
            required: ["title", "steps"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "update_plan",
          description: "Update step status in the Work plan.",
          parameters: {
            type: "object",
            properties: {
              step_id: { type: "string" },
              status: { type: "string", enum: ["pending", "running", "done", "blocked"] },
              detail: { type: "string" },
            },
            required: ["step_id", "status"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "request_permission",
          description: "Ask the user to approve a sensitive action before doing it.",
          parameters: {
            type: "object",
            properties: {
              action: { type: "string" },
              detail: { type: "string" },
            },
            required: ["action", "detail"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "submit_deliverable",
          description: "Submit the finished Work result for the preview panel.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              markdown: { type: "string" },
              html: { type: "string" },
            },
            required: ["title"],
          },
        },
      },
    );
  }

  return tools;
}
