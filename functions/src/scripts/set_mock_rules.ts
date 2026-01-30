import * as admin from 'firebase-admin';

// Initialize Firebase Admin (Assumes credentials are set in environment or default)
// If running locally with emulator, this might need specific config.
// For now, this is a template script for the user/developer to run.

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function setMockProjectConfig(userId: string) {
  if (!userId) {
    console.error("❌ Error: User ID is required.");
    process.exit(1);
  }

  console.log(`🔧 Setting Mock Project Config for User: ${userId}`);

  const mockConfig = {
    contextRules: {
      // REPLACE THESE WITH REAL FOLDER IDS FROM YOUR DRIVE
      "FOLDER_ID_CANON": "CANON",       // e.g. "1a2b3c..."
      "FOLDER_ID_RESOURCES": "REFERENCE", // e.g. "4d5e6f..."
      "FOLDER_ID_IGNORE": "IGNORE"        // e.g. "7g8h9i..."
    },
    // Preserve existing fields if needed, or set defaults
    chronologyPath: "MI HISTORIA/Estructura Principal/Flujo de Tiempo",
    activeBookContext: "",
    updatedAt: new Date().toISOString()
  };

  try {
    await db.collection("users").doc(userId).collection("profile").doc("project_config").set(mockConfig, { merge: true });
    console.log("✅ Mock Configuration Applied Successfully!");
    console.log("📂 Context Rules:", JSON.stringify(mockConfig.contextRules, null, 2));
    console.log("\n[NEXT STEPS]");
    console.log("1. Run 'debugGetIndexStats' to see current state.");
    console.log("2. Run 'indexTDB' to re-index with these rules.");
    console.log("3. Verify 'Mohamed' file presence/absence.");
  } catch (error) {
    console.error("💥 Error setting mock config:", error);
  }
}

// Get User ID from command line arg
const targetUserId = process.argv[2];

setMockProjectConfig(targetUserId).then(() => {
  console.log("Done.");
  process.exit(0);
});
