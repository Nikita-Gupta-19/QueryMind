import { GoogleGenerativeAI } from '@google/generative-ai';

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  try {
    const result = await model.embedContent("Hello world");
    console.log("gemini-embedding-001 success, dimensions:", result.embedding.values.length);
  } catch (e) {
    console.error("gemini-embedding-001 failed:", e.message);
  }
}

main();
