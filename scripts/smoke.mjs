// End-to-end API smoke test against a running API: node scripts/smoke.mjs [baseUrl]
// Walks admin, candidate and mentor flows and exits non-zero on the first failure.
const BASE = (process.argv[2] ?? 'http://localhost:4000') + '/api/v1';
let failures = 0;

async function call(method, path, { token, body, raw } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (raw) return res;
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

function check(name, cond, extra) {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}`, extra ? JSON.stringify(extra).slice(0, 400) : ''); }
}

const tinyJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);
const frame = `data:image/jpeg;base64,${Buffer.concat([tinyJpeg, Buffer.alloc(200)]).toString('base64')}`;

console.log('admin');
const admin = await call('POST', '/auth/staff/login', { body: { email: 'admin@wue.in', password: 'Admin@123' } });
check('staff login', admin.ok, admin);
const at = admin.data?.token;
const exams = await call('GET', '/exams?pageSize=50', { token: at });
check('list exams', exams.ok && exams.data.items.length >= 6, exams);
const live = exams.data?.items.find((e) => e.code === 'CPA-26');
check('CPA-26 is LIVE', live?.status === 'LIVE', live);
const dash = await call('GET', '/admin/dashboard', { token: at });
check('dashboard', dash.ok && dash.data.kpis.totalExams >= 6, dash);
for (const p of ['/admin/dashboard/summary', '/admin/dashboard/live-series', '/admin/dashboard/violations-by-type', '/admin/activity', '/admin/notifications', `/exams/${live.id}/detail`, `/exams/${live.id}/questions`, `/exams/${live.id}/candidate-summary`, `/exams/${live.id}/violation-summary`, `/exams/${live.id}/results`, '/reports/violations', `/reports/exams/exm_04/summary`, '/candidates?pageSize=5', '/violations?pageSize=5', '/sessions', '/mentor/dashboard', '/monitor/exams']) {
  const r = await call('GET', p, { token: at });
  check(`GET ${p}`, r.ok, r);
}
const created = await call('POST', '/exams', { token: at, body: { title: 'Smoke Test Exam Alpha', startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString(), durationMin: 30 } });
check('create exam', created.ok, created);
const q = await call('POST', `/exams/${created.data.id}/questions`, { token: at, body: { text: 'What is two plus two in base ten?', options: [{ id: 'a', text: '3' }, { id: 'b', text: '4' }], correctIds: ['b'], marks: 2, difficulty: 'EASY', tags: ['math'] } });
check('create question', q.ok, q);
const nq = await call('POST', `/exams/${created.data.id}/questions`, { token: at, body: { type: 'NUMERIC', text: 'A train covers 120 km in 2 hours. What is its speed?', answerKey: { value: 60, tolerance: 0.5, unit: 'km/h' }, marks: 2, difficulty: 'EASY', tags: ['math'] } });
check('numeric question created', nq.ok && nq.data.type === 'NUMERIC' && nq.data.answerKey?.value === 60 && nq.data.unit === 'km/h' && nq.data.options.length === 0, nq);
const badNq = await call('POST', `/exams/${created.data.id}/questions`, { token: at, body: { type: 'NUMERIC', text: 'A train covers 120 km in 2 hours. What is its speed?', answerKey: { value: 60, tolerance: -1 }, marks: 2, difficulty: 'EASY' } });
check('negative tolerance rejected', badNq.status === 400 && /Tolerance/.test(badNq.error?.message ?? ''), badNq);
const imp = await call('POST', `/exams/${created.data.id}/questions/import/preview`, { token: at, body: { csv: 'question,optionA,optionB,optionC,optionD,correct,marks,difficulty,tags\n"Which planet is the red planet?",Mars,Venus,,,A,1,EASY,space\nbad row' } });
check('import preview row-level report', imp.ok && imp.data.valid.length === 1 && imp.data.errors.length === 1, imp);
const cands = await call('POST', `/exams/${created.data.id}/candidates/import`, { token: at, body: { rows: [{ name: 'Smoke Person', email: 'smoke.person@example.com' }, { name: 'x', email: 'bad' }] } });
check('import candidates', cands.ok && cands.data.credentials.length === 1 && cands.data.invalid.length === 1, cands);
const mail = await call('POST', `/candidates/${cands.data.added[0].id}/send-credentials`, { token: at, body: {} });
check('send credentials (outbox)', mail.ok && mail.data.emailStatus === 'SENT', mail);
const pub = await call('POST', `/exams/${created.data.id}/publish`, { token: at });
check('publish exam', pub.ok && pub.data.status === 'SCHEDULED', pub);
const xlsx = await call('GET', `/reports/exams/exm_04/results.xlsx`, { token: at, raw: true });
check('results.xlsx', xlsx.ok && (xlsx.headers.get('content-type') ?? '').includes('spreadsheet'));
const pdf = await call('GET', `/reports/sessions/ses_021/report.pdf`, { token: at, raw: true });
check('session report.pdf', pdf.ok && (pdf.headers.get('content-type') ?? '').includes('pdf'), pdf.status);
await call('DELETE', `/exams/${created.data.id}`, { token: at });

console.log('candidate');
await call('POST', '/dev/reset-candidate', { token: at, body: { userId: 'WUE26DEMO' } });
const bad = await call('POST', '/auth/login', { body: { examId: 'CPA-26', userId: 'WUE26DEMO', password: 'nope', deviceId: 'smoke-device-0001' } });
check('wrong password rejected', !bad.ok && bad.error.code === 'AUTH', bad);
const login = await call('POST', '/auth/login', { body: { examId: 'cpa-26', userId: 'wue26demo', password: 'Demo@2026', deviceId: 'smoke-device-0001' } });
check('candidate login', login.ok, login);
const ct = login.data?.token;
const early = await call('POST', '/sessions/start', { token: ct, body: { consent: true } });
check('start blocked before OTP/face', !early.ok && early.error.code === 'FORBIDDEN', early);
const otp = await call('POST', '/auth/otp/send', { token: ct });
check('otp send', otp.ok && /^\d{6}$/.test(otp.data.devCode ?? ''), otp);
const wrongOtp = await call('POST', '/auth/otp/verify', { token: ct, body: { challengeId: otp.data.challengeId, code: otp.data.devCode === '000000' ? '111111' : '000000' } });
check('wrong otp rejected', !wrongOtp.ok, wrongOtp);
const okOtp = await call('POST', '/auth/otp/verify', { token: ct, body: { challengeId: otp.data.challengeId, code: otp.data.devCode } });
check('otp verify', okOtp.ok, okOtp);
const face = await call('POST', '/auth/face/verify', { token: ct, body: { image: frame } });
// The synthetic frame has no face, so with the agent running verification must refuse it.
check('face verify answers', face.ok, face);
if (!face.data?.passed) {
  check('blank frame rejected by the agent', face.data?.faces === 0, face);
  await call('POST', '/dev/verify-me', { token: ct });
}
const paper = await call('POST', '/sessions/start', { token: ct, body: { consent: true } });
check('session start', paper.ok && paper.data.questions.length === 22, paper);
check('answers hidden from candidate', paper.data?.questions.every((x) => x.correctIds.length === 0));
const sid = paper.data?.sessionId;
const firstQ = paper.data.questions.find((x) => x.type !== 'NUMERIC');
const save = await call('PUT', `/sessions/${sid}/answers`, { token: ct, body: { answers: { [firstQ.id]: [firstQ.options[0].id] }, flagged: [firstQ.id] } });
check('autosave', save.ok && save.data.count === 1, save);
const numQ = paper.data.questions.find((x) => x.type === 'NUMERIC');
check('numeric question on paper without its answer', Boolean(numQ) && !('answerKey' in numQ) && numQ.options.length === 0 && Boolean(numQ.unit), numQ);
const numSave = await call('PUT', `/sessions/${sid}/answers`, { token: ct, body: { answers: {}, values: { [numQ.id]: 72 } } });
check('numeric answer saved alongside the choice answer', numSave.ok && numSave.data.count === 2, numSave);
const hb = await call('POST', `/sessions/${sid}/heartbeat`, { token: ct, body: { currentQuestion: 1 } });
check('heartbeat', hb.ok && hb.data.remainingSec > 0, hb);
const browse = await call('POST', '/proctoring/browsing-logs', { token: ct, body: { sessionId: sid, entries: [{ url: 'https://chatgpt.com/', title: 'ChatGPT' }] } });
check('AI site flagged', browse.ok && browse.data.flagged === 1, browse);
const ev = await call('POST', '/proctoring/events', { token: ct, body: { sessionId: sid, code: 'WINDOW_BLUR' } });
check('event recorded', ev.ok && ['WARNING', 'LOGGED', 'AUTO_SUBMIT'].includes(ev.data.outcome), ev);
const voice = await call('POST', '/proctoring/events', { token: ct, body: { sessionId: sid, code: 'VOICE_DETECTED', source: 'client', confidence: 0.8 } });
check('voice event recorded', voice.ok && ['WARNING', 'LOGGED'].includes(voice.data.outcome), voice);
const other = await call('POST', '/auth/login', { body: { examId: 'CPA-26', userId: 'WUE26DEMO', password: 'Demo@2026', deviceId: 'smoke-device-9999' } });
check('second device blocked (MULTI_LOGIN)', !other.ok && other.error.code === 'CONFLICT', other);
const state = await call('GET', `/sessions/${sid}/state`, { token: ct });
check('MULTI_LOGIN keeps the exam running and only tells the proctor', state.ok && state.data.session.status === 'LIVE', state);

console.log('mentor');
const mentor = await call('POST', '/auth/staff/login', { body: { email: 'mentor@wue.in', password: 'Mentor@123' } });
const mt = mentor.data?.token;
const detail = await call('GET', `/sessions/${sid}/detail`, { token: mt });
check('session detail', detail.ok && detail.data.violations.length >= 3 && detail.data.browsing.length === 1, detail);
const trigger = detail.data.violations.find((v) => v.code === 'MULTI_LOGIN');
const review = await call('POST', `/violations/${trigger.id}/review`, { token: mt, body: { verdict: 'OVERRULED', reason: 'Candidate restarted their own laptop.' } });
check('overrule clears the flag and the session stays live', review.ok && review.data.violation.reviewed === 'OVERRULED' && review.data.session.status === 'LIVE', review);
const warn = await call('POST', `/sessions/${sid}/warn`, { token: mt, body: { message: 'Please keep your face in view.' } });
check('mentor warning', warn.ok, warn);
const forbidden = await call('POST', '/exams', { token: mt, body: {} });
check('mentor cannot create exams', !forbidden.ok && forbidden.error.code === 'FORBIDDEN', forbidden);
const evidenceUrl = detail.data.violations.find((v) => v.evidenceUrl)?.evidenceUrl ?? (await call('GET', '/sessions/ses_001/detail', { token: mt })).data.violations.find((v) => v.evidenceUrl)?.evidenceUrl;
if (evidenceUrl) {
  const img = await fetch(evidenceUrl);
  check('signed evidence URL serves the image', img.ok);
  const tampered = await fetch(evidenceUrl.replace(/sig=./, 'sig=X'));
  check('tampered evidence URL rejected', tampered.status === 403);
}

const submit = await call('POST', `/sessions/${sid}/submit`, { token: ct, body: { answers: { [firstQ.id]: firstQ.options.map((o) => o.id).slice(0, 1) }, reason: 'MANUAL' } });
check('submit', submit.ok && submit.data.receiptId, submit);
const lobby = await call('GET', '/candidate/lobby', { token: ct });
const rel = lobby.data?.result?.release;
check('lobby shows the result release state', lobby.ok && rel && (rel.scoreReleased ? Boolean(lobby.data.result.summary) : !lobby.data.result.summary), lobby);
const reviewEarly = await call('GET', '/candidate/results', { token: ct });
check('answer review hidden while the exam window is open', reviewEarly.status === 403, reviewEarly);
const manual = await call('POST', `/exams/${lobby.data?.exam?.id}/release-results`, { token: at });
check('manual release refused for an automatic exam', manual.status === 409, manual);
const unauth = await call('GET', '/exams');
check('unauthenticated request rejected', unauth.status === 401);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
