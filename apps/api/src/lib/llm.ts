import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

let genAI: GoogleGenerativeAI | null = null;
let flashModel: GenerativeModel | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables.');
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

function getFlashModel(): GenerativeModel {
  if (!flashModel) {
    flashModel = getGenAI().getGenerativeModel({ model: 'gemini-2.0-flash' });
  }
  return flashModel;
}

/**
 * Generate a single non-streaming text response from Gemini 2.0 Flash.
 */
export async function generateText(prompt: string): Promise<string> {
  const model = getFlashModel();
  const result = await model.generateContent(prompt);
  const response = result.response;
  return response.text();
}

/**
 * Stream a response from Gemini 2.0 Flash, calling onChunk for each chunk.
 * Used for streaming SQL insights/plan steps to the frontend via Socket.IO.
 */
export async function streamText(
  prompt: string,
  onChunk: (text: string) => void
): Promise<string> {
  const model = getFlashModel();
  const result = await model.generateContentStream(prompt);

  let fullText = '';
  for await (const chunk of result.stream) {
    const chunkText = chunk.text();
    fullText += chunkText;
    onChunk(chunkText);
  }
  return fullText;
}
