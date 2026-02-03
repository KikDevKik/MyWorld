
import { performance } from 'perf_hooks';

// --- MOCKS ---
const LATENCY_READ = 50;
const LATENCY_WRITE = 20;
const LATENCY_COMMIT = 50;
const LATENCY_GET_ALL = 80;
const LATENCY_BATCH_COMMIT = 100;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class MockTransaction {
    async get(ref: any) {
        await delay(LATENCY_READ);
        return { exists: false, data: () => ({}) };
    }
    set(ref: any, data: any) {
        // In transaction, set is usually synchronous in memory until commit
    }
}

class MockDb {
    // Current N+1 Approach Simulation
    async runTransaction(updateFunction: (t: MockTransaction) => Promise<any>) {
        const t = new MockTransaction();
        await updateFunction(t);
        await delay(LATENCY_COMMIT); // Simulate commit roundtrip
    }

    // Optimized Batch Approach Simulation
    async getAll(...refs: any[]) {
        await delay(LATENCY_GET_ALL); // Bulk read
        return refs.map(() => ({ exists: false, data: () => ({}) }));
    }

    batch() {
        return new MockBatch();
    }
}

class MockBatch {
    set(ref: any, data: any) {}
    async commit() {
        await delay(LATENCY_BATCH_COMMIT);
    }
}

// --- BENCHMARK ---

async function runBenchmark() {
    console.log("🔥 RUNNING PERFORMANCE BENCHMARK: MANIFEST SYNC 🔥");
    const db = new MockDb();

    // Scenario: 30 entities total (e.g., 3 files * 10 entities)
    const entities = Array.from({ length: 30 }, (_, i) => ({ name: `Entity_${i}`, type: 'character' }));

    // --- TEST 1: CURRENT N+1 APPROACH ---
    console.log("\n1️⃣  Testing Current N+1 Transaction Loop...");
    const startLegacy = performance.now();

    for (const entity of entities) {
        // Simulate generating ref
        const ref = {};

        await db.runTransaction(async (transaction) => {
            await transaction.get(ref);
            // logic...
            transaction.set(ref, entity);
        });
    }

    const endLegacy = performance.now();
    const timeLegacy = (endLegacy - startLegacy).toFixed(2);
    console.log(`   ❌ Result: ${timeLegacy} ms`);

    // --- TEST 2: OPTIMIZED BATCH APPROACH ---
    console.log("\n2️⃣  Testing Optimized Batch Read-Write...");
    const startOpt = performance.now();

    // Step 1: Bulk Read
    const refs = entities.map(() => ({}));
    await db.getAll(...refs);

    // Step 2: In-Memory Processing (negligible time, but let's simulate 5ms)
    await delay(5);
    const batch = db.batch();
    for (const entity of entities) {
        batch.set({}, entity);
    }

    // Step 3: Batch Commit
    await batch.commit();

    const endOpt = performance.now();
    const timeOpt = (endOpt - startOpt).toFixed(2);
    console.log(`   ✅ Result: ${timeOpt} ms`);

    // --- SUMMARY ---
    const improvement = (parseFloat(timeLegacy) / parseFloat(timeOpt)).toFixed(1);
    console.log(`\n🚀 IMPROVEMENT FACTOR: ${improvement}x FASTER`);
}

runBenchmark();
