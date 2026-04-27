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
    const userId = "H1E75JzP7NXmM4yw4nUOmxkESw02";
    console.log(`Checking resource for user: ${userId}`);
    
    const colRef = db.collection('users').doc(userId).collection('WorldEntities');
    const snapshot = await colRef.where('category', '==', 'RESOURCE').limit(1).get();
    
    if (snapshot.empty) {
        console.log("No documents found with category: 'RESOURCE'.");
        return;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    console.log("--- DOCUMENT FOUND ---");
    console.log("ID:", doc.id);
    console.log("Name:", data.name);
    console.log("Category:", data.category);
    console.log("ProjectId (Raw):", data.projectId);
    
    const expectedId = '1efxUZyNTsruZFuA6UA6qn68y3vAAdsqn';
    if (data.projectId === expectedId) {
        console.log("MATCH: ProjectId is equal to expected ID.");
    } else {
        console.log(`MISMATCH: ProjectId is '${data.projectId}', expected '${expectedId}'.`);
    }
}

run().catch(console.error);
