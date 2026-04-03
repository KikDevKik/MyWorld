import admin from 'firebase-admin';

// Configure for emulator
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";

admin.initializeApp({
    projectId: "decentralized-project"
});

const db = admin.firestore();

async function run() {
    const usersRef = db.collection('users');
    const usersSnap = await usersRef.limit(1).get();
    if (usersSnap.empty) {
        console.log("No users found.");
        return;
    }
    const userId = usersSnap.docs[0].id;
    console.log("Found User ID:", userId);

    const entitiesSnap = await db.collection('users').doc(userId).collection('WorldEntities').get();
    console.log(`Found ${entitiesSnap.size} entities in WorldEntities.`);

    entitiesSnap.forEach(doc => {
        console.log(doc.id, "=> projectId:", doc.data().projectId, "tier:", doc.data().tier, "status:", doc.data().status, "name:", doc.data().name);
    });
    process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
