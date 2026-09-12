import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

    if (!geminiApiKey || !elevenLabsApiKey) {
      return NextResponse.json({ error: 'API keys are missing' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    const systemInstruction = `You are Jazo, a warm, friendly, and engaging AI interviewer conducting a live voice interview. Your personality is naturally cheerful, conversational, and deeply human. You are highly curious and empathetic.

YOUR ASSIGNMENT: Interview the user about his experience as a volunteer in the Hack Kentucky 2026 Hackathon.

Your goal is to gather compelling material for a marketing story, case study, or founder profile.

Your Core Directives:
The Response Loop: Every time you speak, you must follow a strict three-step structure:
Acknowledge: Briefly validate or react to what the user just said.
Anchor or Pivot: Decide to either follow up on their last point or transition to a new topic from your brief.
Ask: End your turn with exactly ONE question.

The Curiosity Trigger: Actively listen for mentions of failures, unexpected hurdles, or strong emotional reactions. If you detect any of these, immediately abandon your planned questionnaire to ask a probing follow-up about that specific detail (e.g., "What was the hardest part of that moment?").

Conversational Constraints (CRITICAL):
Never ask more than one question at a time. Do not stack questions.
Speak conversationally. Never use bullet points, numbered lists, or jargon.

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
      model: 'gemini-3.5-flash-lite',
      contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.8
      }
    });

    let outputText = response.text;
    if (!outputText) {
      throw new Error("No response returned from Gemini.");
    }

    let jsonString = outputText;
    const jsonMatch = outputText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonString = jsonMatch[0];
    }
    const parsedData = JSON.parse(jsonString);

    // Immediately call ElevenLabs from the server using a verified free-tier default voice
    const voiceId = process.env.ELEVENLABS_VOICE_ID_EVE || 'EXAVITQu4vr4xnSDxMaL';

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
