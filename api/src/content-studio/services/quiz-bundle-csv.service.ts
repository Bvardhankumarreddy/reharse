import { Injectable } from '@nestjs/common';
import { QuizBundle } from '../entities/quiz-bundle.entity';
import { QuizBundleQuestion } from '../entities/quiz-bundle-question.entity';

const HEADER = [
  'question_type', 'question_text',
  'option_a', 'option_b', 'option_c', 'option_d',
  'correct_answer', 'correct_answers',
  'correct_number', 'numeric_tolerance', 'numeric_unit',
  'points', 'difficulty', 'category', 'quiz_week', 'is_mandatory',
].join(',');

/** RFC 4180-ish: quote everything that contains a comma, quote, or newline.  */
function csvField(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s === '') return '';
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Renders a quiz bundle to the EXACT admin Quiz Module importer CSV format
 * (see api/src/quiz/quiz.controller.ts → GET /questions/template).
 *
 * The tie-breaker is appended as the last row — numeric, is_mandatory=true.
 */
@Injectable()
export class QuizBundleCsvService {
  render(
    bundle: QuizBundle,
    questions: QuizBundleQuestion[],
    quizWeek: number,
  ): string {
    const lines: string[] = [HEADER];

    for (const q of questions) {
      lines.push(this.renderQuestion(q, quizWeek));
    }
    lines.push(this.renderTieBreaker(bundle, quizWeek));

    // Trailing newline keeps Papa.parse / Excel happy on import.
    return `${lines.join('\n')}\n`;
  }

  private renderQuestion(q: QuizBundleQuestion, quizWeek: number): string {
    return [
      csvField(q.questionType),
      csvField(q.questionText),
      csvField(q.optionA),
      csvField(q.optionB),
      csvField(q.optionC),
      csvField(q.optionD),
      csvField(q.correctAnswer),
      csvField(q.correctAnswers),
      csvField(q.correctNumber),
      csvField(q.numericTolerance),
      csvField(q.numericUnit),
      csvField(q.points),
      csvField(q.difficulty),
      csvField(q.category),
      csvField(quizWeek),
      csvField(q.isMandatory),
    ].join(',');
  }

  private renderTieBreaker(b: QuizBundle, quizWeek: number): string {
    const prefix = b.tieBreakerQuestion.toLowerCase().startsWith('tie')
      ? b.tieBreakerQuestion
      : `TIE-BREAKER: ${b.tieBreakerQuestion}`;
    return [
      csvField('numeric'),
      csvField(prefix),
      '', '', '', '',                   // options blank
      '', '',                            // correct_answer / correct_answers blank
      csvField(b.tieBreakerAnswer),
      csvField(b.tieBreakerTolerance),
      csvField(b.tieBreakerUnit),
      csvField(3),                       // tie-breaker points (matches hard)
      csvField('hard'),
      csvField('Tie-breaker'),
      csvField(quizWeek),
      csvField(true),
    ].join(',');
  }
}
