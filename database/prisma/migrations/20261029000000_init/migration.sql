-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MENTOR', 'CANDIDATE');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'LIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('INVITED', 'EMAILED', 'IN_EXAM', 'SUBMITTED', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('WAITING', 'LIVE', 'SUBMITTED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ViolationCode" AS ENUM ('MULTIPLE_FACES', 'NO_FACE', 'GAZE_AWAY', 'FACE_MISMATCH', 'AI_SITE_OPENED', 'AI_QUERY_DETECTED', 'BLACKLISTED_APP', 'SCREEN_MIRRORING', 'MULTI_MONITOR', 'VM_DETECTED', 'REMOTE_DESKTOP', 'EXTERNAL_DEVICE', 'CLIPBOARD_USE', 'SHORTCUT_BLOCKED', 'SCREEN_SHARE_STOPPED', 'CAMERA_BLOCKED', 'MULTI_LOGIN', 'NETWORK_LOST', 'WINDOW_BLUR', 'VOICE_DETECTED', 'MIC_BLOCKED', 'PHONE_DETECTED', 'NOTES_DETECTED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'NUMERIC');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('CONFIRMED', 'OVERRULED');

-- CreateEnum
CREATE TYPE "SubmitReason" AS ENUM ('MANUAL', 'TIME_UP', 'REPEATED_VIOLATIONS', 'CRITICAL_VIOLATION', 'TERMINATED_BY_MENTOR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "settings" JSONB NOT NULL,
    "extras" JSONB NOT NULL,
    "policy" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctIds" TEXT[],
    "multi" BOOLEAN NOT NULL DEFAULT false,
    "type" "QuestionType" NOT NULL DEFAULT 'MCQ',
    "answerKey" JSONB,
    "marks" INTEGER NOT NULL DEFAULT 1,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "CandidateStatus" NOT NULL DEFAULT 'INVITED',
    "emailStatus" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "photoPath" TEXT,
    "faceVerifiedAt" TIMESTAMP(3),
    "faceScore" DOUBLE PRECISION,
    "credentialCipher" TEXT,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceBinding" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSession" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'WAITING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "warnings" INTEGER NOT NULL DEFAULT 0,
    "deviceId" TEXT,
    "questionOrder" TEXT[],
    "flagged" TEXT[],
    "consentAt" TIMESTAMP(3),
    "faceVerifiedAt" TIMESTAMP(3),
    "faceScore" DOUBLE PRECISION,
    "otpVerifiedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "lastHeartbeatAt" TIMESTAMP(3),
    "networkLost" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "submitReason" "SubmitReason",
    "score" DOUBLE PRECISION,
    "receiptId" TEXT,
    "decision" JSONB,

    CONSTRAINT "ExamSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "optionIds" TEXT[],
    "value" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Violation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "code" "ViolationCode" NOT NULL,
    "severity" "Severity" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'client',
    "confidence" DOUBLE PRECISION,
    "evidenceId" TEXT,
    "reviewed" "Verdict",
    "reviewReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "outcome" TEXT NOT NULL DEFAULT 'LOGGED',

    CONSTRAINT "Violation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrowsingLog" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "query" TEXT,
    "flaggedAi" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BrowsingLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskPoint" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" INTEGER NOT NULL,

    CONSTRAINT "RiskPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarningMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "byId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarningMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "sentTo" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" "Role",
    "action" TEXT NOT NULL,
    "target" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT,
    "to" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html" TEXT,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "href" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Exam_code_key" ON "Exam"("code");

-- CreateIndex
CREATE INDEX "Exam_status_startsAt_idx" ON "Exam"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Question_examId_position_idx" ON "Question"("examId", "position");

-- CreateIndex
CREATE INDEX "Candidate_userId_idx" ON "Candidate"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_examId_userId_key" ON "Candidate"("examId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_examId_email_key" ON "Candidate"("examId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceBinding_candidateId_key" ON "DeviceBinding"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSession_receiptId_key" ON "ExamSession"("receiptId");

-- CreateIndex
CREATE INDEX "ExamSession_examId_status_idx" ON "ExamSession"("examId", "status");

-- CreateIndex
CREATE INDEX "ExamSession_candidateId_idx" ON "ExamSession"("candidateId");

-- CreateIndex
CREATE INDEX "ExamSession_status_deadlineAt_idx" ON "ExamSession"("status", "deadlineAt");

-- CreateIndex
CREATE UNIQUE INDEX "Answer_sessionId_questionId_key" ON "Answer"("sessionId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Violation_evidenceId_key" ON "Violation"("evidenceId");

-- CreateIndex
CREATE INDEX "Violation_sessionId_at_idx" ON "Violation"("sessionId", "at");

-- CreateIndex
CREATE INDEX "Violation_at_idx" ON "Violation"("at");

-- CreateIndex
CREATE INDEX "Violation_code_idx" ON "Violation"("code");

-- CreateIndex
CREATE INDEX "Evidence_createdAt_idx" ON "Evidence"("createdAt");

-- CreateIndex
CREATE INDEX "BrowsingLog_sessionId_at_idx" ON "BrowsingLog"("sessionId", "at");

-- CreateIndex
CREATE INDEX "ActivityLog_sessionId_at_idx" ON "ActivityLog"("sessionId", "at");

-- CreateIndex
CREATE INDEX "RiskPoint_sessionId_at_idx" ON "RiskPoint"("sessionId", "at");

-- CreateIndex
CREATE INDEX "OtpCode_subjectId_createdAt_idx" ON "OtpCode"("subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "EmailLog_at_idx" ON "EmailLog"("at");

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceBinding" ADD CONSTRAINT "DeviceBinding_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrowsingLog" ADD CONSTRAINT "BrowsingLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskPoint" ADD CONSTRAINT "RiskPoint_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarningMessage" ADD CONSTRAINT "WarningMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarningMessage" ADD CONSTRAINT "WarningMessage_byId_fkey" FOREIGN KEY ("byId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

