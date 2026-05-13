# VibeDaily

<p align="center">
  <img src="media/logo.svg" alt="VibeDaily" width="600">
</p>

**Fragment journaling & novel writing — inside Claude Code.**

VibeDaily is an MCP (Model Context Protocol) plugin that turns Claude Code into a daily journal. Write diary entries, capture ideas, or draft novel scenes in seconds without leaving your terminal.

## Quick Start

```bash
git clone https://github.com/XS-dev/VibeDaily.git
cd VibeDaily
npm install
npm run build
```

The MCP server auto-starts via `.mcp.json` when you open this project in Claude Code.

### Use Everywhere (Global Setup)

To make VibeDaily available from any directory:

```bash
# Register as a user-level MCP server
claude mcp add vibedaily -s user -- node /absolute/path/to/VibeDaily/dist/index.js

# Optional: enable /j slash command globally
cp .claude/commands/j.md ~/.claude/commands/j.md
```

Then `记一下`, `jot`, and `/j` work no matter which project you're in.

## Features

<p align="center">
  <img src="media/workflow.svg" alt="VibeDaily workflow" width="800">
</p>

### Zero-Friction Recording

| You say / do... | What happens |
|-----------------|--------------|
| `diary: just had an idea` | Auto-calls `jot`, saves immediately |
| `/j feeling anxious about the deadline` | Same, via shortcut command |
| `jot: discovered a nice pattern` | Type auto-inferred |
| `Ctrl+V` paste an image | Image attached to fragment |

No terminal switching, no confirmation prompts, no file management.

### 19 MCP Tools

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

- **`merge_fragments`** joins multiple fragments into one with `### HH:MM` Markdown headings. Source images are copied to the new fragment's directory and embedded as `![image](path)` inline. Optional `delete_source` cleans up sources after merge.
- **`quick_jot(append: true)`** appends to today's last diary entry with a timestamp heading. Falls back to creating a new fragment if no entry exists today.

### Type Auto-Inference

When no explicit `type` is given, the tool infers from content keywords across both English and Chinese. Project-level type (`diary` / `novel`) takes precedence over keyword matching.

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

```
diary: feeling productive while waiting for the AI to finish

/j just finished the plugin — it actually works

# Append to today's entry
jot: one more thought   (with append: true)

# Merge today's fragments
merge today
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
