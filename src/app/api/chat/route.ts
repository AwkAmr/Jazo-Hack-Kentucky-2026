import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

export async function POST(request: Request) {
  try {
    const { messages, voice = 'cassidy' } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

    if (!geminiApiKey || !elevenLabsApiKey) {
      return NextResponse.json({ error: 'API keys are missing' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    const systemInstruction = `You are Jazo, a warm, friendly, and engaging AI interviewer. Your personality is naturally cheerful, conversational, and deeply human.
You are highly curious and empathetic. If the user mentions a struggle or a fascinating detail, pivot your plan and thoughtfully explore that!

YOUR ASSIGNMENT: Interview the user (Amr) about his experience as a student intern at the University of Louisville.

CRITICAL REQUIREMENT:
You must keep the conversation flowing naturally.
1. "internal_thought" should briefly explain your reasoning for the next question.
2. "elevenlabs_spoken_text" should be a natural conversational length (around 2 to 5 sentences). It should feel like a real back-and-forth interview, never a long monologue.

You MUST output your response as a valid JSON object matching this exact structure:
{
  "internal_thought": "your thought here",
  "jazo_facial_expression": "default",
  "elevenlabs_spoken_text": "your spoken text here",
  "interview_progress": "intro"
}

Schema requirements for jazo_facial_expression: Must be exactly one of: "default", "happy", "angry", "tired", "confused", "empathetic".
`;

    // Flatten the chat history into a single transcript to prevent schema hallucination loops
    const transcript = messages.map((m: any) => `${m.role === 'user' ? 'Amr' : 'Jazo'}: ${m.parts[0].text}`).join('\n\n');
    
    const finalPrompt = `Here is the interview transcript so far:\n\n${transcript}\n\nGenerate your next JSON response to continue the interview!`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.8,
        responseMimeType: "application/json"
      }
    });

    const outputText = response.text;
    if (!outputText) {
      throw new Error("No response returned from Gemini.");
    }
    
    // The SDK with JSON schema should guarantee valid JSON
    const parsedData = JSON.parse(outputText);

    // SPEED HACK: Immediately call ElevenLabs from the server to save a client round-trip
    let voiceId = process.env.ELEVENLABS_VOICE_ID_CASSIDY || 'EXAVITQu4vr4xnSDxMaL';
    if (voice === 'eve') voiceId = process.env.ELEVENLABS_VOICE_ID_EVE || '21m00Tcm4TlvDq8ikWAM';

    const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': elevenLabsApiKey,
      },
      body: JSON.stringify({
        text: parsedData.elevenlabs_spoken_text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!ttsResponse.ok) {
      console.error('TTS Error inside Chat route');
      return NextResponse.json({ ...parsedData, audioBase64: null });
    }

    const arrayBuffer = await ttsResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const audioBase64 = buffer.toString('base64');

    return NextResponse.json({ ...parsedData, audioBase64 });

  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
