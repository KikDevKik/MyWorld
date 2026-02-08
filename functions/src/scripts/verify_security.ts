import { validateUrlDns, isPrivateIp } from '../utils/security';

async function runTests() {
  console.log("🛡️ Running Security Verification...");

  const testCases = [
    { url: 'http://google.com', expected: true, desc: 'Public URL' },
    { url: 'https://example.com', expected: true, desc: 'Public HTTPS' },
    { url: 'http://localhost', expected: false, desc: 'Localhost (Lexical)' },
    { url: 'http://127.0.0.1', expected: false, desc: 'Loopback IP' },
    { url: 'http://169.254.169.254', expected: false, desc: 'Metadata IP' },
    { url: 'http://metadata.google.internal', expected: false, desc: 'Metadata Domain' },
    { url: 'http://10.0.0.1', expected: false, desc: 'Private 10.x' },
    { url: 'http://192.168.1.1', expected: false, desc: 'Private 192.168.x' },
    { url: 'http://[::1]', expected: false, desc: 'IPv6 Loopback' },
    { url: 'http://[::ffff:127.0.0.1]', expected: false, desc: 'IPv4 Mapped IPv6' },
  ];

  let passed = 0;
  let failed = 0;

  for (const t of testCases) {
    try {
      const result = await validateUrlDns(t.url);
      if (result === t.expected) {
        console.log(`✅ [PASS] ${t.desc} (${t.url}) -> ${result}`);
        passed++;
      } else {
        console.error(`❌ [FAIL] ${t.desc} (${t.url}) -> Expected ${t.expected}, got ${result}`);
        failed++;
      }
    } catch (e) {
      console.error(`💥 [ERROR] ${t.desc} (${t.url}) -> Exception:`, e);
      failed++;
    }
  }

  // Test isPrivateIp directly
  console.log("\n🧪 Testing isPrivateIp direct logic...");
  const ipTests = [
      { ip: '127.0.0.1', expected: true },
      { ip: '8.8.8.8', expected: false },
      { ip: '::1', expected: true },
      { ip: '::ffff:10.0.0.1', expected: true },
      { ip: '2001:4860:4860::8888', expected: false } // Google Public DNS IPv6
  ];

  for (const t of ipTests) {
       const res = isPrivateIp(t.ip);
       if (res === t.expected) {
           console.log(`✅ [PASS] IP ${t.ip} -> ${res}`);
           passed++;
       } else {
           console.error(`❌ [FAIL] IP ${t.ip} -> Expected ${t.expected}, got ${res}`);
           failed++;
       }
  }

  console.log(`\n📊 Summary: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch(console.error);
