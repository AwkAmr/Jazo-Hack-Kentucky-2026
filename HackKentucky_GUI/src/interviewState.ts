export interface InterviewState {
  interviewId: string;
  interviewee: string;
  topic: string;
  goal: string;

  answers: {
    question: string;
    answer: string;
  }[];

  interestingDetails: string[];

  unexploredTopics: string[];

  completed: boolean;
}

const interviews = new Map<string, InterviewState>();

export function createInterview(
  interviewId: string,
  interviewee: string,
  topic: string,
  goal: string
): InterviewState {
  const interview: InterviewState = {
    interviewId,
    interviewee,
    topic,
    goal,

    answers: [],

    interestingDetails: [],

    unexploredTopics: [],

    completed: false
  };

  interviews.set(interviewId, interview);

  return interview;
}

export function getInterview(
  interviewId: string
): InterviewState | undefined {
  return interviews.get(interviewId);
}

export function addAnswer(
  interviewId: string,
  question: string,
  answer: string
): InterviewState | undefined {
  const interview = interviews.get(interviewId);

  if (!interview) {
    return undefined;
  }

  interview.answers.push({
    question,
    answer
  });

  return interview;
}

export function addInterestingDetail(
  interviewId: string,
  detail: string
): InterviewState | undefined {
  const interview = interviews.get(interviewId);

  if (!interview) {
    return undefined;
  }

  if (!interview.interestingDetails.includes(detail)) {
    interview.interestingDetails.push(detail);
  }

  return interview;
}

export function addUnexploredTopic(
  interviewId: string,
  topic: string
): InterviewState | undefined {
  const interview = interviews.get(interviewId);

  if (!interview) {
    return undefined;
  }

  if (!interview.unexploredTopics.includes(topic)) {
    interview.unexploredTopics.push(topic);
  }

  return interview;
}

export function completeInterview(
  interviewId: string
): InterviewState | undefined {
  const interview = interviews.get(interviewId);

  if (!interview) {
    return undefined;
  }

  interview.completed = true;

  return interview;
}