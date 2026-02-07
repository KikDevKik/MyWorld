export interface ProjectPath {
  id: string;
  name: string;
}

export enum FolderRole {
  WORLD_CORE = "ROLE_WORLD_CORE",
  LORE_HISTORY = "ROLE_LORE_HISTORY",
  ENTITY_PEOPLE = "ROLE_ENTITY_PEOPLE",
  ENTITY_BESTIARY = "ROLE_ENTITY_BESTIARY",
  ENTITY_FACTIONS = "ROLE_ENTITY_FACTIONS",
  ENTITY_OBJECTS = "ROLE_ENTITY_OBJECTS",
  SAGA_MAIN = "ROLE_SAGA_MAIN",
  SAGA_EXTRAS = "ROLE_SAGA_EXTRAS",
  DRAFTS = "ROLE_DRAFTS",
  RESOURCES = "ROLE_RESOURCES"
}

export interface ProjectConfig {
  projectName?: string;
  canonPaths: ProjectPath[];
  primaryCanonPathId?: string | null;
  resourcePaths: ProjectPath[];
  activeBookContext: string;
  folderId?: string;
  characterVaultId?: string | null;
  chronologyPath?: ProjectPath | null; // Legacy support
  folderMapping?: Partial<Record<FolderRole, string>>; // Role -> FolderID
  lastIndexed?: string;
  lastForgeScan?: string;
  styleIdentity?: string;
  lastSignificantUpdate?: string;
  longTermMemory?: {
      cacheName: string;
      expirationTime: string;
      fileCount: number;
      updatedAt: string;
  };
}
