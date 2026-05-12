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

## Claude Code integration

Registered via `.mcp.json` at the repo root. After building, the MCP server starts automatically when Claude Code opens this project. Available tools: `jot`, `list_fragments`, `get_fragment`, `update_fragment`, `delete_fragment`, `search_fragments`, `create_project`, `list_projects`, `set_current_project`, `get_current_project`, `add_character`, `list_characters`, `update_character`, `add_place`, `list_places`, `update_place`, `weave`.
