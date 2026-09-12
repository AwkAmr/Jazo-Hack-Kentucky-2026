import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages, assignment } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

    if (!geminiApiKey || !elevenLabsApiKey) {
      return NextResponse.json({ error: 'API keys are missing' }, { status: 500 });
    }

    if (!messages) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    const systemInstruction = `You are Jazo, a professional, curious, and empathetic AI interviewer conducting a live voice interview. 

YOUR ASSIGNMENT: ${assignment || 'Interview the user and gather compelling material.'}
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
You must keep the conversation flowing naturally.

Emotional Range & Audio Tags (CRITICAL):
You MUST dynamically change your emotion based on the user's input. Do NOT always be happy or excited. If the user mentions a struggle, you should sound empathetic or calm.
For the "jazo_facial_expression" field, pick exactly ONE of: "default", "happy", "angry", "tired", "confused", "empathetic".
- Use "confused" if you are surprised or confused.
- Use "empathetic" for soft, gentle, understanding, or sad moments.
- Use "tired" if you are genuinely exhausted or bored.

For the "elevenlabs_spoken_text" field, you have access to ElevenLabs V3 audio tags to steer your vocal performance. These are a completely separate system from your facial expression. Use them whenever they feel natural to the conversation!
Available Audio Tags: [excited], [sad], [angry], [nervous], [frustrated], [calm], [tired], [laughs], [sigh], [gasp], [whispers], [playfully].
Examples:
- "[laughs] That sounds absolutely amazing!"
- "[calm] I can imagine how stressful that was."
- "[sigh] Yeah, long nights will do that to you."
- "[gasp] Wait, how did you fix the server issue?"

You MUST output your response as a valid JSON object matching this exact structure:
{
  "internal_thought": "your thought here",
  "jazo_facial_expression": "default",
  "elevenlabs_spoken_text": "[tag] your spoken text here",
  "interview_progress": "intro"
}
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
        model_id: 'eleven_v3_conversational',
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
