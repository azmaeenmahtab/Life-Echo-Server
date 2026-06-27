const { ObjectId } = require("mongodb");
const { getClient } = require("../db/db");

const DB_NAME = "life-echo-db";
const REPORTS_COLLECTION = "reports";

/**
 * Canonical list of report reasons. Keep this aligned with the frontend
 * dropdown in `frontend/src/components/Modals/reportModal.jsx` so the
 * modal's keys match the allowlist the service validates against.
 */
const VALID_REASONS = [
  "spam",
  "harassment",
  "hate-speech",
  "violence",
  "misinformation",
  "inappropriate",
  "self-harm",
  "other",
];

/**
 * Inserts a report for a lesson. Stores `userId` as a string to match
 * how comments/services persist it, and uses ObjectId for the lesson
 * reference so we can index/lookup cheaply.
 *
 * Returns `{ alreadyReported: true, report }` (HTTP 200) when the same
 * user has already filed a report for the same lesson so the frontend
 * can show a friendly message instead of a generic error.
 */
const createReport = async ({ lessonId, userId, reason }) => {
  if (!ObjectId.isValid(lessonId)) {
    const error = new Error("Invalid lessonId");
    error.statusCode = 400;
    throw error;
  }

  const trimmedReason = String(reason || "").trim();
  if (!VALID_REASONS.includes(trimmedReason)) {
    // Log the offending value so a frontend/backend mismatch is easy
    // to spot without exposing it back to the client.
    console.warn(
      `[createReport] Rejected reason: ${JSON.stringify(trimmedReason)}`,
    );
    const error = new Error("Invalid reason");
    error.statusCode = 400;
    throw error;
  }

  const client = await getClient();
  const db = client.db(DB_NAME);
const reports = db.collection(REPORTS_COLLECTION);

  const lessonObjectId = new ObjectId(lessonId);
  const now = new Date();

  // Make sure the lesson actually exists before writing.
  const lesson = await db
    .collection("lessons")
    .findOne({ _id: lessonObjectId }, { projection: { _id: 1 } });
  if (!lesson) {
    const error = new Error("Lesson not found");
    error.statusCode = 404;
    throw error;
  }

  // Duplicate guard: if this user has already reported this lesson we
  // hand the existing report back so the UI can show "already reported"
  // without a second insert or a hard 4xx error.
  const existing = await reports.findOne(
    { lessonId: lessonObjectId, userId },
    { projection: { _id: 1, reason: 1, submittedAt: 1 } },
  );
  if (existing) {
    return {
      alreadyReported: true,
      report: {
        _id: existing._id,
        lessonId: lessonObjectId,
        userId,
        reason: existing.reason,
        submittedAt: existing.submittedAt,
      },
    };
  }

  const document = {
    lessonId: lessonObjectId,
    userId,
    reason: trimmedReason,
    submittedAt: now,
  };

  const result = await reports.insertOne(document);
  return { alreadyReported: false, report: { _id: result.insertedId, ...document } };
};

module.exports = { createReport, VALID_REASONS };
