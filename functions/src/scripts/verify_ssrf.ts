import { safeFetch } from '../utils/security';

async function main() {
    console.log("🛡️ [SENTINEL] Verifying SSRF Protection...");

    // Test 1: SAFE URL (Google)
    try {
        console.log("\n1. Testing SAFE URL (https://www.google.com)...");
        const res = await safeFetch('https://www.google.com');
        if (res.ok) {
            console.log(`   ✅ Success: Status ${res.status}`);
        } else {
            console.error(`   ❌ Failed: Status ${res.status}`);
        }
    } catch (e: any) {
        console.error("   ❌ Failed SAFE URL:", e.message);
    }

    // Test 2: UNSAFE IP (127.0.0.1)
    try {
        console.log("\n2. Testing UNSAFE IP (http://127.0.0.1)...");
        await safeFetch('http://127.0.0.1');
        console.error("   ❌ Failed: Should have blocked 127.0.0.1!");
    } catch (e: any) {
        if (e.message.includes('DNS Blocked') || e.message.includes('private')) {
            console.log("   ✅ Blocked Correctly: " + e.message);
        } else {
            console.error("   ⚠️ Blocked but with unexpected error:", e.message);
        }
    }

    // Test 3: UNSAFE Host (localhost)
    try {
        console.log("\n3. Testing UNSAFE Host (http://localhost)...");
        await safeFetch('http://localhost');
        console.error("   ❌ Failed: Should have blocked localhost!");
    } catch (e: any) {
        if (e.message && (e.message.includes('DNS Blocked') || e.message.includes('private'))) {
            console.log("   ✅ Blocked Correctly: " + e.message);
        } else {
            console.error("   ⚠️ Blocked but with unexpected error:", e); // Print full error
        }
    }

    // Test 4: UNSAFE Metadata (169.254.169.254)
    try {
        console.log("\n4. Testing Cloud Metadata (http://169.254.169.254)...");
        await safeFetch('http://169.254.169.254', { timeout: 2000 });
        console.error("   ❌ Failed: Should have blocked Metadata Service!");
    } catch (e: any) {
        if (e.message.includes('DNS Blocked') || e.message.includes('private')) {
            console.log("   ✅ Blocked Correctly: " + e.message);
        } else {
            console.error("   ⚠️ Blocked but with unexpected error:", e.message);
        }
    }
}

main().catch(console.error);
