CREATE TYPE "InputRequestStatus" AS ENUM ('OPEN', 'RESOLVED');
CREATE TYPE "ArtifactReviewDecision" AS ENUM ('APPROVED', 'CHANGES_REQUESTED');

CREATE TABLE "InputRequest" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL REFERENCES "Task"("id") ON DELETE CASCADE,
  "runId" TEXT NOT NULL REFERENCES "AgentRun"("id") ON DELETE CASCADE,
  "question" TEXT NOT NULL,
  "status" "InputRequestStatus" NOT NULL DEFAULT 'OPEN',
  "response" TEXT,
  "resolvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3)
);
CREATE INDEX "InputRequest_workspaceId_projectId_status_idx" ON "InputRequest"("workspaceId", "projectId", "status");

CREATE TABLE "ArtifactReview" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "artifactId" TEXT NOT NULL REFERENCES "Artifact"("id") ON DELETE CASCADE,
  "runId" TEXT,
  "actorId" TEXT NOT NULL,
  "decision" "ArtifactReviewDecision" NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ArtifactReview_artifactId_createdAt_idx" ON "ArtifactReview"("artifactId", "createdAt");
