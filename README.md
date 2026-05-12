# VibeDaily

<p align="center">
  <img src="media/logo.svg" alt="VibeDaily" width="600">
</p>

**Fragment journaling & novel writing — inside Claude Code.**

VibeDaily is an MCP (Model Context Protocol) plugin that turns Claude Code into a daily journal. Write diary entries, capture ideas, or draft novel scenes in seconds without leaving your terminal.

## Quick Start

```bash
npm install
npm run build
```

The MCP server auto-starts via `.mcp.json` when you open this project in Claude Code.

## Features

<p align="center">
  <img src="media/workflow.svg" alt="VibeDaily workflow" width="800">
</p>

### Zero-Friction Recording

| You say / do... | What happens |
|-----------------|--------------|
| `记一下：刚才想到一个点子` | Auto-calls `jot`, saves immediately |
| `/j 今天有点焦虑` | Same, via shortcut command |
| `diary: feeling productive` | English auto-trigger too |
| `Ctrl+V` paste an image | Image attached to fragment |

No terminal switching, no confirmation prompts, no file management.

### 18 MCP Tools

#### Fragment CRUD
| Tool | Description |
|------|-------------|
| `jot` | Record a fragment. Content is the only required field. Auto-infers type. Supports tags, characters, places, images, imageAttachments. |
| `quick_jot` | Ultra-low-friction diary entry. Auto-creates project, auto-date-tags. Supports `append: true` to add to today's last entry. |
| `list_fragments` | List with filters (project, type, tags). Paginated. Newest first. |
| `get_fragment` | Read in full — content, metadata, images, warnings. |
| `update_fragment` | Edit content, type, tags, images. All fields optional. |
| `delete_fragment` | Permanent delete by ID. Cleans up associated images. |
| `search_fragments` | Full-text search across all projects. |

#### Project Management
| Tool | Description |
|------|-------------|
| `create_project` | New diary or novel project. |
| `list_projects` | List all projects with metadata. |
| `set_current_project` | Set default project for `jot`. |
| `get_current_project` | Show active project slug. |

#### Characters & Places (Novel Writing)
| Tool | Description |
|------|-------------|
| `add_character` | Name, aliases, traits, description, notes. |
| `list_characters` | All characters in a project. |
| `update_character` | Edit character profile. |
| `add_place` | Location with description and notes. |
| `list_places` | All places in a project. |
| `update_place` | Edit location info. |

#### AI-Assisted Writing
| Tool | Description |
|------|-------------|
| `weave` | Select fragments by ID or filter; returns full content for Claude to stitch into a narrative. |
| `merge_fragments` | Merge by ID list or date. Optional `delete_source`. Inlines image references. |

### Image Support

Two parameters on `jot`, `quick_jot`, and `update_fragment`:

| Parameter | Source | Format |
|-----------|--------|--------|
| `images` | File paths | Absolute path (from Ctrl+V paste) |
| `imageAttachments` | Data URLs | `data:image/png;base64,...` |

**Validation:** max 10MB/image. Allowed types: PNG, JPEG, GIF, WebP, SVG. Invalid inputs generate warnings — no silent failures. Images stored as relative paths (`../images/`) resolvable from the fragment's Markdown file.

### Merge & Append

- **`merge_fragments`** joins multiple fragments into one with `### HH:MM` Markdown headings. Source images are copied to the new fragment's directory and embedded as `![图片](path)` inline. Optional `delete_source` cleans up sources after merge.
- **`quick_jot(append: true)`** appends to today's last diary entry with a timestamp heading. Falls back to creating a new fragment if no entry exists today.

### Type Auto-Inference

When no explicit `type` is given, the tool infers from content keywords:

- **diary** — 今天, 日记, 昨天, 心情, 早上, 晚上
- **novel** — 角色, 场景, 章节, 小说, chapter
- **idea** — 灵感, 想法, idea, todo
- **note** — fallback

Project-level type takes precedence over keyword matching.

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

Fragments are Markdown with gray-matter frontmatter — human-readable, git-friendly. On first run, existing data is migrated from `~/.vibedaily/`.

## Usage Examples

```text
# Quick diary entry
记一下：今天在等AI干活的时候写了个日记插件

# With /j command
/j 番茄一块多一个，苹果两块五，樱桃四十一小盒

# Append to today
记日记：又想到一件事   (with append: true)

# Merge today's fragments
合并今天的日记
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
