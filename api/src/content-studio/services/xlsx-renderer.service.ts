import { Injectable } from '@nestjs/common';
// exceljs is CommonJS; the default import resolves to undefined without
// esModuleInterop. Namespace import works in both modes.
import * as ExcelJS from 'exceljs';
import { QuestionPool } from '../entities/question-pool.entity';

export type XlsxVariant = 'public' | 'private';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

/** ExcelJS only accepts ARGB (8 hex chars). Default to dark navy. */
function argb(hex: string | null | undefined, fallback = 'FF0B1230'): string {
  if (!hex) return fallback;
  const v = hex.replace(/^#/, '').toUpperCase();
  if (v.length === 6) return `FF${v}`;
  if (v.length === 8) return v;
  return fallback;
}

/** Renders the drawn 9-question quiz to .xlsx (public or private). */
@Injectable()
export class XlsxRendererService {
  async render(
    questions: QuestionPool[],
    opts: { variant: XlsxVariant; brandName: string; primary: string | null; weekOf: string },
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = opts.brandName;
    wb.created = new Date();
    const ws = wb.addWorksheet(`Quiz ${opts.weekOf}`);

    const cols: Partial<ExcelJS.Column>[] = [
      { header: '#',          key: 'n',    width: 5 },
      { header: 'Question',   key: 'q',    width: 70 },
      { header: 'A',          key: 'a',    width: 28 },
      { header: 'B',          key: 'b',    width: 28 },
      { header: 'C',          key: 'c',    width: 28 },
      { header: 'D',          key: 'd',    width: 28 },
      { header: 'Difficulty', key: 'diff', width: 12 },
    ];
    if (opts.variant === 'private') {
      cols.push(
        { header: 'Correct',     key: 'correct', width: 14 },
        { header: 'Explanation', key: 'why',     width: 70 },
      );
    }
    ws.columns = cols;

    questions.forEach((q, i) => {
      const opt = q.options ?? [];
      const row: Record<string, string | number> = {
        n: i + 1,
        q: q.question,
        a: opt[0] ?? '', b: opt[1] ?? '', c: opt[2] ?? '', d: opt[3] ?? '',
        diff: q.difficulty ?? '',
      };
      if (opts.variant === 'private') {
        const idx = q.correctIndex ?? -1;
        row.correct =
          idx >= 0 && idx < opt.length
            ? `${LETTERS[idx]}. ${opt[idx]}`
            : '';
        row.why = q.explanation ?? '';
      }
      ws.addRow(row);
    });

    // Header row style
    const head = ws.getRow(1);
    head.height = 22;
    head.font = { name: 'Inter', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    head.fill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: argb(opts.primary) },
    };
    head.alignment = { vertical: 'middle', horizontal: 'left' };
    head.eachCell((c) => {
      c.border = {
        top:    { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left:   { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right:  { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });

    // Body rows
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      row.alignment = { vertical: 'top', wrapText: true };
      row.height = 60;
      row.font = { name: 'Inter', size: 10 };
    }

    ws.views = [{ state: 'frozen', ySplit: 1 }];

    const out = await wb.xlsx.writeBuffer();
    return Buffer.from(out);
  }
}
