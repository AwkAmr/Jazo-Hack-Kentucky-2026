import fs from 'fs';
import path from 'path';

/**
 * Shared interview state for the JAZO app.
 *
 * The MCP server (`/api/mcp`) and the story generator (`/api/generate-story`)
 * both read through this module. To support external MCP clients (like Claude Desktop)
 * running in completely separate processes, interviews are persisted to a local
 * JSON file (`.interviews.json`) rather than just stored in-memory.
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

const STORE_PATH = path.join(process.cwd(), '.interviews.json');

function loadInterviews(): Map<string, InterviewRecord> {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const data = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(data);
      return new Map(Object.entries(parsed));
    }
  } catch (error) {
    console.error('[InterviewStore] Failed to load interviews from disk:', error);
  }
  return new Map<string, InterviewRecord>();
}

function saveInterviews(interviews: Map<string, InterviewRecord>) {
  try {
    const obj = Object.fromEntries(interviews);
    fs.writeFileSync(STORE_PATH, JSON.stringify(obj, null, 2), 'utf8');
  } catch (error) {
    console.error('[InterviewStore] Failed to save interviews to disk:', error);
  }
}

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
  const interviews = loadInterviews();
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
  saveInterviews(interviews);
  return record;
}

export function getInterview(interviewId: string): InterviewRecord | undefined {
  const interviews = loadInterviews();
  return interviews.get(interviewId);
}

export function addInterestingDetail(
  interviewId: string,
  detail: string
): InterviewRecord | undefined {
  const interviews = loadInterviews();
  const interview = interviews.get(interviewId);
  if (!interview) return undefined;

  if (!interview.interestingDetails.includes(detail)) {
    interview.interestingDetails.push(detail);
  }
  interview.updatedAt = new Date().toISOString();
  
  interviews.set(interviewId, interview);
  saveInterviews(interviews);
  return interview;
}

export function addUnexploredTopic(
  interviewId: string,
  topic: string
): InterviewRecord | undefined {
  const interviews = loadInterviews();
  const interview = interviews.get(interviewId);
  if (!interview) return undefined;

  if (!interview.unexploredTopics.includes(topic)) {
    interview.unexploredTopics.push(topic);
  }
  interview.updatedAt = new Date().toISOString();
  
  interviews.set(interviewId, interview);
  saveInterviews(interviews);
  return interview;
}

export function saveStory(
  interviewId: string,
  story: string,
  pullQuotes: string[]
): InterviewRecord | undefined {
  const interviews = loadInterviews();
  const interview = interviews.get(interviewId);
  if (!interview) return undefined;

  interview.story = story;
  interview.pullQuotes = pullQuotes;
  interview.completed = true;
  interview.updatedAt = new Date().toISOString();
  
  interviews.set(interviewId, interview);
  saveInterviews(interviews);
  return interview;
}
