import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8088";

admin.initializeApp({
    projectId: "myword-67b03"
});

const db = getFirestore();

async function run() {
    const userId = "H1E75JzP7NXmM4yw4nUOmxkESw02";
    const projectId = "1efxUZyNTsruZFuA6UA6qn68y3vAAdsqn";
    const tiers = ['ANCHOR', 'GHOST', 'LIMBO'];

    console.log(`Running query: projectId == ${projectId} AND tier IN ${tiers}`);
    
    try {
        const col = db.collection('users').doc(userId).collection('WorldEntities');
        // Node SDK API:
        const q = col.where('projectId', '==', projectId).where('tier', 'in', tiers);
        const snap = await q.get();
        console.log(`Query successful! Found ${snap.size} documents.`);
    } catch (err) {
        console.error("Query FAILED:", err.message);
        // Error codes in Node SDK are different
    }
}

run().catch(console.error);
