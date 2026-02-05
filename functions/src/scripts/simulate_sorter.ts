
import { identifyEntities, FileContent } from "../soul_sorter";
import { EntityCategory, DetectedEntity } from "../types/forge";

// --- MOCK AI ---
class MockGenerativeModel {
    async generateContent(req: any) {
        // Parse the prompt to decide what to return
        const prompt = req[0] as string;
        const text = req[1] as string;

        console.log("[MOCK AI] Received Prompt request.");

        // Default extraction result
        const extraction = [
            { name: "Ghost King", category: "PERSON", context: "Appeared in the mist" },
            { name: "Shadow Wolf", category: "CREATURE", context: "Howling in distance" },
            { name: "Lost City", category: "LOCATION", context: "Ruins in the north" },
            { name: "Excalibur", category: "OBJECT", context: "Sword in stone" }
        ];

        return {
            response: {
                text: () => JSON.stringify(extraction)
            }
        };
    }
}

// --- MOCK FILES ---
const FILES: FileContent[] = [
    {
        id: "f1",
        name: "Thomas.md",
        saga: "Saga1",
        content: `---
name: Thomas
type: Person
role: Protagonist
---
Thomas is a brave warrior.`
    },
    {
        id: "f2",
        name: "Crystal Castle.md",
        saga: "Saga1",
        content: `---
name: Crystal Castle
type: Location
population: 5000
---
A shiny castle.`
    },
    {
        id: "f3",
        name: "Shadow Beast.md",
        saga: "Saga1",
        content: `# Shadow Beast
**Habitat**: Dark Forests
**Diet**: Souls

The Shadow Beast is dangerous.`
    },
    {
        id: "f4",
        name: "Chapter 1.md",
        saga: "Saga1",
        content: `The Ghost King walked towards the Lost City holding Excalibur. A Shadow Wolf watched him.`
    },
    // Edge Case: A file named "The Tavern" with a header but NO metadata (Should NOT be Anchor)
    {
        id: "f5",
        name: "The Tavern.md",
        saga: "Saga1",
        content: `# The Tavern
It was a nice place to drink.`
    }
];

async function runSimulation() {
    console.log("👻 STARTING SOUL SORTER SIMULATION...");

    const mockModel = new MockGenerativeModel() as any;
    const results = await identifyEntities(FILES, mockModel, "Saga1");

    console.log(`\n🔍 DETECTED ENTITIES: ${results.size}\n`);

    const checks = {
        thomas: false,
        castle: false,
        beast: false,
        tavern: false, // Should NOT exist as Anchor
        ghostKing: false,
        city: false
    };

    results.forEach((entity, key) => {
        console.log(`- [${entity.tier}] ${entity.name} (${entity.category}) | Reasoning: ${entity.reasoning}`);

        if (entity.name === "Thomas" && entity.tier === "ANCHOR" && entity.category === "PERSON") checks.thomas = true;
        if (entity.name === "Crystal Castle" && entity.tier === "ANCHOR" && entity.category === "LOCATION") checks.castle = true;
        if (entity.name === "Shadow Beast" && entity.tier === "ANCHOR" && entity.category === "CREATURE") checks.beast = true;

        if (entity.name === "The Tavern" && entity.tier === "ANCHOR") {
            console.error("❌ FAILURE: 'The Tavern' should NOT be an Anchor (Missing metadata).");
            checks.tavern = true; // Mark as failed check if true
        }

        if (entity.name === "Ghost King" && entity.tier === "GHOST" && entity.category === "PERSON") checks.ghostKing = true;
        if (entity.name === "Lost City" && entity.tier === "GHOST" && entity.category === "LOCATION") checks.city = true;
    });

    console.log("\n📋 VERIFICATION RESULTS:");
    console.log(`✅ Thomas (Person Anchor): ${checks.thomas ? "PASS" : "FAIL"}`);
    console.log(`✅ Crystal Castle (Location Anchor): ${checks.castle ? "PASS" : "FAIL"}`);
    console.log(`✅ Shadow Beast (Creature Anchor): ${checks.beast ? "PASS" : "FAIL"}`);
    console.log(`✅ The Tavern (Not Anchor): ${!checks.tavern ? "PASS" : "FAIL"}`);
    console.log(`✅ Ghost King (Person Ghost): ${checks.ghostKing ? "PASS" : "FAIL"}`);
    console.log(`✅ Lost City (Location Ghost): ${checks.city ? "PASS" : "FAIL"}`);

    if (checks.thomas && checks.castle && checks.beast && !checks.tavern && checks.ghostKing && checks.city) {
        console.log("\n✨ SUCCESS: All logic checks passed. Classification is strict and correct.");
    } else {
        console.error("\n💀 FAILURE: Some checks failed.");
        process.exit(1);
    }
}

runSimulation().catch(console.error);
