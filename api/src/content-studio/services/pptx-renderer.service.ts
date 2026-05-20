import { Injectable } from '@nestjs/common';
import PptxGenJS from 'pptxgenjs';
import { Brand } from '../entities/brand.entity';

export type SlideLayout = 'title' | 'kicker' | 'bullets' | 'end';

export interface SlideJson {
  layout: SlideLayout;
  title?: string;
  subtitle?: string;
  kicker?: string;
  body?: string;
  bullets?: string[];
}

/** Strip "#" so pptxgenjs gets a bare RRGGBB. Fallback white. */
function hex(c: string | null | undefined, fallback: string): string {
  if (!c) return fallback;
  return c.replace(/^#/, '').slice(0, 6).padEnd(6, '0').toUpperCase();
}

/**
 * Renders 13 SlideJson objects to a branded .pptx Buffer (16:9 widescreen).
 * Theme: dark navy background, brand primary for titles/accents, brand
 * secondary for the kicker label on each slide.
 */
@Injectable()
export class PptxRendererService {
  async render(slides: SlideJson[], brand: Brand): Promise<Buffer> {
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 in
    pres.title = brand.name;
    pres.author = brand.name;

    const BG = '0B1230';
    const TEXT = 'E6ECFF';
    const MUTED = 'B8C5E0';
    const PRIMARY = hex(brand.colorPrimary, '00D4FF');
    const SECONDARY = hex(brand.colorSecondary, 'FFB800');

    for (const s of slides) {
      const slide = pres.addSlide();
      slide.background = { color: BG };

      if (s.layout === 'title') {
        // brand accent bar
        slide.addShape('rect', {
          x: 0, y: 6.95, w: 13.333, h: 0.55, fill: { color: PRIMARY },
        });
        slide.addText(s.title ?? brand.name, {
          x: 0.7, y: 2.4, w: 11.9, h: 1.6,
          fontSize: 54, bold: true, color: TEXT, fontFace: 'Inter',
        });
        if (s.subtitle) {
          slide.addText(s.subtitle, {
            x: 0.7, y: 4.1, w: 11.9, h: 1.2,
            fontSize: 22, color: MUTED, fontFace: 'Inter',
          });
        }
        slide.addText(brand.name, {
          x: 0.7, y: 6.55, w: 6, h: 0.4,
          fontSize: 12, color: PRIMARY, bold: true, fontFace: 'Inter',
        });
        continue;
      }

      if (s.layout === 'kicker') {
        if (s.kicker) {
          slide.addText(s.kicker.toUpperCase(), {
            x: 0.7, y: 0.6, w: 11.9, h: 0.5,
            fontSize: 14, bold: true, color: SECONDARY,
            charSpacing: 4, fontFace: 'Inter',
          });
        }
        slide.addText(s.title ?? '', {
          x: 0.7, y: 1.4, w: 11.9, h: 2.4,
          fontSize: 42, bold: true, color: TEXT, fontFace: 'Inter',
        });
        if (s.body) {
          slide.addText(s.body, {
            x: 0.7, y: 4.2, w: 11.9, h: 2.2,
            fontSize: 22, color: MUTED, fontFace: 'Inter',
            paraSpaceAfter: 10,
          });
        }
        slide.addShape('rect', {
          x: 0.7, y: 6.8, w: 0.6, h: 0.06, fill: { color: PRIMARY },
        });
        continue;
      }

      if (s.layout === 'bullets') {
        slide.addText(s.title ?? '', {
          x: 0.7, y: 0.55, w: 11.9, h: 1.1,
          fontSize: 32, bold: true, color: TEXT, fontFace: 'Inter',
        });
        slide.addShape('rect', {
          x: 0.7, y: 1.55, w: 0.8, h: 0.08, fill: { color: PRIMARY },
        });
        const items = (s.bullets ?? []).slice(0, 6);
        if (items.length > 0) {
          slide.addText(
            items.map((t) => ({
              text: t,
              options: { bullet: { code: '25CF' }, color: TEXT, fontSize: 20 },
            })),
            {
              x: 0.7, y: 1.95, w: 11.9, h: 4.8,
              fontSize: 20, color: TEXT, fontFace: 'Inter',
              paraSpaceAfter: 12, valign: 'top',
            },
          );
        }
        if (s.body) {
          slide.addText(s.body, {
            x: 0.7, y: 6.4, w: 11.9, h: 0.6,
            fontSize: 14, color: MUTED, italic: true, fontFace: 'Inter',
          });
        }
        continue;
      }

      // end card
      slide.addShape('rect', {
        x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: BG },
      });
      slide.addText(s.title ?? 'Subscribe', {
        x: 0.7, y: 2.8, w: 11.9, h: 1.6,
        fontSize: 52, bold: true, color: PRIMARY,
        align: 'center', fontFace: 'Inter',
      });
      if (s.subtitle) {
        slide.addText(s.subtitle, {
          x: 0.7, y: 4.4, w: 11.9, h: 1.2,
          fontSize: 22, color: TEXT, align: 'center', fontFace: 'Inter',
        });
      }
      slide.addShape('rect', {
        x: 5.667, y: 6.5, w: 2, h: 0.08, fill: { color: SECONDARY },
      });
    }

    const out = (await pres.write({ outputType: 'nodebuffer' })) as
      | Buffer
      | Uint8Array;
    return Buffer.isBuffer(out) ? out : Buffer.from(out);
  }
}
