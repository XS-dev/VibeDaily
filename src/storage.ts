import fs from "node:fs/promises";
import path from "node:path";
import { existsSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
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

const BASE = path.join(
  process.env.HOME || process.env.USERPROFILE || "",
  ".vibedaily"
);
const PROJECTS_DIR = path.join(BASE, "projects");
const CONFIG_PATH = path.join(BASE, "config.json");

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

async function saveImages(
  projectSlug: string,
  fragmentId: string,
  imagePaths: string[]
): Promise<string[]> {
  if (!imagePaths || imagePaths.length === 0) return [];
  const imagesDir = path.join(PROJECTS_DIR, projectSlug, "images", fragmentId);
  ensureDir(imagesDir);
  const saved: string[] = [];
  for (let i = 0; i < imagePaths.length; i++) {
    const src = imagePaths[i];
    if (!existsSync(src)) continue;
    const ext = path.extname(src) || ".png";
    const dest = path.join(imagesDir, `${i}${ext}`);
    copyFileSync(src, dest);
    saved.push(dest);
  }
  return saved;
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

  const images = await saveImages(projectSlug, id, imagePaths);

  const fm: Record<string, unknown> = {
    id,
    type,
    project: projectSlug,
    tags,
    characters: characterIds,
    places: placeIds,
    images,
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
  if (updates.images !== undefined) {
    const imagesDir = path.join(PROJECTS_DIR, projectSlug, "images", fragmentId);
    if (existsSync(imagesDir)) rmSync(imagesDir, { recursive: true, force: true });
    newImages = await saveImages(projectSlug, fragmentId, updates.images);
  }

  const fm: Record<string, unknown> = {
    id: frag.id,
    type: updates.type ?? frag.type,
    project: frag.project,
    tags: updates.tags ?? frag.tags,
    characters: updates.characters ?? frag.characters,
    places: updates.places ?? frag.places,
    images: newImages,
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
