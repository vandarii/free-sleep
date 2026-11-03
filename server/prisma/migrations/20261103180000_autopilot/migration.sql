-- CreateTable
CREATE TABLE "sleep_sessions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "side" TEXT NOT NULL,
    "started_at" INTEGER NOT NULL,
    "ended_at" INTEGER,
    "end_reason" TEXT,
    "start_source" TEXT NOT NULL,
    "is_nap" BOOLEAN NOT NULL DEFAULT false,
    "nap_requested" BOOLEAN NOT NULL DEFAULT false,
    "wake_at" INTEGER,
    "dry_run" BOOLEAN NOT NULL
);

-- CreateTable
CREATE TABLE "autopilot_decisions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "session_id" INTEGER NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "stage" TEXT NOT NULL,
    "target_f" INTEGER NOT NULL,
    "set_f" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "dry_run" BOOLEAN NOT NULL
);

-- CreateTable
CREATE TABLE "ambient" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" INTEGER NOT NULL,
    "hub_amb_c" REAL,
    "cover_amb_c" REAL,
    "humidity" REAL,
    "left_body_c" REAL,
    "right_body_c" REAL
);

-- CreateIndex
CREATE INDEX "sleep_sessions_side_started_at_idx" ON "sleep_sessions"("side", "started_at");

-- CreateIndex
CREATE INDEX "autopilot_decisions_session_id_timestamp_idx" ON "autopilot_decisions"("session_id", "timestamp");

-- CreateIndex
CREATE INDEX "ambient_timestamp_idx" ON "ambient"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "ambient_timestamp_key" ON "ambient"("timestamp");

