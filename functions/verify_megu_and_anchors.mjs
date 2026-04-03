import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8088";

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: "myword-67b03"
    });
}

const db = getFirestore();

async function run() {
    console.log("--- STARTING DATA MINING OPERATION ---");
    const userId = "H1E75JzP7NXmM4yw4nUOmxkESw02";

    // --- OBJETIVO 1: BÚSQUEDA DE MEGU ---
    console.log("\n[OBJ 1] Searching for 'Megu' in WorldEntities...");
    const entitiesRef = db.collection('users').doc(userId).collection('WorldEntities');
    
    // Exact name search
    const meguExact = await entitiesRef.where('name', '==', 'Megu').get();
    
    // Fuzzy search (starting with Megu)
    const meguFuzzy = await entitiesRef.where('name', '>=', 'Megu').where('name', '<=', 'Megu\uf8ff').get();
    
    console.log(`- Exact matches: ${meguExact.size}`);
    console.log(`- Fuzzy matches: ${meguFuzzy.size}`);
    
    meguFuzzy.forEach(doc => {
        const d = doc.data();
        console.log(`  FOUND ENTITY: ID=${doc.id}, Name=${d.name}, Category=${d.category}, ProjectId=${d.projectId}`);
    });

    console.log("\n[OBJ 1] Searching for 'Megu' in Deep Chunks (TDB_Index)...");
    // Search in the chunks collection group
    const chunksRef = db.collectionGroup('chunks');
    const chunksSnap = await chunksRef.where('userId', '==', userId).get();
    
    let meguInChunksCount = 0;
    chunksSnap.forEach(doc => {
        if (doc.data().text && doc.data().text.includes('Megu')) {
            meguInChunksCount++;
            if (meguInChunksCount <= 3) {
                console.log(`  CHUNK MATCH (${doc.id}): File=${doc.data().fileName}, Path=${doc.data().path}`);
            }
        }
    });
    console.log(`- Total chunks containing 'Megu': ${meguInChunksCount}`);

    // --- OBJETIVO 2: AUDITORÍA DE ANCHORS ---
    console.log("\n[OBJ 2] Auditing ANCHOR distribution...");
    const anchorsSnap = await entitiesRef.where('tier', '==', 'ANCHOR').get();
    
    const stats = {};
    anchorsSnap.forEach(doc => {
        const cat = doc.data().category || 'UNDEFINED';
        stats[cat] = (stats[cat] || 0) + 1;
    });
    
    console.log(`- Total ANCHORS: ${anchorsSnap.size}`);
    console.log("- Distribution by Category:");
    Object.entries(stats).forEach(([cat, count]) => {
        console.log(`  * ${cat}: ${count}`);
    });

    console.log("\n--- OPERATION COMPLETE ---");
}

run().catch(console.error);
