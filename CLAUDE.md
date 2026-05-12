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
  index.ts     — McpServer instance, all 16 tool registrations, zod/v4 schemas
  storage.ts   — Filesystem layer: fragments (Markdown + gray-matter frontmatter),
                 projects, characters, places, global config
  types.ts     — Shared TypeScript types
```

Data stored at `~/.vibedaily/`:
```
projects/{slug}/
  meta.json         — Project metadata
  characters.json   — Novel character profiles
  places.json       — Location profiles
  fragments/*.md    — Timestamped Markdown with YAML frontmatter
config.json         — Global config (currentProject)
```

## Key design decisions

- Fragments are Markdown files with gray-matter frontmatter — human-readable, git-friendly.
- Type inference (`diary`/`novel`/`idea`/`note`) uses keyword matching when not explicitly provided.
- `weave` tool returns raw fragments; Claude stitches them — keeps the plugin simple.
- Dependencies: `@modelcontextprotocol/sdk` (MCP server), `gray-matter` (frontmatter), `zod` (schema validation via SDK re-export).

## Capabilities & Features

### MCP Integration

Registered via `.mcp.json` at the repo root. Use a relative path (`./dist/index.js`) for the MCP server entry — Claude Code resolves it from the project root. After `npm run build`, the MCP server starts automatically when Claude Code opens this project.

### Data Model

- **Project** — diary or novel. Has a slug (URL-safe name), type, description, and optional tags.
- **Fragment** — a single piece of writing. Has a type, content, timestamp, tags, and optional associations to characters and places.
- **Character** (novel projects) — name, aliases, description, personality traits, notes.
- **Place** (novel projects) — name, description, notes.
- **Global config** — stores `currentProject` for default-project convenience.

Storage: Markdown files with YAML frontmatter (gray-matter) under `~/.vibedaily/`. Human-readable, git-friendly.

### Fragment Types & Auto-Inference

Four fragment types: `diary`, `novel`, `idea`, `note`.

When `jot` is called without an explicit `type`, the system infers one:
- **diary** — content contains keywords like 今天, 日记, 昨天, 心情, 早上, 晚上, etc.
- **novel** — content matches novel patterns like 角色, 场景, 章节, 小说, chapter, etc.
- **idea** — content contains keywords like 灵感, 想法, idea, todo, 忽然, etc.
- **note** — fallback when nothing else matches.

If the project itself has a type (`diary` or `novel`), that takes precedence over keyword matching.

### All 16 Tools

#### Fragment CRUD
| Tool | Description |
|------|-------------|
| `jot` | Record a fragment. Content is the only required field. Type auto-inferred, project defaults to current. Supports tags, characters, places. |
| `list_fragments` | List fragments with filters: project, type, tags (any match). Paginated via `limit`/`offset`. Returns newest first with 100-char previews. |
| `get_fragment` | Read a single fragment in full, including all metadata and complete content. |
| `update_fragment` | Edit content, type, tags, characters, or places of an existing fragment. All fields optional. |
| `delete_fragment` | Permanently delete a fragment by ID. |
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
