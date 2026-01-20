import * as crypto from 'crypto';

/**
 * Generates a deterministic ID for a graph node using SHA-256.
 * Formula: SHA256(projectId + normalized_name + type)
 *
 * @param projectId The ID of the project (Root Folder ID).
 * @param name The name of the entity (e.g., "Excalibur").
 * @param type The type of the entity (e.g., "object").
 * @returns A hex string representing the unique ID.
 */
export function generateDeterministicId(projectId: string, name: string, type: string): string {
    const normalizedName = name.trim().toLowerCase();
    const normalizedType = type.trim().toLowerCase();
    const input = `${projectId}:${normalizedName}:${normalizedType}`;

    return crypto.createHash('sha256').update(input).digest('hex');
}
