export enum FolderRole {
    // Entities
    ENTITY_PEOPLE = 'ENTITY_PEOPLE',
    ENTITY_BESTIARY = 'ENTITY_BESTIARY',
    ENTITY_FACTIONS = 'ENTITY_FACTIONS',
    ENTITY_OBJECTS = 'ENTITY_OBJECTS',

    // World
    WORLD_CORE = 'WORLD_CORE',
    LORE_HISTORY = 'LORE_HISTORY',

    // Manuscripts
    SAGA_MAIN = 'SAGA_MAIN',
    SAGA_EXTRAS = 'SAGA_EXTRAS', // Added missing enum
    DRAFTS = 'DRAFTS', // Added missing enum
    RESOURCES = 'RESOURCES', // Added missing enum

    // Resources
    RESOURCES_IMG = 'RESOURCES_IMG',
    RESOURCES_AUDIO = 'RESOURCES_AUDIO'
}

export interface ProjectPath {
    id: string;
    name: string;
}

export interface ProjectConfig {
    // Core
    folderId?: string;
    projectName?: string;
    styleIdentity?: string; // Narrative Voice/Genre

    // Paths
    canonPaths?: ProjectPath[];
    resourcePaths?: ProjectPath[];
    primaryCanonPathId?: string | null;

    // Folder Mapping (Role -> ID)
    folderMapping?: {
        [key in FolderRole]?: string;
    };

    // Legacy
    characterVaultId?: string;
    bestiaryVaultId?: string; // Added missing legacy field
    chronologyPath?: ProjectPath;

    // State
    activeBookContext?: string;
    lastIndexed?: string;
    lastSignificantUpdate?: string;
    lastForgeScan?: string;
    lastArquitectoAnalysis?: string;
    arquitectoCachedPendingItems?: any[];
    arquitectoSummary?: string;

    // God Mode
    longTermMemory?: {
        cacheName: string;
        expirationTime: string;
        fileCount: number;
        updatedAt: string;
    };
}
