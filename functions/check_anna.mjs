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
    console.log(`Checking 'Anna' status for user: ${userId}`);
    
    const colRef = db.collection('users').doc(userId).collection('WorldEntities');
    // Búsqueda flexible por si el nombre tiene algo más
    const snapshot = await colRef.where('name', '>=', 'Anna').where('name', '<=', 'Anna\uf8ff').get();
    
    if (snapshot.empty) {
        console.log("No documents found with name starting with 'Anna'.");
        // Intentar listar todos los recursos para ver si tiene otro nombre
        const allResources = await colRef.where('category', '==', 'RESOURCE').get();
        console.log("\nAvailable resources in WorldEntities:");
        allResources.forEach(doc => {
            console.log(`- [${doc.data().status}] ${doc.data().name} (ID: ${doc.id})`);
        });
        return;
    }

    snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`--- ENTITY FOUND ---`);
        console.log(`ID: ${doc.id}`);
        console.log(`Name: ${data.name}`);
        console.log(`Status: ${data.status}`);
        console.log(`Category: ${data.category}`);
    });
}

run().catch(console.error);
