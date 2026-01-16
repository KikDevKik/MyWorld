const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

async function trigger() {
  console.log("Triggering Index Error...");
  try {
    // Arbitrary userId, but valid structure.
    const q = db.collectionGroup("chunks")
        .where("userId", "==", "JULES_TEST_USER")
        .where("projectId", "==", null);

    await q.get();
    console.log("Success? That's unexpected. Index exists?");
  } catch (e) {
    console.log("Error Caught!");
    console.log(e.message);
    if (e.details) console.log(e.details);
  }
}

trigger();
