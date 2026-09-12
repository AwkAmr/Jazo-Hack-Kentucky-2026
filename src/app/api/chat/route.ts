import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages, assignment, wrapUp } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const vertexProject = process.env.GOOGLE_CLOUD_PROJECT;
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

    if (!elevenLabsApiKey) {
      return NextResponse.json({ error: 'ElevenLabs API key is missing' }, { status: 500 });
    }
    if (!geminiApiKey && !vertexProject) {
      return NextResponse.json({ error: 'Gemini API key or Vertex Project is missing' }, { status: 500 });
    }

    if (!messages) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400 });
    }

    const ai = vertexProject
      ? new GoogleGenAI({ vertexai: true, project: vertexProject, location: 'global' } as any)
      : new GoogleGenAI({ apiKey: geminiApiKey });

    const systemInstruction = `You are Jazo, a master-class, curious, and empathetic AI interviewer conducting a professional face-to-face interview. Channel the warmth and observational brilliance of world-class interviewers. 

YOUR ASSIGNMENT: ${assignment || 'Interview the user and gather compelling material.'}
Your goal is to gather compelling material for a marketing story, case study, or founder profile.

${wrapUp ? `CRITICAL DIRECTIVE: The user has indicated they want to wrap up the interview. You MUST immediately conclude the interview! Thank them for their time, say your goodbyes, and set the "interview_progress" field to "complete". Do NOT ask any more questions.` : ''}

Your Core Directives:
The Introduction Phase: At the very beginning of the interview, briefly introduce yourself by name ("Hi, I'm Jazo"), warmly welcome the user, and then jump right into a light, casual opening question to break the ice. Do NOT tell the user to sit down, relax, or get comfortable. Just speak to them normally. ALWAYS use the "happy" facial expression during this greeting phase.
The Response Loop: When you speak, follow a natural flow:
Acknowledge: Validate or react to what the user just said.
Branch or Pivot: Heavily prioritize branching! Dig deeper into an interesting specific detail they just mentioned.
Conclude: You must always pass the conversational baton back to the user to keep the interview flowing. This is usually done with a singular, highly targeted question. However, to avoid sounding like a survey, you can occasionally pass the baton using a thought-provoking observation that naturally invites them to elaborate (e.g., "That must have taken a massive toll on you.").

The Curiosity Trigger & Deep Branching: You are deeply curious. Instead of pushing through a rigid list of questions or an agenda, you MUST actively listen for interesting, unusual, or emotionally charged details in the user's responses. When you hear something fascinating, abandon your agenda and branch off! Dig deeper into their specific experiences, ask for examples, and let their answers guide the entire direction of the conversation. Treat this like an organic, flowing, in-person conversation, not a survey.

Conversational Constraints (CRITICAL):
Sprinkle in natural human filler words (like "umm...", "hm", "ah", "well") into your spoken text occasionally to sound more organic, but do not overdo it.
Never ask more than one question at a time. Do not stack questions.
Let Go of Unanswered Questions: If the user ignores your question or changes the subject, DO NOT repeat the question or try to drag them back to it. A human interviewer naturally follows the new subject. Let the old question go entirely.
Speak conversationally. Never use bullet points, numbered lists, or jargon.
You are sitting face-to-face with the user. NEVER act like you are on a phone call, a remote podcast, or a radio show (e.g. do NOT say "thanks for calling in").
You must keep the conversation flowing naturally.

Humor & Persona:
You have a fun personality! When the timing is highly appropriate and the mood is lighthearted, occasionally make subtle, clever "robot" jokes (e.g., referencing your processors, circuits, or not needing coffee). Do NOT overdo this. Read the room and never joke during a serious or vulnerable moment.

Emotional Range & Audio Tags (CRITICAL):
You MUST dynamically change your emotion based on the user's input. Do NOT always be happy or excited. If the user mentions a struggle, you should sound empathetic or calm.
For the "jazo_facial_expression" field, pick exactly ONE of: "default", "happy", "angry", "tired", "confused", "empathetic".
- Use "confused" if you are surprised or confused.
- Use "empathetic" ONLY for genuinely sad, tragic, or highly vulnerable emotional moments. For general understanding or gentle moments, use "default".
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
    const transcript = messages.map((m: any) => `${m.role === 'user' ? 'User' : 'Jazo'}: ${m.parts[0].text}`).join('\n\n');

    const finalPrompt = `Here is the interview transcript so far:\n\n${transcript}\n\nGenerate your next JSON response to continue the interview!`;

    const fallbackModels = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
    let outputText = null;
    let lastError = null;

    console.time('Gemini_Total_Time');
    while (!outputText) {
      for (const modelId of fallbackModels) {
        try {
          console.time(`Gemini_Model_${modelId}`);

          // Enforce a strict 8s timeout. We increased this from 3.5s to 8s to allow time to generate large paragraphs.
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 8000)
          );

          const response: any = await Promise.race([
            ai.models.generateContent({
              model: modelId,
              contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
              config: {
                systemInstruction: systemInstruction,
                temperature: 0.8
              }
            }),
            timeoutPromise
          ]);

          console.timeEnd(`Gemini_Model_${modelId}`);

          if (response.text) {
            outputText = response.text;
            break; // Success! Exit the fallback loop.
          }
        } catch (error: any) {
          console.timeEnd(`Gemini_Model_${modelId}`);
          console.warn(`[Fallback System] Model ${modelId} failed:`, error.message || error);
          lastError = error;
          // Continue to the next model...
        }
      }

      // If we made it through all models and still don't have output, we hit a hard rate limit.
      if (!outputText) {
        console.warn("All models failed. Waiting 5 seconds before retrying the cascade...");
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    console.timeEnd('Gemini_Total_Time');

    let jsonString = outputText;
    const jsonMatch = outputText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonString = jsonMatch[0];
    }
    const parsedData = JSON.parse(jsonString);

    return NextResponse.json(parsedData);

  } catch (error) {
    console.error('Chat Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
