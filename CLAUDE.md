# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

VibeDaily is an MCP plugin for fragmented journaling and novel writing inside Claude Code.
Record inspiration in seconds without leaving your workflow. Review and weave fragments later.

## Commands

```bash
npm run build    # TypeScript compile to dist/
npm start        # Run the MCP server
npm run dev      # Build + run
```

## Architecture

```
src/
  index.ts     — McpServer instance, all 19 tool registrations, zod/v4 schemas
  storage.ts   — Filesystem layer: fragments (Markdown + gray-matter frontmatter),
                 projects, characters, places, global config
  types.ts     — Shared TypeScript types
```

Data stored at `~/vibedaily-data/` (user home):
```
projects/{slug}/
  meta.json         — Project metadata
  characters.json   — Novel character profiles
  places.json       — Location profiles
  fragments/*.md    — Timestamped Markdown with YAML frontmatter
  images/{fragment-id}/*  — Attached images
config.json         — Global config (currentProject)
```

On first run, existing data is migrated from `~/.vibedaily/` automatically.

## Key design decisions

- Fragments are Markdown files with gray-matter frontmatter — human-readable, git-friendly.
- Type inference (`diary`/`novel`/`idea`/`note`) uses keyword matching when not explicitly provided.
- `weave` tool returns raw fragments; Claude stitches them — keeps the plugin simple.
- Dependencies: `@modelcontextprotocol/sdk` (MCP server), `gray-matter` (frontmatter), `zod` (schema validation).

## Capabilities & Features

### MCP Integration

Registered via `.mcp.json` at the repo root. Use a relative path (`dist/index.js`) for the MCP server entry — Claude Code resolves it from the project root. After `npm run build`, the MCP server starts automatically when Claude Code opens this project.

### Data Model

- **Project** — diary or novel. Has a slug (URL-safe name), type, description, and optional tags.
- **Fragment** — a single piece of writing. Has a type, content, timestamp, tags, images (relative paths), imageWarnings, and optional associations.
- **Character** (novel projects) — name, aliases, description, personality traits, notes.
- **Place** (novel projects) — name, description, notes.
- **Global config** — stores `currentProject` for default-project convenience.

Storage: Markdown files with YAML frontmatter indexed under `~/vibedaily-data/`. Fixed user-home path — works from any directory. Migrated from `~/.vibedaily/` on first run.

### Fragment Types & Auto-Inference

Four fragment types: `diary`, `novel`, `idea`, `note`.

When `jot` is called without an explicit `type`, the system infers one:
- **diary** — content contains keywords like 今天, 日记, 昨天, 心情, 早上, 晚上, etc.
- **novel** — content matches novel patterns like 角色, 场景, 章节, 小说, chapter, etc.
- **idea** — content contains keywords like 灵感, 想法, idea, todo, 忽然, etc.
- **note** — fallback when nothing else matches.

If the project itself has a type (`diary` or `novel`), that takes precedence over keyword matching.

### Image Support

Images can be attached via two parameters on `jot`, `quick_jot`, and `update_fragment`:

| Parameter | Source | Format | Notes |
|-----------|--------|--------|-------|
| `images` | File paths | Absolute path | Temp files from Ctrl+V paste. Must be handled immediately — files are cleaned quickly. |
| `imageAttachments` | Data URLs | `data:image/png;base64,...` | Immune to temp file cleanup. Decoded and written as binary. |

**Validation:** max 10MB per image. Allowed types: `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/svg+xml`. Violations produce `warnings` in the response — no silent failure.

**Storage:** Images copied to `vibedaily-data/projects/{slug}/images/{fragment-id}/`. Frontmatter stores relative paths (e.g., `images/mp2xxx/0.png`). Old images are cleaned on `delete_fragment` and on `update_fragment` when replaced.

### All 19 Tools

#### Fragment CRUD
| Tool | Description |
|------|-------------|
| `jot` | Record a fragment. Content is the only required field. Type auto-inferred, project defaults to current. Supports tags, characters, places, images. |
| `quick_jot` | Ultra-low-friction diary entry. Auto-creates project if needed, type is always `diary`, auto-tags with today's date. Supports images. |
| `list_fragments` | List fragments with filters: project, type, tags (any match). Paginated via `limit`/`offset`. Returns newest first with 100-char previews. |
| `get_fragment` | Read a single fragment in full, including all metadata and complete content. |
| `update_fragment` | Edit content, type, tags, characters, places, or images of an existing fragment. All fields optional. |
| `delete_fragment` | Permanently delete a fragment by ID. Also cleans up associated images. |
| `search_fragments` | Full-text search across all projects' fragments. Case-insensitive, returns previews. |

#### Project Management
| Tool | Description |
|------|-------------|
| `create_project` | Create a new project — name, type (`diary`/`novel`), optional description. Auto-generates slug, initializes characters.json, places.json, fragments/ directory. |
| `list_projects` | List all projects with metadata (name, slug, type, description, created date). |
| `set_current_project` | Set the active project. Subsequent `jot` calls without explicit `project` will use this. |
| `get_current_project` | Show the currently active project slug. |

#### Characters (Novel Projects)
| Tool | Description |
|------|-------------|
| `add_character` | Add a character with name, description, aliases, personality traits, and notes. |
| `list_characters` | List all characters in a project. |
| `update_character` | Update a character's info. All fields optional. |

#### Places (Novel Projects)
| Tool | Description |
|------|-------------|
| `add_place` | Add a location with name, description, and notes. |
| `list_places` | List all places in a project. |
| `update_place` | Update a place's info. All fields optional. |

#### AI-Assisted Writing
| Tool | Description |
|------|-------------|
| `weave` | Select fragments by ID or filter (project/type/tags), then returns their full content for Claude to stitch into a coherent narrative — a diary entry or novel chapter. |
| `merge_fragments` | Merge fragments by ID list or date. Optionally delete sources. Content joined with `### HH:MM` Markdown headings. Preserves image references. |

### quick_jot append mode

When `quick_jot` is called with `append: true`, the content is appended to today's last diary entry with a `### HH:MM` timestamp heading. Falls back to creating a new fragment if no entry exists today. Useful for continuous logging (meetings, debugging sessions) without manual merging.

## VibeDaily Usage — Auto-Trigger Rules

When the user says any of the following, use the VibeDaily MCP `jot` tool immediately:

| Trigger | Example |
|---------|---------|
| `记一下：...` | 记一下：刚刚想到一个有意思的点子 |
| `记日记：...` 或 `写日记：...` | 写日记：今天中午去吃了塔斯汀 |
| `jot: ...` 或 `j ...` | j 有点焦虑，任务太模糊了 |
| `记录：...` 或 `帮我记录：...` | 帮我记录：开会讨论了插件架构 |
| `diary: ...` | diary: feeling productive today |
| `/j ...` | /j 等待AI回复时的碎片时间很适合写日记 |

**Rules:**
- Call `jot` (or `quick_jot` if available) immediately. Do NOT ask for confirmation.
- Do not rewrite the user's content. Save it verbatim.
- After saving, reply with a one-line confirmation: fragment ID and brief preview.
- If the project is ambiguous, default to "日记" for Chinese diary content, or the current active project.
- **When the user pastes an image (Ctrl+V) during a diary entry, pass its file path as the `images` parameter to `jot` or `quick_jot` immediately — the temp path is cleaned up quickly.**

When the user asks to review past entries, use `list_fragments`, `get_fragment`, or `weave` as appropriate.
