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

/**
 * Returns the total number of reports across all lessons. The admin
 * dashboard uses this to render the "Reported Lessons" stat card
 * without paying the cost of joining the full report list.
 */
const getReportsCount = async () => {
  const client = await getClient();
  const db = client.db(DB_NAME);
  const reports = db.collection(REPORTS_COLLECTION);
  const total = await reports.countDocuments({});
  return { total: Number(total ?? 0) };
};

/**
 * Returns every report joined with the lesson title and the
 * reporting user's display name so the admin table can render a
 * single round-trip.
 *
 * Notes on the join strategy:
 *  - `reports.lessonId` is stored as ObjectId, so the first `$lookup`
 *    matches directly against the `lessons` collection.
 *  - `reports.userId` is stored as a *string* (to mirror how the
 *    comments/services persist it), so we coerce it to ObjectId
 *    inside the pipeline with `$toObjectId` before the second
 *    `$lookup`. Malformed ids are filtered to null and dropped from
 *    the embedded `reporter` block rather than throwing, because
 *    the report itself is still valid.
 *
 * Sorted newest-first so the admin table shows the freshest reports
 * at the top.
 */
const getAllReports = async () => {
  const client = await getClient();
  const db = client.db(DB_NAME);
  const reports = db.collection(REPORTS_COLLECTION);

  const pipeline = [
    {
      $lookup: {
        from: "lessons",
        localField: "lessonId",
        foreignField: "_id",
        as: "lesson",
      },
    },
    { $unwind: { path: "$lesson", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        // The reporting user id is a string in this collection; convert
        // it to ObjectId for the lookup and skip silently if it isn't
        // a valid id.
        reporterObjectId: {
          $cond: [
            { $eq: [{ $type: "$userId" }, "string"] },
            {
              $cond: [
                { $eq: [{ $strLenCP: { $ifNull: ["$userId", ""] } }, 24] },
                { $toObjectId: "$userId" },
                null,
              ],
            },
            "$userId",
          ],
        },
      },
    },
    {
      $lookup: {
        from: "user",
        localField: "reporterObjectId",
        foreignField: "_id",
        as: "reporter",
      },
    },
    { $unwind: { path: "$reporter", preserveNullAndEmptyArrays: true } },
    { $sort: { submittedAt: -1 } },
    // Flatten the embedded `lesson` and `reporter` objects into top-level
    // fields, then drop the originals. We do this before `$project` so the
    // projection stage can stay inclusion-only (MongoDB rejects mixing
    // inclusion + exclusion in a single `$project`).
    {
      $addFields: {
        lessonTitle: { $ifNull: ["$lesson.title", null] },
        lessonImage: { $ifNull: ["$lesson.imageUrl", null] },
        lessonCategory: { $ifNull: ["$lesson.category", null] },
        lessonAccessLevel: { $ifNull: ["$lesson.accessLevel", null] },
        reporterName: { $ifNull: ["$reporter.name", null] },
        reporterEmail: { $ifNull: ["$reporter.email", null] },
        reporterImage: { $ifNull: ["$reporter.image", null] },
      },
    },
    { $unset: ["reporterObjectId", "lesson", "reporter"] },
    {
      $project: {
        _id: 1,
        reason: 1,
        submittedAt: 1,
        lessonId: 1,
        userId: 1,
        lessonTitle: 1,
        lessonImage: 1,
        lessonCategory: 1,
        lessonAccessLevel: 1,
        reporterName: 1,
        reporterEmail: 1,
        reporterImage: 1,
      },
    },
  ];

  const list = await reports.aggregate(pipeline).toArray();
  return { total: list.length, reports: list };
};

/**
 * Same shape as `getAllReports` but filtered to a single lesson. Used
 * by the admin modal that opens when an admin clicks "View reasons" on
 * a row of the grouped reported-lessons table.
 */
const getReportsForLesson = async ({ lessonId }) => {
  if (!ObjectId.isValid(lessonId)) {
    const error = new Error("Invalid lessonId");
    error.statusCode = 400;
    throw error;
  }

  const client = await getClient();
  const db = client.db(DB_NAME);
  const reports = db.collection(REPORTS_COLLECTION);
  const lessonObjectId = new ObjectId(lessonId);

  // Reuse the same join pipeline as `getAllReports` but anchor it on
  // the requested lesson. We inline the pipeline here so we can keep
  // the two endpoints independent and the queries readable.
  const pipeline = [
    { $match: { lessonId: lessonObjectId } },
    {
      $lookup: {
        from: "lessons",
        localField: "lessonId",
        foreignField: "_id",
        as: "lesson",
      },
    },
    { $unwind: { path: "$lesson", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        reporterObjectId: {
          $cond: [
            { $eq: [{ $type: "$userId" }, "string"] },
            {
              $cond: [
                { $eq: [{ $strLenCP: { $ifNull: ["$userId", ""] } }, 24] },
                { $toObjectId: "$userId" },
                null,
              ],
            },
            "$userId",
          ],
        },
      },
    },
    {
      $lookup: {
        from: "user",
        localField: "reporterObjectId",
        foreignField: "_id",
        as: "reporter",
      },
    },
    { $unwind: { path: "$reporter", preserveNullAndEmptyArrays: true } },
    { $sort: { submittedAt: -1 } },
    {
      $addFields: {
        lessonTitle: { $ifNull: ["$lesson.title", null] },
        lessonImage: { $ifNull: ["$lesson.imageUrl", null] },
        lessonCategory: { $ifNull: ["$lesson.category", null] },
        lessonAccessLevel: { $ifNull: ["$lesson.accessLevel", null] },
        reporterName: { $ifNull: ["$reporter.name", null] },
        reporterEmail: { $ifNull: ["$reporter.email", null] },
        reporterImage: { $ifNull: ["$reporter.image", null] },
      },
    },
    { $unset: ["reporterObjectId", "lesson", "reporter"] },
    {
      $project: {
        _id: 1,
        reason: 1,
        submittedAt: 1,
        lessonId: 1,
        userId: 1,
        lessonTitle: 1,
        lessonImage: 1,
        lessonCategory: 1,
        lessonAccessLevel: 1,
        reporterName: 1,
        reporterEmail: 1,
        reporterImage: 1,
      },
    },
  ];

  const list = await reports.aggregate(pipeline).toArray();
  return { total: list.length, reports: list };
};

/**
 * Returns one row per lesson that has at least one report, with the
 * report count and a snapshot of the most recent reasons/reports.
 *
 * The grouped payload is what the admin table renders. The detailed
 * "View reasons" modal then calls `getReportsForLesson` to fetch the
 * full list on demand so the table query stays cheap.
 *
 * Output shape (per row):
 *   {
 *     lessonId:        string,
 *     lessonTitle:     string | null,
 *     lessonImage:     string | null,
 *     lessonCategory:  string | null,
 *     lessonAccessLevel: string | null,
 *     reportCount:     number,
 *     lastSubmittedAt: Date | null,
 *     recentReasons:   string[]  // unique reasons from the latest 5 reports
 *   }
 */
const getReportedLessonsGrouped = async () => {
  const client = await getClient();
  const db = client.db(DB_NAME);
  const reports = db.collection(REPORTS_COLLECTION);

  const pipeline = [
    { $sort: { submittedAt: -1 } },
    {
      $group: {
        _id: "$lessonId",
        reportCount: { $sum: 1 },
        lastSubmittedAt: { $max: "$submittedAt" },
        // Keep the latest 5 reports so we can derive a unique reason
        // list and embed lightweight reporter info on the row.
        recent: {
          $push: {
            _id: "$_id",
            reason: "$reason",
            submittedAt: "$submittedAt",
            userId: "$userId",
          },
        },
      },
    },
    {
      $addFields: {
        // Trim to the first 5 after sorting by submittedAt desc.
        recent: { $slice: ["$recent", 5] },
      },
    },
    {
      $lookup: {
        from: "lessons",
        localField: "_id",
        foreignField: "_id",
        as: "lesson",
      },
    },
    { $unwind: { path: "$lesson", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        lessonId: "$_id",
        lessonTitle: { $ifNull: ["$lesson.title", null] },
        lessonImage: { $ifNull: ["$lesson.imageUrl", null] },
        lessonCategory: { $ifNull: ["$lesson.category", null] },
        lessonAccessLevel: { $ifNull: ["$lesson.accessLevel", null] },
        // Dedupe reasons for the quick-scan chip.
        recentReasons: {
          $setUnion: ["$recent.reason", []],
        },
      },
    },
    { $unset: ["lesson", "recent"] },
    { $sort: { reportCount: -1, lastSubmittedAt: -1 } },
    {
      $project: {
        _id: 0,
        lessonId: 1,
        lessonTitle: 1,
        lessonImage: 1,
        lessonCategory: 1,
        lessonAccessLevel: 1,
        reportCount: 1,
        lastSubmittedAt: 1,
        recentReasons: 1,
      },
    },
  ];

  const list = await reports.aggregate(pipeline).toArray();
  return { total: list.length, lessons: list };
};

/**
 * Removes every report pointing at the given lesson. Returns the number
 * of reports deleted so the admin UI can show a confirmation toast.
 *
 * The lesson itself is NOT modified — that's the "Ignore" action: the
 * reports are dropped and the lesson stays live.
 */
const ignoreLessonReportsService = async ({ lessonId }) => {
  if (!ObjectId.isValid(lessonId)) {
    const error = new Error("Invalid lessonId");
    error.statusCode = 400;
    throw error;
  }

  const client = await getClient();
  const db = client.db(DB_NAME);
  const reports = db.collection(REPORTS_COLLECTION);
  const lessonObjectId = new ObjectId(lessonId);

  const result = await reports.deleteMany({ lessonId: lessonObjectId });
  return {
    lessonId,
    deletedCount: Number(result?.deletedCount ?? 0),
  };
};

module.exports = {
  createReport,
  getAllReports,
  getReportsCount,
  getReportsForLesson,
  getReportedLessonsGrouped,
  ignoreLessonReportsService,
  VALID_REASONS,
};
