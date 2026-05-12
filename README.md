# VibeDaily

<p align="center">
  <img src="media/logo.svg" alt="VibeDaily" width="600">
</p>

**Fragment journaling & novel writing — inside Claude Code.**

VibeDaily is an MCP (Model Context Protocol) plugin that turns Claude Code into a daily journal. Write diary entries, capture ideas, or draft novel scenes in seconds without leaving your terminal.

## Quick Start

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build
```

The MCP server is auto-configured via `.mcp.json` — Claude Code starts it automatically when you open this project.

## Features

<p align="center">
  <img src="media/workflow.svg" alt="VibeDaily workflow" width="800">
</p>

### Core: Record in Seconds

| You say... | VibeDaily does |
|------------|---------------|
| `记一下：刚刚想到一个点子` | Auto-calls `jot`, saves as diary/idea |
| `写日记：今天...` | Saves verbatim, no confirmation needed |
| `/j 有点焦虑，任务太模糊了` | Same, via shortcut command |
| `jot this` | Type inferred from English content too |

**Zero friction.** Just type. No terminal switching, no file management.

### 17 MCP Tools

#### Fragment Tools
| Tool | What it does |
|------|-------------|
| `jot` | Record any fragment (diary/novel/idea/note). Supports tags, images, characters, places. |
| `quick_jot` | Ultra-low-friction diary entry. Auto-creates "日记" project if none exists. Auto-date-tagged. Fastest way to write. |
| `list_fragments` | List with filters (project, type, tags). Newest first, with previews. |
| `get_fragment` | Read in full — content, metadata, images. |
| `update_fragment` | Edit content, type, tags, images. |
| `delete_fragment` | Permanent delete by ID. |
| `search_fragments` | Full-text search across all projects. |

#### Project Management
| Tool | What it does |
|------|-------------|
| `create_project` | New diary or novel project. |
| `list_projects` | List all projects. |
| `set_current_project` | Set default project for `jot`. |
| `get_current_project` | Show active project. |

#### Characters & Places (Novel Writing)
| Tool | What it does |
|------|-------------|
| `add_character` | Name, aliases, traits, description, notes. |
| `list_characters` | All characters in a project. |
| `update_character` | Edit character profile. |
| `add_place` | Location with description and notes. |
| `list_places` | All places in a project. |
| `update_place` | Edit location info. |

#### AI-Assisted Writing
| Tool | What it does |
|------|-------------|
| `weave` | Select fragments by ID or filter and returns them for Claude to stitch into a coherent diary entry or chapter. |

### Image Support

Two ways to attach images — file paths and base64 data URLs:

```text
# File path (from Ctrl+V paste)
记日记：今天的午餐   ← image passed as `images`

# Base64 data URL (immune to temp file cleanup)
/data:image/png;base64,iVBORw0...
```

**Validation:** max 10MB/image. Allowed: PNG, JPEG, GIF, WebP, SVG. Warnings shown for invalid inputs — no silent failures.

Images are stored as relative paths in `./vibedaily-data/projects/{slug}/images/{fragment-id}/`.

### Type Auto-Inference

When no explicit `type` is given, the tool infers from content keywords:

- **diary** — 今天, 日记, 昨天, 心情, 早上, 晚上
- **novel** — 角色, 场景, 章节, 小说, chapter
- **idea** — 灵感, 想法, idea, todo
- **note** — fallback

Project-level type (`diary` / `novel`) takes precedence over keyword matching.

## Data Structure

```
vibedaily-data/                   (project root, .gitignored)
  config.json                     — Global config (current project)
  projects/{slug}/
    meta.json                     — Project metadata
    characters.json               — Character profiles
    places.json                   — Location profiles
    fragments/*.md                — Markdown + YAML frontmatter
    images/{fragment-id}/*        — Attached images
```

Fragments are Markdown with gray-matter frontmatter — human-readable, git-friendly.

## Usage Examples

```text
# Quick diary entry
记一下：今天在等AI干活的时候写了个日记插件，挺好用的

# With /j command
/j 番茄一块多一个，苹果两块五，樱桃四十一小盒，告辞

# Review today
/today (via list_fragments)

# Weave fragments into a coherent entry
帮我整理一下今天的日记
```

## Development

```bash
npm run build    # TypeScript compile
npm start        # Run MCP server
npm run dev      # Build + run
```

## Tech Stack

- TypeScript, Zod v4
- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [gray-matter](https://github.com/jonschlinkert/gray-matter)
