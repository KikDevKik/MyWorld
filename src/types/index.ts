export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    type: 'file' | 'folder';
    children?: DriveFile[];
    category?: 'canon' | 'reference';
    path?: string; // 🟢 Added path
    content?: string; // 🟢 Added content
}

export type GemId = string;

export type Gem = {
    id: string;
    name: string;
    model: string;
    color: string;
    backgroundImage: string;
    systemInstruction: string;
    thinkingBudget?: number;
};

export type TimelineEvent = {
    id: string;
    eventName: string;
    description: string;
    absoluteYear: number;
    sourceFileId: string;
    status: 'suggested' | 'confirmed';
};

export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

// Re-export Character from graph for convenience if needed, but it's better to import from graph.ts or forge.ts
// But to fix existing errors quickly:
export type { Character } from './graph';
export type { EntityCategory, EntityTier, SoulEntity } from './forge';
export type { ProjectConfig, ProjectPath, FolderRole } from './project';
