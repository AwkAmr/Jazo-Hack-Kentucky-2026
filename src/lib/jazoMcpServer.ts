/**
 * The JAZO MCP server.
 *
 * Exposes the interview record as MCP tools so the story writer has to *fetch*
 * the material instead of being handed a pre-flattened transcript string. The
 * payoff is `get_verbatim_quote`: pull quotes get checked against the exact
 * turn text rather than trusted from the model's memory of it.
 *
 * Mounted over streamable HTTP at `/api/mcp`, so any MCP client can attach to
 * it, not just our own story route.
 */

import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { getInterview, type TranscriptTurn } from './interviewStore';

function notFound(interviewId: string) {
  return {
    content: [
      {
        type: 'text' as const,
        text: `Interview ${interviewId} was not found. It may have expired — ask the caller to resubmit the transcript.`,
      },
    ],
    isError: true,
  };
}

function json(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  };
}

function formatTurns(turns: TranscriptTurn[]) {
  return turns.map((turn) => ({
    turn: turn.turn,
    speaker: turn.speaker,
    text: turn.text,
  }));
}

export function createJazoMcpServer(): McpServer {
  const server = new McpServer({ name: 'jazo', version: '0.2.0' });

  // ---------------------------------------------------------
  // TOOL 1: Interview context (everything except the transcript)
  // ---------------------------------------------------------

  server.registerTool(
    'get_interview_context',
    {
      description:
        'Retrieve the JAZO interview context: the assignment brief, how long the interview ran, any interesting details and unexplored topics Jazo flagged, and whether the interview is complete. Call this first — it is cheap and tells you how much transcript there is to read.',
      inputSchema: z.object({
        interviewId: z.string().describe('The unique ID of the interview'),
      }),
    },
    async ({ interviewId }) => {
      const interview = getInterview(interviewId);
      if (!interview) return notFound(interviewId);

      return json({
        interviewId: interview.interviewId,
        assignment: interview.assignment,
        totalTurns: interview.transcript.length,
        userTurns: interview.transcript.filter((t) => t.speaker === 'user').length,
        interestingDetails: interview.interestingDetails,
        unexploredTopics: interview.unexploredTopics,
        completed: interview.completed,
        updatedAt: interview.updatedAt,
      });
    }
  );

  // ---------------------------------------------------------
  // TOOL 2: Read the transcript
  // ---------------------------------------------------------

  server.registerTool(
    'get_transcript',
    {
      description:
        'Read the interview transcript as numbered turns. Returns every turn by default; narrow it with fromTurn/toTurn, or pass speaker="user" to read only what the interviewee actually said.',
      inputSchema: z.object({
        interviewId: z.string().describe('The unique interview ID'),
        speaker: z
          .enum(['user', 'jazo', 'both'])
          .default('both')
          .describe('Whose turns to return. "user" is the interviewee, "jazo" is the interviewer.'),
        fromTurn: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('First turn number to include (inclusive, 1-based)'),
        toTurn: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('Last turn number to include (inclusive)'),
      }),
    },
    async ({ interviewId, speaker, fromTurn, toTurn }) => {
      const interview = getInterview(interviewId);
      if (!interview) return notFound(interviewId);

      const turns = interview.transcript.filter((turn) => {
        if (speaker !== 'both' && turn.speaker !== speaker) return false;
        if (fromTurn !== undefined && turn.turn < fromTurn) return false;
        if (toTurn !== undefined && turn.turn > toTurn) return false;
        return true;
      });

      return json({
        interviewId,
        totalTurns: interview.transcript.length,
        returnedTurns: turns.length,
        turns: formatTurns(turns),
      });
    }
  );

  // ---------------------------------------------------------
  // TOOL 3: Search the transcript
  // ---------------------------------------------------------

  server.registerTool(
    'search_transcript',
    {
      description:
        'Find transcript turns containing a phrase (case-insensitive substring match). Use this to locate where the interviewee talked about a specific moment, number, or name before quoting it.',
      inputSchema: z.object({
        interviewId: z.string().describe('The unique interview ID'),
        query: z.string().min(1).describe('The phrase or keyword to look for'),
        speaker: z
          .enum(['user', 'jazo', 'both'])
          .default('user')
          .describe('Restrict the search to one speaker. Defaults to the interviewee.'),
      }),
    },
    async ({ interviewId, query, speaker }) => {
      const interview = getInterview(interviewId);
      if (!interview) return notFound(interviewId);

      const needle = query.toLowerCase();
      const matches = interview.transcript.filter(
        (turn) =>
          (speaker === 'both' || turn.speaker === speaker) &&
          turn.text.toLowerCase().includes(needle)
      );

      return json({
        interviewId,
        query,
        matchCount: matches.length,
        matches: formatTurns(matches),
      });
    }
  );

  // ---------------------------------------------------------
  // TOOL 4: Verify a quote word-for-word
  // ---------------------------------------------------------

  server.registerTool(
    'get_verbatim_quote',
    {
      description:
        'Return the exact, unmodified text of a single transcript turn. Use this to confirm a pull quote is truly word-for-word before you publish it — never quote from memory.',
      inputSchema: z.object({
        interviewId: z.string().describe('The unique interview ID'),
        turn: z
          .number()
          .int()
          .min(1)
          .describe('The turn number to fetch, as reported by get_transcript or search_transcript'),
      }),
    },
    async ({ interviewId, turn }) => {
      const interview = getInterview(interviewId);
      if (!interview) return notFound(interviewId);

      const match = interview.transcript.find((t) => t.turn === turn);

      if (!match) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Turn ${turn} does not exist. This interview has turns 1-${interview.transcript.length}.`,
            },
          ],
          isError: true,
        };
      }

      return json({
        turn: match.turn,
        speaker: match.speaker,
        verbatimText: match.text,
      });
    }
  );

  return server;
}
