-- AlterTable
ALTER TABLE "User" ADD COLUMN     "faceVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "photoPath" TEXT;

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "candidateId" TEXT,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "deviceId" TEXT,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "Invite"("tokenHash");

-- CreateIndex
CREATE INDEX "Invite_examId_role_idx" ON "Invite"("examId", "role");

-- CreateIndex
CREATE INDEX "Invite_candidateId_idx" ON "Invite"("candidateId");

-- CreateIndex
CREATE INDEX "Invite_userId_idx" ON "Invite"("userId");

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

