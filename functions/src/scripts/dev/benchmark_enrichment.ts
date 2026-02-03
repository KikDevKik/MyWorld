import pLimit from 'p-limit';

// Mock Data
const ENTITY_COUNT = 20; // Enough to show difference
const MOCK_DELAY_MS = 1000; // 1 second per call (simulating AI latency)

// Mock Function
const mockEnrichEntity = async (name: string, index: number) => {
    await new Promise(resolve => setTimeout(resolve, MOCK_DELAY_MS));
    return `Enriched ${name} (${index})`;
};

async function runBenchmark() {
    console.log("⚡ Starting Enrichment Benchmark ⚡");
    console.log(`Config: ${ENTITY_COUNT} Entities, ${MOCK_DELAY_MS}ms Delay/Op`);

    const entities = Array.from({ length: ENTITY_COUNT }, (_, i) => `Entity_${i}`);

    // --- BASELINE (Serial) ---
    console.log("\nRunning BASELINE (Serial)...");
    const startSerial = performance.now();
    for (let i = 0; i < entities.length; i++) {
        await mockEnrichEntity(entities[i], i);
    }
    const endSerial = performance.now();
    const timeSerial = (endSerial - startSerial) / 1000;
    console.log(`✅ Serial Completed in: ${timeSerial.toFixed(2)}s`);

    // --- OPTIMIZED (Parallel) ---
    console.log("\nRunning OPTIMIZED (Parallel - Concurrency 5)...");
    const startParallel = performance.now();
    const limit = pLimit(5);
    const promises = entities.map((name, i) => limit(() => mockEnrichEntity(name, i)));
    await Promise.all(promises);
    const endParallel = performance.now();
    const timeParallel = (endParallel - startParallel) / 1000;
    console.log(`✅ Parallel Completed in: ${timeParallel.toFixed(2)}s`);

    // --- RESULTS ---
    console.log("\n📊 RESULTS:");
    console.log(`Baseline: ${timeSerial.toFixed(2)}s`);
    console.log(`Optimized: ${timeParallel.toFixed(2)}s`);
    const speedup = timeSerial / timeParallel;
    console.log(`🚀 Speedup: ${speedup.toFixed(2)}x`);
}

runBenchmark();
