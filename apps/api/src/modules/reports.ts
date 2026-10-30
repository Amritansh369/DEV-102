import { Router } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { handle, must } from '../lib/core.js';
import { prisma } from '../lib/db.js';
import { audit, staff } from '../lib/auth.js';
import { VIOLATION_META, examInclude, toExam } from '../lib/domain.js';
import { evidencePath } from '../lib/evidence.js';

const BRAND = '1D4ED8';
const SEV_FILL: Record<string, string> = { LOW: 'E2E8F0', MEDIUM: 'FEF3C7', HIGH: 'FFEDD5', CRITICAL: 'FEE2E2' };
const fmt = (d: Date | null | undefined) => (d ? d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium' }) : '');
const safeName = (s: string) => s.replace(/[^\w.-]+/g, '_').slice(0, 60);

export const reportsRouter = Router();
reportsRouter.use(...staff);

reportsRouter.get('/exams/:id/results.xlsx', handle(async (req, res) => {
  const exam = must(await prisma.exam.findFirst({ where: { id: String(req.params.id), deletedAt: null }, include: examInclude }), 'Exam');
  const view = toExam(exam);
  const sessions = await prisma.examSession.findMany({
    where: { examId: exam.id },
    include: { candidate: true, violations: { orderBy: { at: 'asc' } }, _count: { select: { answers: true } } },
    orderBy: { score: 'desc' },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Where U Elevate Smart Proctor';
  wb.created = new Date();
  const header = (ws: ExcelJS.Worksheet) => {
    const row = ws.getRow(1);
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND}` } };
    row.height = 22;
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  };

  const results = wb.addWorksheet('Results');
  results.columns = [
    { header: 'Rank', key: 'rank', width: 7 }, { header: 'Name', key: 'name', width: 26 }, { header: 'User ID', key: 'userId', width: 14 },
    { header: 'Email', key: 'email', width: 32 }, { header: 'Score', key: 'score', width: 9 }, { header: 'Marks deducted', key: 'deducted', width: 14 }, { header: 'Out of', key: 'total', width: 8 },
    { header: '%', key: 'pct', width: 7 }, { header: 'Answered', key: 'answered', width: 10 }, { header: 'Risk', key: 'risk', width: 7 },
    { header: 'Violations', key: 'violations', width: 11 }, { header: 'Session', key: 'status', width: 12 }, { header: 'Reason', key: 'reason', width: 22 },
    { header: 'Started', key: 'started', width: 22 }, { header: 'Submitted', key: 'submitted', width: 22 }, { header: 'Receipt', key: 'receipt', width: 16 },
  ];
  sessions.forEach((s, i) => {
    const row = results.addRow({
      rank: i + 1, name: s.candidate.name, userId: s.candidate.userId, email: s.candidate.email, score: s.score ?? 0, deducted: s.penaltyMarks, total: view.totalMarks,
      pct: view.totalMarks ? Math.round(((s.score ?? 0) / view.totalMarks) * 100) : 0, answered: s._count.answers, risk: s.riskScore,
      violations: s.violations.filter((v) => v.reviewed !== 'OVERRULED').length, status: s.status, reason: s.submitReason ?? '',
      started: fmt(s.startedAt), submitted: fmt(s.submittedAt), receipt: s.receiptId ?? '',
    });
    if (s.riskScore >= 60) row.getCell('risk').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    if (s.status === 'TERMINATED') row.getCell('status').font = { color: { argb: 'FFB91C1C' }, bold: true };
  });
  header(results);

  const vws = wb.addWorksheet('Violations');
  vws.columns = [
    { header: 'Time', key: 'at', width: 22 }, { header: 'Candidate', key: 'name', width: 26 }, { header: 'User ID', key: 'userId', width: 14 },
    { header: 'Code', key: 'code', width: 22 }, { header: 'Label', key: 'label', width: 22 }, { header: 'Severity', key: 'severity', width: 10 },
    { header: 'Message', key: 'message', width: 60 }, { header: 'Source', key: 'source', width: 9 }, { header: 'Outcome', key: 'outcome', width: 12 },
    { header: 'Review', key: 'reviewed', width: 12 }, { header: 'Review reason', key: 'reason', width: 30 },
  ];
  for (const s of sessions) {
    for (const v of s.violations) {
      const row = vws.addRow({
        at: fmt(v.at), name: s.candidate.name, userId: s.candidate.userId, code: v.code, label: VIOLATION_META[v.code].label, severity: v.severity,
        message: v.message, source: v.source, outcome: v.outcome, reviewed: v.reviewed ?? 'PENDING', reason: v.reviewReason ?? '',
      });
      row.getCell('severity').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${SEV_FILL[v.severity]}` } };
    }
  }
  header(vws);

  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ header: 'Metric', key: 'k', width: 34 }, { header: 'Value', key: 'v', width: 40 }];
  const scores = sessions.filter((s) => s.score !== null).map((s) => s.score ?? 0);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const passMark = view.totalMarks * 0.4;
  [
    ['Exam', `${exam.title} (${exam.code})`], ['Window', `${fmt(exam.startsAt)} to ${fmt(exam.endsAt)}`], ['Duration (min)', exam.durationMin],
    ['Questions', view.questionCount], ['Total marks', view.totalMarks], ['Sessions', sessions.length],
    ['Submitted', sessions.filter((s) => s.status === 'SUBMITTED').length], ['Terminated / disqualified', sessions.filter((s) => s.status === 'TERMINATED').length],
    ['Average score', Math.round(avg * 100) / 100], ['Highest score', scores.length ? Math.max(...scores) : 0],
    ['Pass rate (40%)', scores.length ? `${Math.round((scores.filter((s) => s >= passMark).length / scores.length) * 100)}%` : '0%'],
    ['Violations', sessions.reduce((n, s) => n + s.violations.length, 0)], ['Generated', fmt(new Date())],
  ].forEach(([k, v]) => sum.addRow({ k, v }));
  header(sum);

  audit(req, 'report.results_xlsx', exam.id);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName(exam.code)}-results.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));

reportsRouter.get('/sessions/:id/report.pdf', handle(async (req, res) => {
  const s = must(await prisma.examSession.findUnique({
    where: { id: String(req.params.id) },
    include: {
      candidate: true, exam: { include: examInclude }, violations: { orderBy: { at: 'asc' }, include: { evidence: true } },
      browsing: { orderBy: { at: 'asc' } }, warningsSent: { orderBy: { at: 'asc' } },
    },
  }), 'Session');
  const view = toExam(s.exam);
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Session report ${s.candidate.name}`, Author: 'Where U Elevate Smart Proctor' } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName(`${s.exam.code}-${s.candidate.userId}`)}-report.pdf"`);
  doc.pipe(res);

  doc.rect(0, 0, doc.page.width, 92).fill(`#${BRAND}`);
  doc.fillColor('#fff').fontSize(10).text('WHERE U ELEVATE · SMART PROCTOR', 48, 28, { characterSpacing: 1.5 });
  doc.fontSize(20).text('Proctoring session report', 48, 46);
  doc.fillColor('#0f172a').moveDown(2.2);

  const kv = (k: string, v: string) => {
    doc.font('Helvetica-Bold').fontSize(10).text(`${k}: `, { continued: true }).font('Helvetica').text(v);
  };
  doc.y = 112;
  kv('Candidate', `${s.candidate.name} (${s.candidate.userId}, ${s.candidate.email})`);
  kv('Exam', `${s.exam.title} (${s.exam.code})`);
  kv('Status', `${s.status}${s.submitReason ? ` · ${s.submitReason.replace(/_/g, ' ').toLowerCase()}` : ''}`);
  kv('Score', `${s.score ?? 0} / ${view.totalMarks}${s.penaltyMarks ? ` (${s.penaltyMarks} marks deducted for confirmed violations)` : ''}`);
  kv('Risk score', `${s.riskScore} / 100 · warnings ${s.warnings}`);
  kv('Started', fmt(s.startedAt));
  kv('Submitted', fmt(s.submittedAt) || 'In progress');
  kv('Receipt', s.receiptId ?? 'n/a');
  if (s.decision) kv('Proctor decision', String((s.decision as { outcome?: string }).outcome ?? ''));

  const section = (title: string) => {
    if (doc.y > doc.page.height - 140) doc.addPage();
    doc.moveDown(1).font('Helvetica-Bold').fontSize(13).fillColor(`#${BRAND}`).text(title).fillColor('#0f172a').font('Helvetica').fontSize(9.5).moveDown(0.3);
  };

  section(`Violation timeline (${s.violations.length})`);
  if (!s.violations.length) doc.text('No violations were recorded.');
  for (const v of s.violations) {
    if (doc.y > doc.page.height - 120) doc.addPage();
    const color = { LOW: '#64748b', MEDIUM: '#b45309', HIGH: '#c2410c', CRITICAL: '#b91c1c' }[v.severity];
    doc.fillColor(color).font('Helvetica-Bold').text(`${fmt(v.at)}  ${v.severity}  ${VIOLATION_META[v.code].label}`, { continued: Boolean(v.reviewed) });
    if (v.reviewed) doc.fillColor(v.reviewed === 'OVERRULED' ? '#15803d' : '#b91c1c').text(`  [${v.reviewed}${v.reviewReason ? `: ${v.reviewReason}` : ''}]`);
    doc.fillColor('#334155').font('Helvetica').text(v.message, { indent: 12 });
    const ev = v.evidence;
    if (ev && /jpe?g|png/.test(ev.mime) && existsSync(evidencePath(ev.path))) {
      if (doc.y > doc.page.height - 150) doc.addPage();
      doc.image(evidencePath(ev.path), doc.x + 12, doc.y + 4, { fit: [180, 110] });
      doc.y += 118;
    }
    doc.moveDown(0.35);
  }

  section(`Browsing and search log (${s.browsing.length})`);
  if (!s.browsing.length) doc.text('No sandbox browsing was recorded.');
  for (const b of s.browsing) {
    if (doc.y > doc.page.height - 80) doc.addPage();
    doc.fillColor(b.flaggedAi ? '#b91c1c' : '#0f172a').font(b.flaggedAi ? 'Helvetica-Bold' : 'Helvetica')
      .text(`${fmt(b.at)}  ${b.flaggedAi ? '[AI] ' : ''}${b.title || b.url}`);
    doc.fillColor('#475569').font('Helvetica').text(b.url, { indent: 12 });
    if (b.query) doc.fillColor('#b91c1c').text(`Typed: "${b.query}"`, { indent: 12 });
  }

  if (s.warningsSent.length) {
    section('Proctor messages');
    for (const w of s.warningsSent) doc.fillColor('#0f172a').text(`${fmt(w.at)}  ${w.message}`);
  }
  doc.moveDown(1.5).fontSize(8).fillColor('#94a3b8').text(`Generated ${fmt(new Date())}. Automated signals are reviewed by a human before any penalty is final.`);
  audit(req, 'report.session_pdf', s.id);
  const finished = new Promise<void>((resolve, reject) => { res.on('finish', resolve); res.on('error', reject); });
  doc.end();
  await finished;
}));
