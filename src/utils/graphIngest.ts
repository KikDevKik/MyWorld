import { ProjectConfig } from '../types/core';

// Helper: Check if file should be processed for the Visual Graph
export const shouldIngestNode = (
    filePath: string,
    fileName: string,
    projectConfig: ProjectConfig | null,
    isReference: boolean = false
): boolean => {

    // 1. SYSTEM PREFIX EXCLUSION (Universal Convention)
    // If any part of the path starts with '_', exclude it.
    // We check the fileName too, just in case.
    if (fileName.startsWith('_') || filePath.includes('/_')) {
        return false;
    }

    // 2. PROJECT CONFIG EXCLUSION (Hard Rules)
    if (projectConfig) {
        // If we have explicit canon paths, strictly obey them?
        // Actually, the requirement says:
        // "If file path is in canonPaths -> Process"
        // "If file path is in referencePaths -> Ignore"

        // However, we often only have file IDs or flat paths in the browser.
        // We might not have the full path string easily accessible depending on the tree structure.
        // Assuming we traverse the tree, we can know if we are inside a reference folder.

        if (isReference) return false;
    }

    // 3. FALLBACK: If no config, assume safe unless system prefix (handled above).
    return true;
};

// Helper: Extract Group ID (The Solar Center)
export const determineGroupId = (
    frontmatter: any,
    parentFolderName: string | null
): string => {
    // Priority 1: Explicit Frontmatter
    if (frontmatter) {
        if (frontmatter.faction) return frontmatter.faction;
        if (frontmatter.group) return frontmatter.group;
        if (frontmatter.organization) return frontmatter.organization;
        if (frontmatter.affiliation) return frontmatter.affiliation;
    }

    // Priority 2: Implicit (Parent Folder)
    if (parentFolderName && parentFolderName !== 'root' && !parentFolderName.startsWith('_')) {
        return parentFolderName;
    }

    // Priority 3: Ronin / Universe
    return "RONIN";
};

// Main Ingestion Logic
// This usually runs on a list of files or recursively on the tree.
// For the client-side migration, we iterate the "unifiedNodes" or "FileTree".

export interface IngestedMeta {
    groupId: string;
    tier: 'protagonist' | 'secondary' | 'background';
    isGhost: boolean;
}

export const ingestNodeMetadata = (
    node: any, // Could be a FileNode or a GraphNode
    parentName: string | null = null
): IngestedMeta => {
    // Mock Frontmatter extraction (In reality, we might need to parse the content string if available,
    // or rely on what's already in the 'meta' field if pre-processed).

    // If we are scanning raw files, we'd parse YAML here.
    // For now, we assume 'node.meta' might hold some of this, or we rely on folder structure.

    const meta = node.meta || {};
    const frontmatter = meta.frontmatter || {}; // Hypothetical structure

    const groupId = determineGroupId(frontmatter, parentName);

    // Tier Logic (Optional enhancement)
    const tier = frontmatter.tier || 'secondary';

    return {
        groupId,
        tier,
        isGhost: false // Default
    };
};
