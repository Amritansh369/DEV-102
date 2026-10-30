-- Candidates may use anything during an exam: flags go to the proctor only, so existing exams switch to proctor-only.
UPDATE "Exam" SET "settings" = COALESCE("settings", '{}'::jsonb) || '{"proctorOnly": true}'::jsonb;

-- What an AI assistant answered, and the marks taken off for confirmed violations.
ALTER TABLE "BrowsingLog" ADD COLUMN "reply" TEXT;
ALTER TABLE "ExamSession" ADD COLUMN "penaltyMarks" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Violation" ADD COLUMN "penaltyMarks" DOUBLE PRECISION;

-- Evidence and face photos live in the database: hosted disks are wiped on every restart.
ALTER TABLE "Evidence" ADD COLUMN "data" BYTEA;

CREATE TABLE "FacePhoto" (
    "ownerId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacePhoto_pkey" PRIMARY KEY ("ownerId")
);
