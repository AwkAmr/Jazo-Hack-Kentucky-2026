/**
 * Shared interview state for the JAZO app.
 *
 * The MCP server (`/api/mcp`) and the story generator (`/api/generate-story`)
 * both read through this module, so Claude's MCP tool calls resolve against the
 * same transcript the browser just submitted.
 *
 * In-memory only — it is scoped to the running server process and is pinned to
 * `globalThis` so hot reloads in `next dev` don't wipe an interview mid-demo.
 */

export interface TranscriptTurn {
  /** Stable 1-based index. MCP tools address turns by this number. */
  turn: number;
  speaker: 'user' | 'jazo';
  text: string;
}

export interface InterviewRecord {
  interviewId: string;
  assignment: string;
  transcript: TranscriptTurn[];
  interestingDetails: string[];
  unexploredTopics: string[];
  story: string | null;
  pullQuotes: string[];
  completed: boolean;
  updatedAt: string;
}

const store = globalThis as unknown as {
  __jazoInterviews?: Map<string, InterviewRecord>;
};

const interviews: Map<string, InterviewRecord> = (store.__jazoInterviews ??=
  new Map<string, InterviewRecord>());

/** Gemini-style chat history, the shape `page.tsx` already keeps. */
export interface ChatMessage {
  role: string;
  parts: { text: string }[];
}

export function toTranscript(messages: ChatMessage[]): TranscriptTurn[] {
  return messages.map((message, index) => ({
    turn: index + 1,
    speaker: message.role === 'user' ? 'user' : 'jazo',
    text: message.parts?.[0]?.text ?? '',
  }));
}

/**
 * Create or refresh the record for an interview. Transcript and assignment are
 * replaced; anything Jazo accumulated during the interview is preserved.
 */
export function upsertInterview(input: {
  interviewId: string;
  assignment: string;
  transcript: TranscriptTurn[];
  completed?: boolean;
}): InterviewRecord {
  const existing = interviews.get(input.interviewId);

  const record: InterviewRecord = {
    interviewId: input.interviewId,
    assignment: input.assignment,
    transcript: input.transcript,
    interestingDetails: existing?.interestingDetails ?? [],
    unexploredTopics: existing?.unexploredTopics ?? [],
    story: existing?.story ?? null,
    pullQuotes: existing?.pullQuotes ?? [],
    completed: input.completed ?? existing?.completed ?? false,
    updatedAt: new Date().toISOString(),
  };

  interviews.set(record.interviewId, record);
  return record;
}

export function getInterview(interviewId: string): InterviewRecord | undefined {
  return interviews.get(interviewId);
}

export function addInterestingDetail(
  interviewId: string,
  detail: string
): InterviewRecord | undefined {
  const interview = interviews.get(interviewId);
  if (!interview) return undefined;

  if (!interview.interestingDetails.includes(detail)) {
    interview.interestingDetails.push(detail);
  }
  interview.updatedAt = new Date().toISOString();
  return interview;
}

export function addUnexploredTopic(
  interviewId: string,
  topic: string
): InterviewRecord | undefined {
  const interview = interviews.get(interviewId);
  if (!interview) return undefined;

  if (!interview.unexploredTopics.includes(topic)) {
    interview.unexploredTopics.push(topic);
  }
  interview.updatedAt = new Date().toISOString();
  return interview;
}

export function saveStory(
  interviewId: string,
  story: string,
  pullQuotes: string[]
): InterviewRecord | undefined {
  const interview = interviews.get(interviewId);
  if (!interview) return undefined;

  interview.story = story;
  interview.pullQuotes = pullQuotes;
  interview.completed = true;
  interview.updatedAt = new Date().toISOString();
  return interview;
}
