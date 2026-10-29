# Project tech stack

| Area | Technology | What it does |
| --- | --- | --- |
| Website | Next.js 15, React 19, TypeScript, Tailwind CSS 4 | Public site plus admin, mentor, and candidate web experiences. |
| Desktop app | Electron 35, React 19, Vite, TypeScript | Candidate kiosk exam app and desktop mentor monitor; accesses camera, screen, and device checks. |
| Browser extension | Chrome Manifest V3, JavaScript | Browser-based exam companion that reports browsing and focus activity. |
| API | Node.js, Express 5, TypeScript | REST API for authentication, exams, sessions, reporting, and proctoring policy. |
| Realtime | Socket.IO and WebRTC | Live session events, webcam snapshots, and screen viewing. |
| AI agent | Python, FastAPI, OpenCV, MediaPipe | Analyzes webcam imagery for faces, identity, gaze, and objects; returns proctoring events. |
| Database | PostgreSQL, Prisma ORM | Stores users, exams, sessions, answers, and violations; Prisma manages schema and queries. |
| Validation and state | Zod, React Hook Form, Zustand | Validates inputs, manages forms, and holds client-side application state. |
| Reports and charts | ExcelJS, PDFKit, Recharts | Generates downloadable reports and displays analytics. |
| Security and operations | bcryptjs, JWT, Helmet, express-rate-limit, Pino | Password hashing, token authentication, HTTP security headers, request limits, and structured logs. |
| Development tools | npm workspaces, Vitest, pytest, ESLint | Manages the monorepo packages and supports testing and code checks. |

The project is split across `apps/web`, `apps/desktop`, `apps/extension`, `apps/api`, `backend-services`, and `database/prisma`.
