import fs from "node:fs/promises";
import { cpSync } from "node:fs";
import path from "node:path";
import { existsSync, mkdirSync, copyFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import matter from "gray-matter";
import type {
  Fragment,
  FragmentType,
  ProjectMeta,
  GlobalConfig,
  Character,
  Place,
  ProjectType,
} from "./types.js";

const BASE = path.join(process.cwd(), "vibedaily-data");
const OLD_BASE = path.join(
  process.env.HOME || process.env.USERPROFILE || "",
  ".vibedaily"
);
const PROJECTS_DIR = path.join(BASE, "projects");
const CONFIG_PATH = path.join(BASE, "config.json");

function migrateOldData() {
  const oldProjects = path.join(OLD_BASE, "projects");
  const oldConfig = path.join(OLD_BASE, "config.json");
  if (existsSync(oldProjects) && !existsSync(PROJECTS_DIR)) {
    cpSync(oldProjects, PROJECTS_DIR, { recursive: true, force: true });
  }
  if (existsSync(oldConfig) && !existsSync(CONFIG_PATH)) {
    copyFileSync(oldConfig, CONFIG_PATH);
  }
}

// ---- helpers ----

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-|-$/g, "");
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function timestampFile(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(
    d.getHours()
  )}${pad(d.getMinutes())}${pad(d.getSeconds())}.md`;
}

// ---- init ----

export function init(): string {
  ensureDir(BASE);
  migrateOldData();
  ensureDir(PROJECTS_DIR);
  if (!existsSync(CONFIG_PATH)) {
    fs.writeFile(CONFIG_PATH, JSON.stringify({ currentProject: null }, null, 2));
  }
  return BASE;
}

// ---- config ----

export async function readConfig(): Promise<GlobalConfig> {
  init();
  const raw = await fs.readFile(CONFIG_PATH, "utf-8");
  return JSON.parse(raw);
}

export async function writeConfig(config: GlobalConfig): Promise<void> {
  init();
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ---- projects ----

export async function listProjects(): Promise<ProjectMeta[]> {
  init();
  const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
  const projects: ProjectMeta[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const metaPath = path.join(PROJECTS_DIR, e.name, "meta.json");
    try {
      const raw = await fs.readFile(metaPath, "utf-8");
      projects.push(JSON.parse(raw));
    } catch {
      // skip invalid projects
    }
  }
  return projects;
}

export async function getProject(slug: string): Promise<ProjectMeta | null> {
  const metaPath = path.join(PROJECTS_DIR, slug, "meta.json");
  try {
    const raw = await fs.readFile(metaPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function createProject(
  name: string,
  type: ProjectType,
  description: string
): Promise<ProjectMeta> {
  init();
  const slug = slugify(name);
  const projectDir = path.join(PROJECTS_DIR, slug);
  if (existsSync(projectDir)) throw new Error(`Project "${slug}" already exists`);

  ensureDir(projectDir);
  ensureDir(path.join(projectDir, "fragments"));

  const meta: ProjectMeta = {
    name,
    slug,
    type,
    description,
    created: new Date().toISOString(),
    tags: [],
  };
  await fs.writeFile(
    path.join(projectDir, "meta.json"),
    JSON.stringify(meta, null, 2)
  );
  await fs.writeFile(
    path.join(projectDir, "characters.json"),
    JSON.stringify([], null, 2)
  );
  await fs.writeFile(
    path.join(projectDir, "places.json"),
    JSON.stringify([], null, 2)
  );
  return meta;
}

// ---- images ----

const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

const MIME_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
};

function isDataUrl(s: string): boolean {
  return s.startsWith("data:");
}

function decodeDataUrl(s: string): { data: Buffer; mimeType: string } | null {
  const match = s.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: Buffer.from(match[2], "base64") };
}

async function saveImages(
  projectSlug: string,
  fragmentId: string,
  sources: string[]
): Promise<{ paths: string[]; warnings: string[] }> {
  if (!sources || sources.length === 0) return { paths: [], warnings: [] };
  const imagesDir = path.join(PROJECTS_DIR, projectSlug, "images", fragmentId);
  ensureDir(imagesDir);
  const saved: string[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];

    if (isDataUrl(src)) {
      // ---- base64 / data URL path ----
      const decoded = decodeDataUrl(src);
      if (!decoded) {
        warnings.push(`Invalid data URL at index ${i}`);
        continue;
      }
      if (decoded.data.length > MAX_IMAGE_SIZE) {
        warnings.push(
          `Image too large (${(decoded.data.length / 1024 / 1024).toFixed(1)}MB > 10MB) at index ${i}`
        );
        continue;
      }
      if (!ALLOWED_IMAGE_TYPES.includes(decoded.mimeType)) {
        warnings.push(`Unsupported image type: ${decoded.mimeType} at index ${i}`);
        continue;
      }
      const ext = MIME_TO_EXT[decoded.mimeType] || ".png";
      const dest = path.join(imagesDir, `${i}${ext}`);
      writeFileSync(dest, decoded.data);
      saved.push(`images/${fragmentId}/${i}${ext}`);
    } else {
      // ---- file path ----
      if (!existsSync(src)) {
        warnings.push(`Image not found: ${src}`);
        continue;
      }
      const stat = statSync(src);
      if (stat.size > MAX_IMAGE_SIZE) {
        warnings.push(
          `Image too large (${(stat.size / 1024 / 1024).toFixed(1)}MB > 10MB): ${src}`
        );
        continue;
      }
      const ext = path.extname(src) || ".png";
      const dest = path.join(imagesDir, `${i}${ext}`);
      copyFileSync(src, dest);
      saved.push(`images/${fragmentId}/${i}${ext}`);
    }
  }

  return { paths: saved, warnings };
}

// ---- fragments ----

export async function writeFragment(
  projectSlug: string,
  type: FragmentType,
  content: string,
  tags: string[],
  characterIds: string[],
  placeIds: string[],
  imagePaths: string[] = []
): Promise<Fragment> {
  init();
  const projectDir = path.join(PROJECTS_DIR, projectSlug);
  if (!existsSync(projectDir)) throw new Error(`Project "${projectSlug}" not found`);

  const fragDir = path.join(projectDir, "fragments");
  ensureDir(fragDir);

  const filename = timestampFile();
  const ts = new Date().toISOString();
  const id = generateId();

  const { paths: images, warnings: imageWarnings } = await saveImages(projectSlug, id, imagePaths);

  const fm: Record<string, unknown> = {
    id,
    type,
    project: projectSlug,
    tags,
    characters: characterIds,
    places: placeIds,
    images,
    imageWarnings,
    timestamp: ts,
  };

  const md = matter.stringify(content, fm);
  await fs.writeFile(path.join(fragDir, filename), md);

  return {
    id,
    path: path.join(fragDir, filename),
    type,
    project: projectSlug,
    tags,
    characters: characterIds,
    places: placeIds,
    images,
    imageWarnings,
    timestamp: ts,
    content,
  };
}

export async function readFragment(
  projectSlug: string,
  fragmentId: string
): Promise<Fragment | null> {
  return findFragmentById(projectSlug, fragmentId);
}

export async function updateFragment(
  projectSlug: string,
  fragmentId: string,
  updates: {
    content?: string;
    type?: FragmentType;
    tags?: string[];
    characters?: string[];
    places?: string[];
    images?: string[];
  }
): Promise<Fragment | null> {
  const frag = await findFragmentById(projectSlug, fragmentId);
  if (!frag) return null;

  const newContent = updates.content ?? frag.content;
  let newImages = frag.images;
  let newImageWarnings: string[] = [];
  if (updates.images !== undefined) {
    const imagesDir = path.join(PROJECTS_DIR, projectSlug, "images", fragmentId);
    if (existsSync(imagesDir)) rmSync(imagesDir, { recursive: true, force: true });
    const result = await saveImages(projectSlug, fragmentId, updates.images);
    newImages = result.paths;
    newImageWarnings = result.warnings;
  }

  const fm: Record<string, unknown> = {
    id: frag.id,
    type: updates.type ?? frag.type,
    project: frag.project,
    tags: updates.tags ?? frag.tags,
    characters: updates.characters ?? frag.characters,
    places: updates.places ?? frag.places,
    images: newImages,
    imageWarnings: newImageWarnings.length > 0 ? newImageWarnings : frag.imageWarnings,
    timestamp: frag.timestamp,
  };

  const md = matter.stringify(newContent, fm);
  await fs.writeFile(frag.path, md);

  return {
    ...frag,
    type: (updates.type ?? frag.type) as FragmentType,
    tags: updates.tags ?? frag.tags,
    characters: updates.characters ?? frag.characters,
    places: updates.places ?? frag.places,
    images: newImages,
    imageWarnings: newImageWarnings.length > 0 ? newImageWarnings : frag.imageWarnings,
    content: newContent,
  };
}

export async function deleteFragment(
  projectSlug: string,
  fragmentId: string
): Promise<boolean> {
  const frag = await findFragmentById(projectSlug, fragmentId);
  if (!frag) return false;
  await fs.unlink(frag.path);
  const imagesDir = path.join(PROJECTS_DIR, projectSlug, "images", fragmentId);
  if (existsSync(imagesDir)) rmSync(imagesDir, { recursive: true, force: true });
  return true;
}

// ---- merge ----

export async function mergeFragments(
  projectSlug: string,
  fragmentIds: string[],
  deleteSource = false
): Promise<Fragment | null> {
  if (!fragmentIds || fragmentIds.length === 0) return null;

  // resolve and sort by timestamp
  const resolved: Fragment[] = [];
  for (const id of fragmentIds) {
    const f = await findFragmentById(projectSlug, id);
    if (f) resolved.push(f);
  }
  if (resolved.length === 0) return null;
  resolved.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // merge content
  const pad = (n: number) => String(n).padStart(2, "0");
  const parts = resolved.map((f) => {
    const d = new Date(f.timestamp);
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `### ${time}\n\n${f.content}`;
  });
  const mergedContent = parts.join("\n\n");

  // collect tags, images, types
  const allTags = [...new Set(resolved.flatMap((f) => f.tags))];
  const dominantType = resolved[0].type;

  // create merged fragment
  const merged = await writeFragment(
    projectSlug,
    dominantType,
    mergedContent,
    allTags,
    [],
    [],
    []
  );

  // copy source images into merged fragment's images dir
  const mergedImagesDir = path.join(PROJECTS_DIR, projectSlug, "images", merged.id);
  let imgIndex = 0;
  for (const f of resolved) {
    const srcDir = path.join(PROJECTS_DIR, projectSlug, "images", f.id);
    if (!existsSync(srcDir)) {
      // try old location (~/.vibedaily) for pre-migration fragments
      const oldDir = path.join(OLD_BASE, "projects", projectSlug, "images", f.id);
      if (existsSync(oldDir)) {
        ensureDir(mergedImagesDir);
        const files = await fs.readdir(oldDir);
        for (const file of files) {
          const ext = path.extname(file);
          const dest = path.join(mergedImagesDir, `${imgIndex}${ext}`);
          copyFileSync(path.join(oldDir, file), dest);
          imgIndex++;
        }
      }
      continue;
    }
    ensureDir(mergedImagesDir);
    const files = await fs.readdir(srcDir);
    for (const file of files) {
      const ext = path.extname(file);
      const dest = path.join(mergedImagesDir, `${imgIndex}${ext}`);
      copyFileSync(path.join(srcDir, file), dest);
      imgIndex++;
    }
  }

  // update frontmatter with new relative image paths
  if (imgIndex > 0) {
    const newImages: string[] = [];
    const newDirFiles = await fs.readdir(mergedImagesDir);
    for (const file of newDirFiles) {
      newImages.push(`images/${merged.id}/${file}`);
    }
    const fm = await fs.readFile(merged.path, "utf-8");
    const parsed = matter(fm);
    (parsed.data as Record<string, unknown>).images = newImages;
    await fs.writeFile(merged.path, matter.stringify(mergedContent, parsed.data));
    merged.images = newImages;
  }

  // optionally delete source fragments (and their image dirs)
  if (deleteSource) {
    for (const f of resolved) {
      await deleteFragment(projectSlug, f.id);
    }
  }

  return merged;
}

export async function listFragments(
  projectSlug?: string,
  type?: FragmentType,
  tags?: string[],
  limit = 50,
  offset = 0
): Promise<Fragment[]> {
  init();
  const all: Fragment[] = [];

  const projects = projectSlug
    ? [projectSlug]
    : (await listProjects()).map((p) => p.slug);

  for (const slug of projects) {
    const fragDir = path.join(PROJECTS_DIR, slug, "fragments");
    if (!existsSync(fragDir)) continue;
    const files = await fs.readdir(fragDir);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const raw = await fs.readFile(path.join(fragDir, file), "utf-8");
      const parsed = matter(raw);
      const fm = parsed.data as Record<string, unknown>;

      if (type && fm.type !== type) continue;
      if (
        tags &&
        tags.length > 0 &&
        !tags.some((t) => (fm.tags as string[] | undefined)?.includes(t))
      )
        continue;

      all.push({
        id: fm.id as string,
        path: path.join(fragDir, file),
        type: (fm.type as FragmentType) || "note",
        project: (fm.project as string) || slug,
        tags: (fm.tags as string[]) || [],
        characters: (fm.characters as string[]) || [],
        places: (fm.places as string[]) || [],
        images: (fm.images as string[]) || [],
        imageWarnings: (fm.imageWarnings as string[]) || [],
        timestamp: (fm.timestamp as string) || "",
        content: parsed.content || "",
      });
    }
  }

  all.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  return all.slice(offset, offset + limit);
}

export async function searchFragments(
  query: string,
  limit = 50
): Promise<Fragment[]> {
  init();
  const results: Fragment[] = [];
  const lower = query.toLowerCase();

  const projects = await listProjects();
  for (const proj of projects) {
    const fragDir = path.join(PROJECTS_DIR, proj.slug, "fragments");
    if (!existsSync(fragDir)) continue;
    const files = await fs.readdir(fragDir);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const raw = await fs.readFile(path.join(fragDir, file), "utf-8");
      if (!raw.toLowerCase().includes(lower)) continue;
      const parsed = matter(raw);
      const fm = parsed.data as Record<string, unknown>;
      results.push({
        id: fm.id as string,
        path: path.join(fragDir, file),
        type: (fm.type as FragmentType) || "note",
        project: (fm.project as string) || proj.slug,
        tags: (fm.tags as string[]) || [],
        characters: (fm.characters as string[]) || [],
        places: (fm.places as string[]) || [],
        images: (fm.images as string[]) || [],
        imageWarnings: (fm.imageWarnings as string[]) || [],
        timestamp: (fm.timestamp as string) || "",
        content: parsed.content || "",
      });
    }
  }

  results.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  return results.slice(0, limit);
}

async function findFragmentById(
  projectSlug: string,
  fragmentId: string
): Promise<Fragment | null> {
  const fragDir = path.join(PROJECTS_DIR, projectSlug, "fragments");
  if (!existsSync(fragDir)) return null;
  const files = await fs.readdir(fragDir);
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const raw = await fs.readFile(path.join(fragDir, file), "utf-8");
    const parsed = matter(raw);
    if ((parsed.data as Record<string, unknown>).id === fragmentId) {
      const fm = parsed.data as Record<string, unknown>;
      return {
        id: fm.id as string,
        path: path.join(fragDir, file),
        type: (fm.type as FragmentType) || "note",
        project: (fm.project as string) || projectSlug,
        tags: (fm.tags as string[]) || [],
        characters: (fm.characters as string[]) || [],
        places: (fm.places as string[]) || [],
        images: (fm.images as string[]) || [],
        imageWarnings: (fm.imageWarnings as string[]) || [],
        timestamp: (fm.timestamp as string) || "",
        content: parsed.content || "",
      };
    }
  }
  return null;
}

// ---- characters ----

async function readCharacters(projectSlug: string): Promise<Character[]> {
  const p = path.join(PROJECTS_DIR, projectSlug, "characters.json");
  try {
    const raw = await fs.readFile(p, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeCharacters(
  projectSlug: string,
  chars: Character[]
): Promise<void> {
  const p = path.join(PROJECTS_DIR, projectSlug, "characters.json");
  await fs.writeFile(p, JSON.stringify(chars, null, 2));
}

export async function addCharacter(
  projectSlug: string,
  name: string,
  description: string,
  traits: string[],
  aliases: string[],
  notes: string
): Promise<Character> {
  const chars = await readCharacters(projectSlug);
  const now = new Date().toISOString();
  const c: Character = {
    id: generateId(),
    name,
    aliases: aliases || [],
    description,
    traits: traits || [],
    notes: notes || "",
    created: now,
    updated: now,
  };
  chars.push(c);
  await writeCharacters(projectSlug, chars);
  return c;
}

export async function listCharacters(
  projectSlug: string
): Promise<Character[]> {
  return readCharacters(projectSlug);
}

export async function updateCharacter(
  projectSlug: string,
  id: string,
  updates: Partial<Omit<Character, "id" | "created">>
): Promise<Character | null> {
  const chars = await readCharacters(projectSlug);
  const idx = chars.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  chars[idx] = { ...chars[idx], ...updates, updated: new Date().toISOString() };
  await writeCharacters(projectSlug, chars);
  return chars[idx];
}

// ---- places ----

async function readPlaces(projectSlug: string): Promise<Place[]> {
  const p = path.join(PROJECTS_DIR, projectSlug, "places.json");
  try {
    const raw = await fs.readFile(p, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writePlaces(
  projectSlug: string,
  places: Place[]
): Promise<void> {
  const p = path.join(PROJECTS_DIR, projectSlug, "places.json");
  await fs.writeFile(p, JSON.stringify(places, null, 2));
}

export async function addPlace(
  projectSlug: string,
  name: string,
  description: string,
  notes: string
): Promise<Place> {
  const places = await readPlaces(projectSlug);
  const now = new Date().toISOString();
  const pl: Place = {
    id: generateId(),
    name,
    description,
    notes: notes || "",
    created: now,
    updated: now,
  };
  places.push(pl);
  await writePlaces(projectSlug, places);
  return pl;
}

export async function listPlaces(projectSlug: string): Promise<Place[]> {
  return readPlaces(projectSlug);
}

export async function updatePlace(
  projectSlug: string,
  id: string,
  updates: Partial<Omit<Place, "id" | "created">>
): Promise<Place | null> {
  const places = await readPlaces(projectSlug);
  const idx = places.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  places[idx] = { ...places[idx], ...updates, updated: new Date().toISOString() };
  await writePlaces(projectSlug, places);
  return places[idx];
}
