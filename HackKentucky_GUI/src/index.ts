import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

import {
  getInterview,
  addAnswer,
  addInterestingDetail,
  addUnexploredTopic,
  completeInterview
} from "./interviewState.js";


function createServer(): McpServer {

  const server = new McpServer({
    name: "jazo",
    version: "0.1.0"
  });


  // ---------------------------------------------------------
  // TOOL 1: Get interview context
  // ---------------------------------------------------------

  server.registerTool(
    "get_interview_context",

    {
      description:
        "Retrieve the current JAZO interview context, including the interviewee, topic, goal, previous answers, interesting details, and unexplored topics.",

      inputSchema: z.object({
        interviewId: z
          .string()
          .describe("The unique ID of the interview")
      })
    },

    async ({ interviewId }) => {

      const interview = getInterview(interviewId);

      if (!interview) {

        return {
          content: [
            {
              type: "text",
              text: `Interview ${interviewId} was not found.`
            }
          ],
          isError: true
        };

      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(interview, null, 2)
          }
        ]
      };
    }
  );


  // ---------------------------------------------------------
  // TOOL 2: Record an answer
  // ---------------------------------------------------------

  server.registerTool(
    "record_answer",

    {
      description:
        "Record the interviewee's answer to the current interview question.",

      inputSchema: z.object({

        interviewId: z
          .string()
          .describe("The unique interview ID"),

        question: z
          .string()
          .describe("The question that was asked"),

        answer: z
          .string()
          .describe("The interviewee's answer")
      })
    },

    async ({ interviewId, question, answer }) => {

      const interview = addAnswer(
        interviewId,
        question,
        answer
      );

      if (!interview) {

        return {
          content: [
            {
              type: "text",
              text: `Interview ${interviewId} was not found.`
            }
          ],
          isError: true
        };

      }

      return {
        content: [
          {
            type: "text",
            text: "Answer recorded successfully."
          }
        ]
      };
    }
  );


  // ---------------------------------------------------------
  // TOOL 3: Save an interesting detail
  // ---------------------------------------------------------

  server.registerTool(
    "save_interesting_detail",

    {
      description:
        "Save a specific, surprising, emotional, unusual, or otherwise valuable detail discovered during the interview.",

      inputSchema: z.object({

        interviewId: z
          .string()
          .describe("The unique interview ID"),

        detail: z
          .string()
          .describe("The interesting detail discovered")
      })
    },

    async ({ interviewId, detail }) => {

      const interview = addInterestingDetail(
        interviewId,
        detail
      );

      if (!interview) {

        return {
          content: [
            {
              type: "text",
              text: `Interview ${interviewId} was not found.`
            }
          ],
          isError: true
        };

      }

      return {
        content: [
          {
            type: "text",
            text: `Interesting detail saved: "${detail}"`
          }
        ]
      };
    }
  );


  // ---------------------------------------------------------
  // TOOL 4: Add unexplored topic
  // ---------------------------------------------------------

  server.registerTool(
    "add_unexplored_topic",

    {
      description:
        "Record a potentially valuable topic or thread that JAZO should investigate further.",

      inputSchema: z.object({

        interviewId: z
          .string()
          .describe("The unique interview ID"),

        topic: z
          .string()
          .describe("The topic or thread that still needs exploration")
      })
    },

    async ({ interviewId, topic }) => {

      const interview = addUnexploredTopic(
        interviewId,
        topic
      );

      if (!interview) {

        return {
          content: [
            {
              type: "text",
              text: `Interview ${interviewId} was not found.`
            }
          ],
          isError: true
        };

      }

      return {
        content: [
          {
            type: "text",
            text: `Unexplored topic added: "${topic}"`
          }
        ]
      };
    }
  );


  // ---------------------------------------------------------
  // TOOL 5: Finish interview
  // ---------------------------------------------------------

  server.registerTool(
    "finish_interview",

    {
      description:
        "Mark the interview as complete when enough useful information has been collected.",

      inputSchema: z.object({

        interviewId: z
          .string()
          .describe("The unique interview ID")
      })
    },

    async ({ interviewId }) => {

      const interview = completeInterview(
        interviewId
      );

      if (!interview) {

        return {
          content: [
            {
              type: "text",
              text: `Interview ${interviewId} was not found.`
            }
          ],
          isError: true
        };

      }

      return {
        content: [
          {
            type: "text",
            text: "Interview marked as complete."
          }
        ]
      };
    }
  );


  return server;
}


// ---------------------------------------------------------
// Start MCP server
// ---------------------------------------------------------

void serveStdio(createServer);

console.error("JAZO MCP server running.");