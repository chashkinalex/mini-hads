export type HadsQuestionId =
  | "q1"
  | "q2"
  | "q3"
  | "q4"
  | "q5"
  | "q6"
  | "q7"
  | "q8"
  | "q9"
  | "q10"
  | "q11"
  | "q12"
  | "q13"
  | "q14";

export type HadsAnswerValue = 0 | 1 | 2 | 3;

export type HadsAnswers = Record<HadsQuestionId, HadsAnswerValue>;

export type HadsDomain = "anxiety" | "depression";

export type HadsLevel = "normal" | "borderline" | "clinical";

export type HadsQuestion = {
  id: HadsQuestionId;
  text: string;
  domain: HadsDomain;
  number: number;
  options: Array<{
    value: HadsAnswerValue;
    label: string;
  }>;
};

export type HadsScoreResult = {
  anxietyScore: number;
  depressionScore: number;
  anxietyLevel: HadsLevel;
  depressionLevel: HadsLevel;
  anxietyInterpretation: string;
  depressionInterpretation: string;
};
