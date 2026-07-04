import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

// In-memory cache to prevent burning API quota on repeated test queries
const llmCache = new Map<string, string>();

function getGenAI(customApiKey?: string): GoogleGenerativeAI {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not provided and not defined in environment variables.');
  }
  return new GoogleGenerativeAI(apiKey);
}

function getFlashModel(customApiKey?: string): GenerativeModel {
  return getGenAI(customApiKey).getGenerativeModel({ model: 'gemini-2.0-flash' });
}



/**
 * Generate a single non-streaming text response from Gemini 2.0 Flash.
 */
export async function generateText(prompt: string, customApiKey?: string): Promise<string> {
  const cacheKey = prompt.trim();
  if (llmCache.has(cacheKey)) {
    console.log('[LLM] Cache hit! Returning saved response to save API quota.');
    return llmCache.get(cacheKey)!;
  }

  try {
    const model = getFlashModel(customApiKey);
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    llmCache.set(cacheKey, text);
    return text;
  } catch (err: any) {
    const errMsg = err.message || String(err);
    console.error('[LLM] Gemini API call failed:', errMsg);
    
    // Parse 429 rate limit error to provide a clean message
    if (errMsg.includes('429 Too Many Requests') || errMsg.includes('Quota exceeded')) {
      const match = errMsg.match(/retry in ([\d\.]+)s/);
      const waitTime = match ? Math.ceil(parseFloat(match[1])) : 60;
      throw new Error(`Gemini Free Tier speed limit reached. Please wait ${waitTime} seconds and try again.`);
    }
    
    throw err;
  }
}

/**
 * Stream a response from Gemini 2.0 Flash, calling onChunk for each chunk.
 * Used for streaming SQL insights/plan steps to the frontend via Socket.IO.
 */
export async function streamText(
  prompt: string,
  onChunk: (text: string) => void,
  customApiKey?: string
): Promise<string> {
  const cacheKey = prompt.trim();
  if (llmCache.has(cacheKey)) {
    console.log('[LLM] Cache hit for stream! Returning saved response instantly.');
    const cachedText = llmCache.get(cacheKey)!;
    onChunk(cachedText);
    return cachedText;
  }

  try {
    const model = getFlashModel(customApiKey);
    const result = await model.generateContentStream(prompt);

    let fullText = '';
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      fullText += chunkText;
      onChunk(chunkText);
    }
    
    llmCache.set(cacheKey, fullText);
    return fullText;
  } catch (err: any) {
    const errMsg = err.message || String(err);
    console.error('[LLM] Gemini streaming failed:', errMsg);
    
    // Parse 429 rate limit error to provide a clean message
    if (errMsg.includes('429 Too Many Requests') || errMsg.includes('Quota exceeded')) {
      const match = errMsg.match(/retry in ([\d\.]+)s/);
      const waitTime = match ? Math.ceil(parseFloat(match[1])) : 60;
      throw new Error(`Gemini Free Tier speed limit reached. Please wait ${waitTime} seconds and try again.`);
    }
    
    throw err;
  }
}
