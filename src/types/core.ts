
export type GemId = 'perforador' | 'forja' | 'guardian' | 'tribunal' | 'laboratorio' | 'cronograma' | 'imprenta' | 'director';

export interface Gem {
  id: GemId;
  name: string;
  backgroundImage: string;
  systemInstruction: string;
  model: 'gemini-2.5-pro' | 'gemini-2.5-flash';
  thinkingBudget?: number;
  color?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  isThinking?: boolean;
}

// ¡REEMPLAZA la vieja 'DriveFile' con esto!
export interface DriveFile {
  id: string;
  name: string;
  type: 'file' | 'folder';
  mimeType: string;
  content?: string;
  children?: DriveFile[];
  category?: 'canon' | 'reference';
  parentId?: string; // 👈 Added for tree building
  smartTags?: string[]; // 🟢 Laboratory V2
}

export interface IndexedFile {
  id: string;
  name: string;
  timelineDate?: string; // ISO String
  category?: 'canon' | 'reference';
}

export interface TimelineEvent {
  id: string;
  eventName: string;
  description: string;
  absoluteYear: number; // Integer for fantasy eras
  confidence: 'high' | 'low';
  status: 'suggested' | 'confirmed';
  sourceFileId: string;
  era?: string;
}

export type AspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";

// 🟢 NEW PROJECT CONFIG INTERFACE (Matches Backend)
export interface ProjectPath {
    id: string;
    name: string;
}

export interface ProjectConfig {
  projectName?: string; // 👈 Identity
  canonPaths: ProjectPath[];
  primaryCanonPathId?: string | null; // 👈 SINGLE SOURCE OF TRUTH
  resourcePaths: ProjectPath[];
  // chronologyPath: ProjectPath | null; // ❌ REMOVED (Legacy)
  activeBookContext: string;
  folderId?: string;
  characterVaultId?: string | null;
  lastIndexed?: string;
  lastForgeScan?: string; // 👈 Timestamp for Incremental Forge Scan
  styleIdentity?: string; // 👈 Auto-detected Style DNA
}

export interface ForgeSession {
  id: string;
  name: string;
  type?: 'director' | 'forge'; // 👈 Distinguish session types
  createdAt: string;
  updatedAt: string;
}

export interface CharacterSnippet {
  sourceBookId: string;
  sourceBookTitle: string;
  text: string;
}

export interface Character {
  id: string; // Slug
  name: string;
  tier: 'MAIN' | 'SUPPORTING' | 'BACKGROUND';
  sourceType: 'MASTER' | 'LOCAL' | 'HYBRID';
  sourceContext: string; // 'GLOBAL' or FolderID
  masterFileId?: string;
  appearances: string[]; // Book IDs
  snippets: CharacterSnippet[];
  // Extended fields
  age?: string;
  role?: string;
  faction?: string;
  content?: string; // Derived content
  description?: string;
  bio?: string;
  body?: string;
  status?: 'EXISTING' | 'DETECTED';
  contextualAnalysis?: string; // 🔮 Phase 2: AI RAG Analysis
  sources?: string[]; // 📚 Phase 3: RAG Transparency
}
