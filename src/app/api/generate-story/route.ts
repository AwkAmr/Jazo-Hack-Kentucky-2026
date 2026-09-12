import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(request: Request) {
  try {
    const { messages, assignment } = await request.json();

    if (!messages || !assignment) {
      return NextResponse.json({ error: 'Messages and assignment are required' }, { status: 400 });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const vertexProject = process.env.GOOGLE_CLOUD_PROJECT;

    if (!geminiApiKey && !vertexProject) {
      return NextResponse.json({ error: 'API key or Vertex Project is missing' }, { status: 500 });
    }

    const ai = vertexProject
      ? new GoogleGenAI({ vertexai: true, project: vertexProject, location: 'global' } as any)
      : new GoogleGenAI({ apiKey: geminiApiKey });

    // Format transcript for the Editor
    const transcript = messages.map((m: any) => `${m.role === 'user' ? 'User' : 'Jazo'}: ${m.parts[0].text}`).join('\n\n');

    const systemInstruction = `You are an elite, world-class editor and copywriter working for Prologue Stories LLC.
Your job is to take a raw interview transcript and transform it into a polished, compelling marketing asset.

Here is the Assignment Brief:
${assignment}

Stylistic Constraints (CRITICAL):
- Do NOT use emojis.
- Do NOT use markdown symbols such as # for headers.
- Do NOT use em dashes.
- Make the tone professional, fun, and cheerful, perfect for an engaging social media post.
- Do NOT structure it like a tedious, cliché LinkedIn post. Keep it snappy and engaging.
- Pull quotes MUST be extracted ONLY from the participant (the User), never from the interviewer (Jazo).

You MUST output your response as a valid JSON object matching this exact structure:
{
  "story": "The fully drafted social media post matching the requested content type, written beautifully and ready to publish.",
  "pull_quotes": [
    "The 3-5 most compelling, raw, word-for-word quotes from the User in the transcript. Never quote Jazo.",
    "Another great quote..."
  ]
}

DO NOT include any markdown code block wrappers (like \`\`\`json) in your final output, just raw JSON text.`;

    console.time('Story_Generation_Time');

    const fallbackModels = ['gemini-3.1-pro-preview', 'gemini-3-pro-preview', 'gemini-2.5-pro'];
    let response = null;
    let lastError = null;

    for (const model of fallbackModels) {
      try {
        console.log(`[Story Generator] Attempting with model: ${model}`);
        response = await ai.models.generateContent({
          model: model,
          contents: [
            { role: 'user', parts: [{ text: `Here is the raw interview transcript:\n\n${transcript}\n\nPlease generate the final story and pull quotes based on the assignment brief.` }] }
          ],
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.7
          }
        });

        if (response && response.text) {
          console.log(`[Story Generator] Success with ${model}`);
          break; // Stop falling back if successful
        }
      } catch (err: any) {
        console.warn(`[Story Generator] Model ${model} failed:`, err.message);
        lastError = err;
      }
    }

    console.timeEnd('Story_Generation_Time');

    if (!response || !response.text) {
      throw lastError || new Error("All fallback models failed to generate the story.");
    }

    let jsonString = response.text;
    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonString = jsonMatch[0];
    }
    const parsedData = JSON.parse(jsonString);

    return NextResponse.json(parsedData);

  } catch (error) {
    console.error('Story Generation Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
