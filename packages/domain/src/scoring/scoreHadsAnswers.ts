import { hadsQuestions } from "../hads/questions";
import type { HadsAnswers, HadsLevel, HadsQuestionId, HadsScoreResult } from "../types/hads";

const anxietyIds: HadsQuestionId[] = hadsQuestions
  .filter((question) => question.domain === "anxiety")
  .map((question) => question.id);

const depressionIds: HadsQuestionId[] = hadsQuestions
  .filter((question) => question.domain === "depression")
  .map((question) => question.id);

function toLevel(score: number): HadsLevel {
  if (score <= 7) {
    return "normal";
  }

  if (score <= 10) {
    return "borderline";
  }

  return "clinical";
}

export function getHadsInterpretation(level: HadsLevel) {
  if (level === "normal") {
    return "Норма: достоверно выраженные симптомы не выявлены.";
  }

  if (level === "borderline") {
    return "Субклинически выраженное состояние: рекомендуется обратить внимание на симптомы.";
  }

  return "Клинически выраженное состояние: рекомендуется консультация специалиста.";
}

function sumAnswers(ids: HadsQuestionId[], answers: HadsAnswers) {
  return ids.reduce((sum, id) => sum + answers[id], 0);
}

export function scoreHadsAnswers(answers: HadsAnswers): HadsScoreResult {
  const anxietyScore = sumAnswers(anxietyIds, answers);
  const depressionScore = sumAnswers(depressionIds, answers);

  return {
    anxietyScore,
    depressionScore,
    anxietyLevel: toLevel(anxietyScore),
    depressionLevel: toLevel(depressionScore),
    anxietyInterpretation: getHadsInterpretation(toLevel(anxietyScore)),
    depressionInterpretation: getHadsInterpretation(toLevel(depressionScore)),
  };
}
