
import { Readable } from 'stream';
import matter from 'gray-matter';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

// Mock streamToString
async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

async function runTest() {
  console.log("🚀 Starting Parsing Test...");

  // 1. Simulate Drive Stream (Standard Markdown)
  const mockContent = `---
title: Test Document
date: 2023-01-01
---
# Chapter 1
This is a test document. It has some content.
Here is a second paragraph.
`;

  console.log("1. Creating Mock Stream...");
  const stream = new Readable();
  stream.push(mockContent);
  stream.push(null); // End of stream

  // 2. Test Stream to String
  console.log("2. Testing streamToString...");
  const content = await streamToString(stream);
  console.log(`   [RESULT] Content Length: ${content.length}`);
  if (content !== mockContent) {
      console.error("   [ERROR] Stream content mismatch!");
  } else {
      console.log("   [OK] Stream content matches.");
  }

  // 3. Test Gray Matter
  console.log("3. Testing gray-matter...");
  const parsed = matter(content);
  const cleanContent = parsed.content;
  console.log(`   [RESULT] Clean Content Length: ${cleanContent.length}`);
  console.log(`   [INFO] Clean Content Preview: ${cleanContent.substring(0, 50)}...`);

  if (cleanContent.includes("---")) {
      console.warn("   [WARN] Frontmatter might be leaking into content!");
  } else {
      console.log("   [OK] Frontmatter stripped correctly.");
  }

  // 4. Test Splitter
  console.log("4. Testing RecursiveCharacterTextSplitter...");
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 100,
    chunkOverlap: 20,
  });

  const chunks = await splitter.splitText(cleanContent);
  console.log(`   [RESULT] Chunks Generated: ${chunks.length}`);

  chunks.forEach((c, i) => {
      console.log(`   [CHUNK ${i}] Length: ${c.length}`);
  });

  if (chunks.length === 0) {
      console.error("   [ERROR] Splitter produced 0 chunks!");
  } else {
      console.log("   [OK] Splitter working.");
  }

  // 5. Test Empty/Weird Content
  console.log("5. Testing Edge Cases (Empty/Null)...");
  const emptyParsed = matter("");
  console.log(`   [EMPTY] Content: '${emptyParsed.content}'`);

  const splitter2 = new RecursiveCharacterTextSplitter({ chunkSize: 100, chunkOverlap: 20 });
  const emptyChunks = await splitter2.splitText(emptyParsed.content);
  console.log(`   [EMPTY] Chunks: ${emptyChunks.length}`);

}

runTest().catch(console.error);
