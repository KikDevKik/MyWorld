import { validateChatHistory } from '../utils/security';
import { HttpsError } from 'firebase-functions/v2/https';

function runTests() {
  console.log("🛡️ Running Chat History Validation Tests...");

  let passed = 0;
  let failed = 0;

  const testCases = [
    {
      desc: "Valid History",
      input: [
        { role: "user", message: "Hello" },
        { role: "model", message: "Hi there" }
      ],
      shouldFail: false
    },
    {
      desc: "Too Many Items (>100)",
      input: Array(101).fill({ role: "user", message: "a" }),
      shouldFail: true,
      errorMsg: "limit (100 items)"
    },
    {
      desc: "Too Many Chars (>100k)",
      input: [{ role: "user", message: "a".repeat(100001) }],
      shouldFail: true,
      errorMsg: "size limit (100k chars)"
    },
    {
      desc: "Invalid Item (Not Object)",
      input: ["string"],
      shouldFail: true,
      errorMsg: "Invalid chat item format"
    },
    {
      desc: "Invalid Item (Missing Role)",
      input: [{ message: "Hello" }],
      shouldFail: true,
      errorMsg: "string role and message"
    },
    {
      desc: "Invalid Item (Non-string Message)",
      input: [{ role: "user", message: 123 }],
      shouldFail: true,
      errorMsg: "string role and message"
    }
  ];

  for (const t of testCases) {
    try {
      validateChatHistory(t.input as any);
      if (t.shouldFail) {
        console.error(`❌ [FAIL] ${t.desc} -> Expected Error, but passed.`);
        failed++;
      } else {
        console.log(`✅ [PASS] ${t.desc}`);
        passed++;
      }
    } catch (e: any) {
      if (t.shouldFail) {
        // HttpsError checks might vary depending on instantiation, checking message is safer for this script
        if (e.message && (t.errorMsg ? e.message.includes(t.errorMsg) : true)) {
            console.log(`✅ [PASS] ${t.desc} -> Caught expected error: ${e.message}`);
            passed++;
        } else {
             console.error(`❌ [FAIL] ${t.desc} -> Expected error containing '${t.errorMsg}', got: ${e.message}`);
             failed++;
        }
      } else {
        console.error(`❌ [FAIL] ${t.desc} -> Unexpected Error:`, e);
        failed++;
      }
    }
  }

  console.log(`\n📊 Summary: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) process.exit(1);
}

runTests();
