export type FragmentType = "diary" | "novel" | "idea" | "note";
export type ProjectType = "diary" | "novel";

export interface Fragment {
  id: string;
  path: string;
  type: FragmentType;
  project: string;
  tags: string[];
  characters: string[];
  places: string[];
  timestamp: string;
  content: string;
}

export interface ProjectMeta {
  name: string;
  slug: string;
  type: ProjectType;
  description: string;
  created: string;
  tags: string[];
}

export interface Character {
  id: string;
  name: string;
  aliases: string[];
  description: string;
  traits: string[];
  notes: string;
  created: string;
  updated: string;
}

export interface Place {
  id: string;
  name: string;
  description: string;
  notes: string;
  created: string;
  updated: string;
}

export interface GlobalConfig {
  currentProject: string | null;
}
