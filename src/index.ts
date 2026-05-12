import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import * as s from "./storage.js";
import type { FragmentType, ProjectType } from "./types.js";

// ---- type inference ----

const DIARY_KEYWORDS = [
  "今天", "早上", "晚上", "昨天", "明天", "心情",
  "感觉", "日记", "记录", "日常",
];
const NOVEL_KEYWORDS = [
  "角色", "场景", "对白", "情节", "章节", "故事", "小说",
  "第.*章", "chapter",
];
const IDEA_KEYWORDS = [
  "灵感", "想法", "点子", "idea", "todo", "待办", "忽然",
];

function inferType(content: string, projectType?: string): FragmentType {
  if (projectType === "diary") return "diary";
  if (projectType === "novel") return "novel";
  const lower = content.toLowerCase();
  for (const kw of DIARY_KEYWORDS) {
    if (lower.includes(kw)) return "diary";
  }
  for (const kw of NOVEL_KEYWORDS) {
    if (new RegExp(kw, "i").test(lower)) return "novel";
  }
  for (const kw of IDEA_KEYWORDS) {
    if (lower.includes(kw)) return "idea";
  }
  return "note";
}

// ---- server ----

const server = new McpServer({
  name: "vibedaily",
  version: "0.1.0",
});

server.server.registerCapabilities({ tools: {} });

// ============================
// Core: jot
// ============================
server.registerTool(
  "jot",
  {
    description:
      "Quickly record a fragment — a diary entry, novel scene, idea, or note. " +
      "Minimal friction: just write content and go. The type is auto-inferred if not specified.",
    inputSchema: {
      content: z.string().describe("The fragment content to record"),
      project: z
        .string()
        .optional()
        .describe("Project slug. If omitted, uses the current active project"),
      type: z
        .enum(["diary", "novel", "idea", "note"])
        .optional()
        .describe("Fragment type. Auto-inferred from content if not given"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Tags for filtering later"),
      characters: z
        .array(z.string())
        .optional()
        .describe("Character IDs to associate with this fragment"),
      places: z
        .array(z.string())
        .optional()
        .describe("Place IDs to associate with this fragment"),
      images: z
        .array(z.string())
        .optional()
        .describe("Image file paths to attach"),
      imageAttachments: z
        .array(z.string())
        .optional()
        .describe("Base64 data URLs (data:image/...;base64,...) — use when temp files are already cleaned up"),
    },
  },
  async ({ content, project, type, tags, characters, places, images, imageAttachments }) => {
    const config = await s.readConfig();
    const proj = project || config.currentProject;
    if (!proj)
      return {
        content: [
          {
            type: "text" as const,
            text: "No project specified. Create one with `create_project` or set a default with `set_current_project`.",
          },
        ],
      };

    const projMeta = await s.getProject(proj);
    const resolvedType: FragmentType =
      type ||
      inferType(content, projMeta?.type) ||
      "note";

    const allImages = [...(images || []), ...(imageAttachments || [])];
    const frag = await s.writeFragment(
      proj,
      resolvedType,
      content,
      tags || [],
      characters || [],
      places || [],
      allImages
    );

    const response: Record<string, unknown> = {
      ok: true,
      fragment: {
        id: frag.id,
        type: frag.type,
        project: frag.project,
        tags: frag.tags,
        timestamp: frag.timestamp,
        preview: frag.content.slice(0, 80) + (frag.content.length > 80 ? "..." : ""),
      },
    };
    if (frag.imageWarnings.length > 0) {
      response.warnings = frag.imageWarnings;
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  }
);

// ============================
// Core: quick_jot — minimal-friction diary entry
// ============================
server.registerTool(
  "quick_jot",
  {
    description:
      "Ultra-low-friction diary entry. Auto-uses current project (or creates a default '日记' project), " +
      "type is always 'diary', auto-tags with today's date. Use this for the fastest possible recording.",
    inputSchema: {
      content: z.string().describe("The diary content to record"),
      images: z
        .array(z.string())
        .optional()
        .describe("Image file paths to attach"),
      imageAttachments: z
        .array(z.string())
        .optional()
        .describe("Base64 data URLs — use when temp files are already cleaned up"),
    },
  },
  async ({ content, images, imageAttachments }) => {
    const config = await s.readConfig();
    let proj = config.currentProject;

    if (!proj) {
      // auto-create or find default diary project
      const projects = await s.listProjects();
      const diary = projects.find((p) => p.type === "diary");
      if (diary) {
        proj = diary.slug;
      } else {
        const meta = await s.createProject("日记", "diary", "日常日记");
        proj = meta.slug;
      }
      config.currentProject = proj;
      await s.writeConfig(config);
    }

    const today = new Date().toISOString().slice(0, 10);
    const allImages = [...(images || []), ...(imageAttachments || [])];
    const frag = await s.writeFragment(
      proj,
      "diary",
      content,
      [today],
      [],
      [],
      allImages
    );

    const result: Record<string, unknown> = {
      ok: true,
      id: frag.id,
      preview: frag.content.slice(0, 60) + (frag.content.length > 60 ? "..." : ""),
    };
    if (frag.imageWarnings.length > 0) {
      result.warnings = frag.imageWarnings;
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result),
        },
      ],
    };
  }
);

// ============================
// Fragments: list, get, update, delete, search
// ============================
server.registerTool(
  "list_fragments",
  {
    description:
      "List fragments with optional filters. Returns newest first.",
    inputSchema: {
      project: z.string().optional().describe("Filter by project slug"),
      type: z
        .enum(["diary", "novel", "idea", "note"])
        .optional()
        .describe("Filter by fragment type"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Filter by tags (any match)"),
      limit: z.number().default(50).describe("Max results"),
      offset: z.number().default(0).describe("Pagination offset"),
    },
  },
  async ({ project, type, tags, limit, offset }) => {
    const fragments = await s.listFragments(project, type, tags, limit, offset);
    const summary = fragments.map((f) => ({
      id: f.id,
      type: f.type,
      project: f.project,
      tags: f.tags,
      timestamp: f.timestamp,
      preview: f.content.slice(0, 100) + (f.content.length > 100 ? "..." : ""),
    }));
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(summary, null, 2),
        },
      ],
    };
  }
);

server.registerTool(
  "get_fragment",
  {
    description: "Read a single fragment in full.",
    inputSchema: {
      id: z.string().describe("Fragment ID"),
      project: z.string().describe("Project slug"),
    },
  },
  async ({ id, project }) => {
    const f = await s.readFragment(project, id);
    if (!f)
      return {
        content: [{ type: "text" as const, text: "Fragment not found." }],
      };
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              id: f.id,
              type: f.type,
              project: f.project,
              tags: f.tags,
              characters: f.characters,
              places: f.places,
              images: f.images,
              imageWarnings: f.imageWarnings,
              timestamp: f.timestamp,
              content: f.content,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.registerTool(
  "update_fragment",
  {
    description: "Edit an existing fragment's content, type, tags, or associations.",
    inputSchema: {
      id: z.string().describe("Fragment ID"),
      project: z.string().describe("Project slug"),
      content: z.string().optional().describe("New content"),
      type: z
        .enum(["diary", "novel", "idea", "note"])
        .optional()
        .describe("New type"),
      tags: z.array(z.string()).optional(),
      characters: z.array(z.string()).optional(),
      places: z.array(z.string()).optional(),
      images: z.array(z.string()).optional().describe("New image file paths"),
      imageAttachments: z.array(z.string()).optional().describe("New base64 data URLs"),
    },
  },
  async ({ id, project, content, type, tags, characters, places, images, imageAttachments }) => {
    const allImages = [...(images || []), ...(imageAttachments || [])];
    const updated = await s.updateFragment(project, id, {
      content,
      type,
      tags,
      characters,
      places,
      images: allImages.length > 0 ? allImages : undefined,
    });
    if (!updated)
      return {
        content: [{ type: "text" as const, text: "Fragment not found." }],
      };
    const resp: Record<string, unknown> = {
      ok: true,
      fragment: { id: updated.id, timestamp: updated.timestamp },
    };
    if (updated.imageWarnings.length > 0) {
      resp.warnings = updated.imageWarnings;
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(resp, null, 2),
        },
      ],
    };
  }
);

server.registerTool(
  "delete_fragment",
  {
    description: "Delete a fragment permanently.",
    inputSchema: {
      id: z.string().describe("Fragment ID"),
      project: z.string().describe("Project slug"),
    },
  },
  async ({ id, project }) => {
    const ok = await s.deleteFragment(project, id);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ ok, message: ok ? "Deleted." : "Not found." }),
        },
      ],
    };
  }
);

server.registerTool(
  "search_fragments",
  {
    description: "Full-text search across all fragments.",
    inputSchema: {
      query: z.string().describe("Search keyword"),
      limit: z.number().default(50),
    },
  },
  async ({ query, limit }) => {
    const results = await s.searchFragments(query, limit);
    const summary = results.map((f) => ({
      id: f.id,
      type: f.type,
      project: f.project,
      tags: f.tags,
      timestamp: f.timestamp,
      preview: f.content.slice(0, 120) + (f.content.length > 120 ? "..." : ""),
    }));
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(summary, null, 2),
        },
      ],
    };
  }
);

// ============================
// Projects
// ============================
server.registerTool(
  "create_project",
  {
    description: "Create a new project (diary or novel).",
    inputSchema: {
      name: z.string().describe("Project display name"),
      type: z.enum(["diary", "novel"]).describe("Project type"),
      description: z.string().default("").describe("Short description"),
    },
  },
  async ({ name, type, description }) => {
    const meta = await s.createProject(name, type, description);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ ok: true, project: meta }, null, 2),
        },
      ],
    };
  }
);

server.registerTool(
  "list_projects",
  {
    description: "List all projects.",
    inputSchema: {},
  },
  async () => {
    const projects = await s.listProjects();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(projects, null, 2),
        },
      ],
    };
  }
);

server.registerTool(
  "set_current_project",
  {
    description: "Set the default/active project. Subsequent `jot` calls without an explicit project will use this.",
    inputSchema: {
      project: z.string().describe("Project slug"),
    },
  },
  async ({ project }) => {
    const config = await s.readConfig();
    config.currentProject = project;
    await s.writeConfig(config);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ ok: true, currentProject: project }),
        },
      ],
    };
  }
);

server.registerTool(
  "get_current_project",
  {
    description: "Show the current active project.",
    inputSchema: {},
  },
  async () => {
    const config = await s.readConfig();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { currentProject: config.currentProject },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ============================
// Characters
// ============================
server.registerTool(
  "add_character",
  {
    description: "Add a character to a novel project.",
    inputSchema: {
      project: z.string().describe("Project slug"),
      name: z.string().describe("Character name"),
      description: z.string().default("").describe("Character description"),
      aliases: z.array(z.string()).default([]).describe("Other names/aliases"),
      traits: z.array(z.string()).default([]).describe("Personality traits"),
      notes: z.string().default("").describe("Additional notes"),
    },
  },
  async ({ project, name, description, aliases, traits, notes }) => {
    const c = await s.addCharacter(project, name, description, traits, aliases, notes);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ ok: true, character: c }, null, 2),
        },
      ],
    };
  }
);

server.registerTool(
  "list_characters",
  {
    description: "List all characters in a project.",
    inputSchema: {
      project: z.string().describe("Project slug"),
    },
  },
  async ({ project }) => {
    const chars = await s.listCharacters(project);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(chars, null, 2),
        },
      ],
    };
  }
);

server.registerTool(
  "update_character",
  {
    description: "Update a character's info.",
    inputSchema: {
      project: z.string().describe("Project slug"),
      id: z.string().describe("Character ID"),
      name: z.string().optional(),
      description: z.string().optional(),
      aliases: z.array(z.string()).optional(),
      traits: z.array(z.string()).optional(),
      notes: z.string().optional(),
    },
  },
  async ({ project, id, ...updates }) => {
    const c = await s.updateCharacter(project, id, updates);
    if (!c)
      return {
        content: [{ type: "text" as const, text: "Character not found." }],
      };
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ ok: true, character: c }, null, 2),
        },
      ],
    };
  }
);

// ============================
// Places
// ============================
server.registerTool(
  "add_place",
  {
    description: "Add a place/location to a project.",
    inputSchema: {
      project: z.string().describe("Project slug"),
      name: z.string().describe("Place name"),
      description: z.string().default(""),
      notes: z.string().default(""),
    },
  },
  async ({ project, name, description, notes }) => {
    const pl = await s.addPlace(project, name, description, notes);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ ok: true, place: pl }, null, 2),
        },
      ],
    };
  }
);

server.registerTool(
  "list_places",
  {
    description: "List all places/locations in a project.",
    inputSchema: {
      project: z.string().describe("Project slug"),
    },
  },
  async ({ project }) => {
    const places = await s.listPlaces(project);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(places, null, 2),
        },
      ],
    };
  }
);

server.registerTool(
  "update_place",
  {
    description: "Update a place's info.",
    inputSchema: {
      project: z.string().describe("Project slug"),
      id: z.string().describe("Place ID"),
      name: z.string().optional(),
      description: z.string().optional(),
      notes: z.string().optional(),
    },
  },
  async ({ project, id, ...updates }) => {
    const pl = await s.updatePlace(project, id, updates);
    if (!pl)
      return {
        content: [{ type: "text" as const, text: "Place not found." }],
      };
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ ok: true, place: pl }, null, 2),
        },
      ],
    };
  }
);

// ============================
// AI: weave
// ============================
server.registerTool(
  "weave",
  {
    description:
      "Weave fragments together into a coherent chapter or diary entry. " +
      "Provide fragment IDs, or use filters to select fragments automatically. " +
      "The tool returns the selected fragments' full content so Claude can stitch them.",
    inputSchema: {
      project: z.string().optional().describe("Filter by project"),
      type: z
        .enum(["diary", "novel", "idea", "note"])
        .optional()
        .describe("Filter by type"),
      tags: z.array(z.string()).optional().describe("Filter by tags"),
      fragment_ids: z
        .array(z.string())
        .optional()
        .describe("Specific fragment IDs to weave (takes priority over filters)"),
      limit: z.number().default(20).describe("Max fragments to include"),
    },
  },
  async ({ project, type, tags, fragment_ids, limit }) => {
    let fragments;

    if (fragment_ids && fragment_ids.length > 0 && project) {
      const resolved: NonNullable<Awaited<ReturnType<typeof s.readFragment>>>[] = [];
      for (const id of fragment_ids) {
        const f = await s.readFragment(project, id);
        if (f) resolved.push(f);
      }
      fragments = resolved;
    } else {
      fragments = await s.listFragments(project, type, tags, limit);
    }

    if (fragments.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No fragments found to weave.",
          },
        ],
      };
    }

    const parts = fragments.map((f, i) => {
      let header = `--- Fragment ${i + 1} [${f.id}] [${f.type}] [${f.timestamp}]`;
      if (f.images && f.images.length > 0) {
        header += ` [images: ${f.images.join(", ")}]`;
      }
      return `${header} ---\n${f.content}`;
    });
    const body = parts.join("\n\n");

    return {
      content: [
        {
          type: "text" as const,
          text:
            `# Weave Request\n\n` +
            `Found ${fragments.length} fragments. Use these to produce a coherent narrative.\n\n` +
            `## Fragments\n\n${body}\n\n` +
            `---\n` +
            `Please stitch these fragments into a coherent, flowing piece. ` +
            `For diary: merge into a single journal entry with natural transitions. ` +
            `For novel: weave into a chapter or scene, connecting characters and events. ` +
            `Preserve the original voice and all key details.`,
        },
      ],
    };
  }
);

// ============================
// start
// ============================
async function main() {
  s.init();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("VibeDaily server error:", err);
  process.exit(1);
});
