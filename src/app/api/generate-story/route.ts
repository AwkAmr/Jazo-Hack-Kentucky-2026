import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(request: Request) {
  try {
    const { messages, assignment } = await request.json();

    if (!messages || !assignment) {
      return NextResponse.json({ error: 'Messages and assignment are required' }, { status: 400 });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json({ error: 'API key is missing' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    // Format transcript for the Editor
    const transcript = messages.map((m: any) => `${m.role === 'user' ? 'User' : 'Jazo'}: ${m.parts[0].text}`).join('\n\n');

    const systemInstruction = `You are an elite, world-class editor and copywriter working for Prologue Stories LLC.
Your job is to take a raw interview transcript and transform it into a polished, compelling marketing asset.

Here is the Assignment Brief:
${assignment}

You MUST output your response as a valid JSON object matching this exact structure:
{
  "story": "The fully drafted marketing asset matching the requested content type, written beautifully and ready to publish. Use markdown formatting for headers and paragraphs.",
  "pull_quotes": [
    "The 3-5 most compelling, raw, word-for-word quotes from the User in the transcript. These should be punchy and perfect for social media.",
    "Another great quote..."
  ]
}

DO NOT include any markdown code block wrappers (like \`\`\`json) in your final output, just raw JSON text.`;

    console.time('Story_Generation_Time');
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-pro',
      contents: [
        { role: 'user', parts: [{ text: `Here is the raw interview transcript:\n\n${transcript}\n\nPlease generate the final story and pull quotes based on the assignment brief.` }] }
      ],
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7
      }
    });
    console.timeEnd('Story_Generation_Time');

    if (!response.text) {
      throw new Error("No response returned from Gemini 1.5 Pro.");
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
