import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';

import { connectJazoMcp, resolveMcpUrl, type JazoMcpSession } from '@/lib/jazoMcpClient';
import {
  saveStory,
  toTranscript,
  upsertInterview,
  type ChatMessage,
} from '@/lib/interviewStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Safety valve on the MCP tool loop. */
const MAX_TOOL_TURNS = 12;

const StoryOutput = z.object({
  story: z
    .string()
    .describe(
      'The fully drafted marketing asset matching the requested content type, written beautifully and ready to publish. Use markdown formatting for headers and paragraphs.'
    ),
  pull_quotes: z
    .array(z.string())
    .describe(
      `The most compelling, punchy, word-for-word quotes from the interviewee. NEVER include the phrase "Hello Jazo! Let's start the interview.". The quotes MUST be strictly relevant to the required content type in the brief. If there are no highly relevant quotes, return an empty array.`
    ),
});

type StoryResult = z.infer<typeof StoryOutput>;

function buildSystemPrompt(interviewId: string, assignment: string) {
  return `You are an elite, world-class editor and copywriter working for Prologue Stories LLC.
Your job is to turn a JAZO interview into a polished, compelling marketing asset.

Here is the Assignment Brief:
${assignment}

The interview is NOT in this prompt. It lives behind MCP tools, and the interview ID is "${interviewId}".

How to work:
1. Call get_interview_context first to see the brief, the size of the interview, and anything Jazo flagged as interesting.
2. Call get_transcript to read what was actually said. Read the whole thing before you write — for long interviews, page through it with fromTurn/toTurn.
3. Use search_transcript when you need to find where a specific moment, number, or name came up.
4. Every string you put in pull_quotes MUST be confirmed with get_verbatim_quote first. Quote the interviewee word-for-word; never paraphrase a pull quote, never invent one, and never attribute Jazo's words to the interviewee. Trim a quote to its punchiest span if you like, but do not alter the wording inside it. NEVER include the system prompt "Hello Jazo! Let\\'s start the interview.". Quotes MUST be strictly relevant to the "Content Needed". If there are no highly relevant quotes, leave the array empty.
5. Ground the story only in what the transcript supports. If the brief asks for something the interview never covered, write around the gap rather than fabricating it.

When you have the material, produce the final story and pull quotes.`;
}

/**
 * Claude + MCP path. Claude pulls the interview through the JAZO MCP server
 * rather than receiving a flattened transcript, which lets it verify pull
 * quotes against the exact turn text.
 */
async function generateWithClaude(
  interviewId: string,
  assignment: string,
  mcpUrl: URL
): Promise<StoryResult> {
  const anthropic = new Anthropic();

  let session: JazoMcpSession | undefined;

  try {
    session = await connectJazoMcp(mcpUrl);
    console.log(
      `[Story Generator] MCP connected at ${mcpUrl.href} — tools: ${session.tools
        .map((t) => t.name)
        .join(', ')}`
    );

    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: `Write the final story and pull quotes for interview "${interviewId}". Start by gathering the interview material through the JAZO tools.`,
      },
    ];

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const response = await anthropic.messages.parse({
        model: 'claude-opus-5',
        max_tokens: 16000,
        system: buildSystemPrompt(interviewId, assignment),
        thinking: { type: 'adaptive' },
        output_config: {
          effort: 'high',
          format: zodOutputFormat(StoryOutput),
        },
        tools: session.tools,
        messages,
      });

      if (response.stop_reason === 'refusal') {
        throw new Error(
          `Claude declined the request (${response.stop_details?.category ?? 'unknown'}).`
        );
      }

      if (response.stop_reason === 'max_tokens') {
        throw new Error('Claude hit max_tokens before finishing the story.');
      }

      messages.push({ role: 'assistant', content: response.content });

      const toolUses = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (toolUses.length === 0) {
        if (!response.parsed_output) {
          throw new Error('Claude finished without returning a story matching the schema.');
        }
        console.log(`[Story Generator] Claude finished after ${turn + 1} turn(s).`);
        return response.parsed_output;
      }

      // Parallel tool calls must all come back in a single user message.
      const toolResults = await Promise.all(
        toolUses.map(async (toolUse): Promise<Anthropic.ToolResultBlockParam> => {
          console.log(`[Story Generator] MCP tool: ${toolUse.name}`);
          try {
            const { text, isError } = await session!.callTool(toolUse.name, toolUse.input);
            return {
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: text,
              is_error: isError,
            };
          } catch (error) {
            return {
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: `Tool call failed: ${error instanceof Error ? error.message : String(error)}`,
              is_error: true,
            };
          }
        })
      );

      messages.push({ role: 'user', content: toolResults });
    }

    throw new Error(`Claude did not finish within ${MAX_TOOL_TURNS} tool turns.`);
  } finally {
    await session?.close().catch((error) => {
      console.warn('[Story Generator] MCP close failed:', error);
    });
  }
}

/** Original Gemini cascade, kept as the fallback path. */
async function generateWithGemini(
  messages: ChatMessage[],
  assignment: string
): Promise<StoryResult> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const vertexProject = process.env.GOOGLE_CLOUD_PROJECT;

  if (!geminiApiKey && !vertexProject) {
    throw new Error('API key or Vertex Project is missing');
  }

  const ai = vertexProject
    ? new GoogleGenAI({ vertexai: true, project: vertexProject, location: 'global' })
    : new GoogleGenAI({ apiKey: geminiApiKey });

  // Format transcript for the Editor
  const transcript = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Jazo'}: ${m.parts[0].text}`)
    .join('\n\n');

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
- NEVER include the hidden system prompt "Hello Jazo! Let's start the interview." in the pull quotes.
- Pull quotes MUST be strictly relevant to the "Content Needed" described in the assignment brief. If there are no quotes that strongly fit the required content type, leave the pull_quotes array completely empty.

You MUST output your response as a valid JSON object matching this exact structure:
{
  "story": "The fully drafted social media post matching the requested content type, written beautifully and ready to publish.",
  "pull_quotes": [
    "A compelling, raw, word-for-word quote from the User that strictly matches the required content type.",
    "Another great quote..."
  ]
}

DO NOT include any markdown code block wrappers (like \`\`\`json) in your final output, just raw JSON text.`;

  const fallbackModels = ['gemini-3.1-pro-preview', 'gemini-3-pro-preview', 'gemini-2.5-pro'];
  let response = null;
  let lastError = null;

  for (const model of fallbackModels) {
    try {
      console.log(`[Story Generator] Attempting with model: ${model}`);
      response = await ai.models.generateContent({
        model: model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Here is the raw interview transcript:\n\n${transcript}\n\nPlease generate the final story and pull quotes based on the assignment brief.`,
              },
            ],
          },
        ],
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.7,
        },
      });

      if (response && response.text) {
        console.log(`[Story Generator] Success with ${model}`);
        break; // Stop falling back if successful
      }
    } catch (err) {
      console.warn(
        `[Story Generator] Model ${model} failed:`,
        err instanceof Error ? err.message : err
      );
      lastError = err;
    }
  }

  if (!response || !response.text) {
    throw lastError || new Error('All fallback models failed to generate the story.');
  }

  let jsonString = response.text;
  const jsonMatch = response.text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonString = jsonMatch[0];
  }

  return StoryOutput.parse(JSON.parse(jsonString));
}

export async function POST(request: Request) {
  try {
    const { messages, assignment, interviewId } = await request.json();

    if (!messages || !assignment) {
      return NextResponse.json(
        { error: 'Messages and assignment are required' },
        { status: 400 }
      );
    }

    // Publish the interview so the MCP tools have something to serve.
    const id: string = interviewId || crypto.randomUUID();
    upsertInterview({
      interviewId: id,
      assignment,
      transcript: toTranscript(messages as ChatMessage[]),
      completed: true,
    });

    console.time('Story_Generation_Time');

    let result: StoryResult | null = null;
    let generatedBy: 'claude-mcp' | 'gemini' | null = null;

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        result = await generateWithClaude(id, assignment, resolveMcpUrl(request.url));
        generatedBy = 'claude-mcp';
      } catch (error) {
        console.warn(
          '[Story Generator] Claude + MCP path failed, falling back to Gemini:',
          error instanceof Error ? error.message : error
        );
      }
    } else {
      console.warn('[Story Generator] ANTHROPIC_API_KEY not set — using Gemini.');
    }

    if (!result) {
      result = await generateWithGemini(messages as ChatMessage[], assignment);
      generatedBy = 'gemini';
    }

    console.timeEnd('Story_Generation_Time');

    saveStory(id, result.story, result.pull_quotes);

    return NextResponse.json({ ...result, interviewId: id, generated_by: generatedBy });
  } catch (error) {
    console.error('Story Generation Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
