import admin from 'firebase-admin';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// In this environment, we should assume the emulator if it's running, or direct access.
// Since I don't have service account keys, I'll check for emulators first.
if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log("Using Firestore Emulator at", process.env.FIRESTORE_EMULATOR_HOST);
} else {
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8088";
    console.log("Setting Firestore Emulator host to 127.0.0.1:8088");
}

admin.initializeApp({
    projectId: "myword-67b03"
});

const db = getFirestore();

async function crawl(ref, path = "") {
    const collections = await ref.listCollections();
    for (const col of collections) {
        const fullColPath = path ? `${path}/${col.id}` : col.id;
        console.log(`\n--- COLLECTION: ${fullColPath} ---`);
        const docs = await col.listDocuments();
        if (docs.length === 0) {
            console.log(`  (empty)`);
        }
        for (const docRef of docs) {
            const docSnap = await docRef.get();
            console.log(`  DOCUMENT: ${docRef.id} [exists: ${docSnap.exists}]`);
            if (docSnap.exists) {
                // If doc is large, maybe don't print everything, but we need to see key fields
                const data = docSnap.data();
                if (fullColPath.endsWith('/profile')) {
                   if (docRef.id === 'project_config') {
                       console.log(`    folderId: ${data.folderId}`);
                       console.log(`    resourcePaths:`, JSON.stringify(data.resourcePaths));
                   }
                } else if (fullColPath.includes('WorldEntities')) {
                   console.log(`    projectId: ${data.projectId}, category: ${data.category}, tier: ${data.tier}, status: ${data.status}, name: ${data.name}`);
                } else if (fullColPath.includes('project_config')) {
                   console.log(`    folderId: ${data.folderId}, resourcePaths:`, data.resourcePaths);
                }
            }
            await crawl(docRef, `${fullColPath}/${docRef.id}`);
        }
    }
}

async function run() {
    console.log("--- STARTING DEEP DATABASE CRAWL ---");
    await crawl(db);
    console.log("\n--- CRAWL COMPLETE ---");
}

run().catch(err => {
    console.error("Error during verification:", err);
    process.exit(1);
});
