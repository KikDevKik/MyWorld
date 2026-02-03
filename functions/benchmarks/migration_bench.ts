
import { performance } from 'perf_hooks';

// --- MOCK DATA & SETUP ---
const BATCH_SIZE = 100;
const UNIQUE_FOLDERS = 50;
const API_LATENCY_MS = 200;

// Generate mock docs with repeating folder IDs
const mockDocs = Array.from({ length: BATCH_SIZE }, (_, i) => ({
    id: `doc_${i}`,
    data: () => ({
        folderId: `folder_${i % UNIQUE_FOLDERS}` // Repetition ensures cache testing
    })
}));

// Mock API Call
async function mockDriveGet(fileId: string): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, API_LATENCY_MS));
    return {
        data: {
            parents: [`parent_of_${fileId}`]
        }
    };
}

// Mock Resolve (Simplified from actual code)
async function resolveProjectRoot(
    folderId: string,
    targetRootId: string,
    cache: Map<string, string | null>
): Promise<string | null> {
    if (folderId === targetRootId) return targetRootId;
    if (cache.has(folderId)) return cache.get(folderId)!;

    // Simulate API call
    await mockDriveGet(folderId);

    // For benchmark simplicity, we assume 1 level deep or immediate resolution
    // to focus on the "request" latency rather than recursion depth latency.
    // In reality, recursion adds more latency, making parallelization even more effective.
    const result = targetRootId;

    cache.set(folderId, result);
    return result;
}

// --- SERIAL IMPLEMENTATION (Current) ---
async function runSerial() {
    console.log("Starting Serial Benchmark...");
    const start = performance.now();
    const cache = new Map<string, string | null>();
    const targetRootId = "ROOT_ID";

    for (const doc of mockDocs) {
        const data = doc.data();
        await resolveProjectRoot(data.folderId, targetRootId, cache);
    }

    const end = performance.now();
    return end - start;
}

// --- PARALLEL IMPLEMENTATION (Optimized) ---
async function runParallel() {
    console.log("Starting Parallel Benchmark...");
    const start = performance.now();
    const cache = new Map<string, string | null>();
    const targetRootId = "ROOT_ID";

    // 1. Deduplicate
    const uniqueFolderIds = Array.from(new Set(mockDocs.map(d => d.data().folderId)));

    // 2. Parallel Execution with Limit (10)
    const CONCURRENCY_LIMIT = 10;

    // Simple chunking for concurrency limit
    for (let i = 0; i < uniqueFolderIds.length; i += CONCURRENCY_LIMIT) {
        const chunk = uniqueFolderIds.slice(i, i + CONCURRENCY_LIMIT);
        await Promise.all(chunk.map(fid => resolveProjectRoot(fid, targetRootId, cache)));
    }

    // 3. Original Loop (Now Hits Cache)
    for (const doc of mockDocs) {
        const data = doc.data();
        await resolveProjectRoot(data.folderId, targetRootId, cache);
    }

    const end = performance.now();
    return end - start;
}

// --- RUNNER ---
async function main() {
    console.log(`\n--- BENCHMARK CONFIGURATION ---`);
    console.log(`Docs: ${BATCH_SIZE}`);
    console.log(`Unique Folders: ${UNIQUE_FOLDERS}`);
    console.log(`API Latency: ${API_LATENCY_MS}ms`);
    console.log(`Concurrency Limit: 10`);
    console.log(`-------------------------------`);

    const serialTime = await runSerial();
    console.log(`\n🔴 Serial Time: ${serialTime.toFixed(2)}ms`);

    const parallelTime = await runParallel();
    console.log(`\n🟢 Parallel Time: ${parallelTime.toFixed(2)}ms`);

    const improvement = serialTime / parallelTime;
    console.log(`\n⚡ Speedup: ${improvement.toFixed(2)}x`);
}

main().catch(console.error);
