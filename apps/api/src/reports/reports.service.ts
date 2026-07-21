import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument = require('pdfkit');
import { PrismaService } from '../prisma/prisma.service';
import { toDateOnly } from '../common/kpi.constants';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private fontPath() {
    const candidates = [
      path.join(process.cwd(), 'assets', 'fonts', 'NotoSans-Regular.ttf'),
      path.join(__dirname, '..', '..', 'assets', 'fonts', 'NotoSans-Regular.ttf'),
      path.join(__dirname, '..', '..', '..', 'assets', 'fonts', 'NotoSans-Regular.ttf'),
    ];
    return candidates.find((p) => fs.existsSync(p));
  }

  async getRange(from: string, to: string) {
    const start = toDateOnly(from);
    const end = toDateOnly(to);
    const scores = await this.prisma.dailyScore.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
    });
    const avg = scores.length
      ? Math.round((scores.reduce((s, x) => s + x.totalScore, 0) / scores.length) * 10) / 10
      : 0;
    return { from, to, avg, scores };
  }

  async excel(from: string, to: string): Promise<Buffer> {
    const data = await this.getRange(from, to);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'KliniKPI';
    const ws = wb.addWorksheet('KPI Hisobot');
    ws.columns = [
      { header: 'Sana', key: 'date', width: 14 },
      { header: 'Umumiy ball', key: 'score', width: 14 },
      { header: 'Holat', key: 'color', width: 12 },
      { header: 'Klinika', key: 'clinic', width: 10 },
      { header: 'Retsepshn', key: 'reception', width: 12 },
      { header: "Qo'ng'iroqlar", key: 'calls', width: 12 },
      { header: 'Sharhlar', key: 'reviews', width: 10 },
      { header: 'Uniforma', key: 'uniform', width: 10 },
      { header: 'Ombor', key: 'warehouse', width: 10 },
      { header: 'SMM', key: 'smm', width: 10 },
      { header: 'Marketing', key: 'marketing', width: 12 },
      { header: 'Shifokorlar', key: 'doctors', width: 12 },
      { header: 'To\'ldirilgan majburiy', key: 'required', width: 18 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const s of data.scores) {
      const blocks = (s.blockScores as Record<string, any>) || {};
      const completion = (s.completion as any) || null;
      ws.addRow({
        date: s.date.toISOString().slice(0, 10),
        score: s.totalScore,
        color: s.colorStatus,
        clinic: blocks.clinic ?? '',
        reception: blocks.reception ?? '',
        calls: blocks.calls ?? '',
        reviews: blocks.reviews ?? '',
        uniform: blocks.uniform ?? '',
        warehouse: blocks.warehouse ?? '',
        smm: blocks.smm ?? '',
        marketing: blocks.marketing ?? '',
        doctors: blocks.doctors ?? '',
        required: completion ? `${completion.requiredFilled}/${completion.requiredTotal}` : '',
      });
    }
    ws.addRow({});
    ws.addRow({ date: "O'rtacha", score: data.avg });
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async pdf(from: string, to: string): Promise<Buffer> {
    const data = await this.getRange(from, to);
    const font = this.fontPath();

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      if (font) {
        doc.registerFont('Noto', font);
        doc.font('Noto');
      }

      doc.fontSize(20).text('KliniKPI Hisobot', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Davr: ${from} — ${to}`);
      doc.text(`O'rtacha ball: ${data.avg}%`);
      doc.text(`Kunlar soni: ${data.scores.length}`);
      doc.moveDown();
      doc.fontSize(11).text("Kunlik natijalar:", { underline: true });
      doc.moveDown(0.5);

      for (const s of data.scores) {
        const completion = (s.completion as any) || null;
        const filled = completion
          ? ` | to'ldirilgan ${completion.requiredFilled}/${completion.requiredTotal}`
          : '';
        doc.fontSize(10).text(
          `${s.date.toISOString().slice(0, 10)}  |  ${s.totalScore}%  |  ${s.colorStatus}${filled}`,
        );
      }

      doc.moveDown();
      doc.fontSize(9).fillColor('#666').text('Yaratilgan: KliniKPI platformasi', { align: 'center' });
      doc.end();
    });
  }
}
