const { ObjectId } = require("mongodb");
const { getClient } = require("../db/db");

const DB_NAME = "life-echo-db";

/**
 * Creates a status-aware Error so the controller can map it to the
 * correct HTTP status without re-inspecting the message.
 */
const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

/**
 * Validates the userId passed to dashboard endpoints. Accepts both raw
 * strings (the way `comments.userId` / `reports.userId` are stored)
 * and ObjectId-shaped hex strings.
 */
const ensureValidUserId = (userId) => {
  if (!userId || typeof userId !== "string") {
    throw httpError(400, "userId is required");
  }
  const trimmed = userId.trim();
  if (!trimmed) throw httpError(400, "userId is required");
  if (!ObjectId.isValid(trimmed)) {
    throw httpError(400, `Invalid userId: ${userId}`);
  }
  return trimmed;
};

/**
 * Aggregates the data for the three top-of-dashboard stat cards:
 *   - TOTAL LESSONS:    how many lessons this user has authored.
 *   - TOTAL SAVED:      how many lessons this user has bookmarked
 *                       (i.e. documents in `lessons` whose `savedBy`
 *                       array contains this user's id).
 *   - RECENTLY ADDED:   how many lessons this user authored in the
 *                       last `windowDays` days (default 30).
 *
 * All counts are scoped "by the user" — they reflect this user's own
 * actions/artefacts, not totals across content the user happens to
 * have authored.
 */
const getDashboardStats = async (
  userId,
  { windowDays = 30, now = new Date() } = {},
) => {
  const uid = ensureValidUserId(userId);
  const client = await getClient();
  const db = client.db(DB_NAME);
  const lessons = db.collection("lessons");

  // Two independent counts can be combined into a single $facet so
  // the database only round-trips once. Using $facet also keeps the
  // counts consistent (no skew between the two queries if a write
  // lands in between).
  const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const [facetResult] = await lessons
    .aggregate([
      {
        $facet: {
          // Lessons authored by this user. `userId` is stored as a
          // string on the lesson doc, so match by string equality
          // for both the recent-window and the lifetime counts.
          authored: [
            {
              $match: {
                $expr: { $eq: [{ $toString: "$userId" }, uid] },
              },
            },
            {
              $project: {
                createdAt: 1,
                recentFlag: {
                  $cond: [{ $gte: ["$createdAt", cutoff] }, 1, 0],
                },
              },
            },
          ],
          // Lessons this user has bookmarked. `savedBy` is an array
          // of user id strings (see lesson.service.js toggleSaveLesson).
          saved: [
            {
              $match: {
                savedBy: { $exists: true, $ne: [] },
              },
            },
            {
              $match: {
                $expr: {
                  $in: [
                    uid,
                    {
                      $map: {
                        input: { $ifNull: ["$savedBy", []] },
                        as: "u",
                        in: { $toString: "$$u" },
                      },
                    },
                  ],
                },
              },
            },
            { $count: "n" },
          ],
        },
      },
      {
        $project: {
          totalLessons: { $size: "$authored" },
          recentlyAdded: {
            $reduce: {
              input: "$authored",
              initialValue: 0,
              in: { $add: ["$$value", "$$this.recentFlag"] },
            },
          },
          lastAddedAt: {
            $max: "$authored.createdAt",
          },
          totalSaves: {
            $ifNull: [{ $first: "$saved.n" }, 0],
          },
        },
      },
    ])
    .toArray();

  const stats = facetResult || {};

  const totalLessons = Number(stats.totalLessons ?? 0);
  const totalSaves = Number(stats.totalSaves ?? 0);
  const recentlyAdded = Number(stats.recentlyAdded ?? 0);
  const lastAddedAt = stats.lastAddedAt ?? null;
  const hasRecentActivity = recentlyAdded > 0;

  return {
    totalLessons,
    totalSaves,
    recentlyAdded,
    lastAddedAt,
    hasRecentActivity,
    recentActivityWindowDays: windowDays,
  };
};

/**
 * Aggregates the five totals that drive the activity chart:
 *   - saves:      count of lessons this user has bookmarked.
 *   - comments:   count of comments this user has posted.
 *   - likes:      count of lessons this user has liked.
 *   - reports:    count of reports this user has filed.
 *   - lessonsPosted: count of lessons this user has authored.
 *
 * All five queries run in parallel; if any fail, the whole request
 * fails (we'd rather show an error than a partial chart).
 *
 * `days` is accepted for forward compatibility — when the chart
 * graduates from "all-time totals" to a rolling weekly series, this
 * is where the `submittedAt` / `createdAt` filtering will land.
 */
const getDashboardActivity = async (
  userId,
  { days = null, now = new Date() } = {},
) => {
  const uid = ensureValidUserId(userId);
  const client = await getClient();
  const db = client.db(DB_NAME);
  const lessons = db.collection("lessons");

  const dateFilter = (field) => {
    if (!days) return {};
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return { [field]: { $gte: cutoff } };
  };

  // The `userId` is stored as a plain string on both comments and
  // reports, but lessons persist it as a string too. We match by
  // string equality for the per-collection counts.
  const [lessonsPosted, savesCount, likesCount, commentsCount, reportsCount] =
    await Promise.all([
      lessons.countDocuments({
        $expr: { $eq: [{ $toString: "$userId" }, uid] },
        ...dateFilter("createdAt"),
      }),
      // Count lessons this user has bookmarked. The `savedBy` array
      // contains the user's id (string form) when they've saved it.
      lessons.countDocuments({
        savedBy: { $exists: true, $ne: [] },
        $expr: {
          $in: [
            uid,
            {
              $map: {
                input: { $ifNull: ["$savedBy", []] },
                as: "u",
                in: { $toString: "$$u" },
              },
            },
          ],
        },
      }),
      // Count lessons this user has liked. Same array-membership
      // trick as saves; both arrays are kept in sync via $addToSet.
      lessons.countDocuments({
        likedBy: { $exists: true, $ne: [] },
        $expr: {
          $in: [
            uid,
            {
              $map: {
                input: { $ifNull: ["$likedBy", []] },
                as: "u",
                in: { $toString: "$$u" },
              },
            },
          ],
        },
      }),
      db.collection("comments").countDocuments({
        userId: uid,
        ...dateFilter("createdAt"),
      }),
      db.collection("reports").countDocuments({
        userId: uid,
        ...dateFilter("submittedAt"),
      }),
    ]);

  return {
    range: {
      days: days ?? null,
      from: days ? new Date(now.getTime() - days * 24 * 60 * 60 * 1000) : null,
      to: now,
    },
    totals: {
      saves: Number(savesCount ?? 0),
      comments: Number(commentsCount ?? 0),
      likes: Number(likesCount ?? 0),
      reports: Number(reportsCount ?? 0),
      lessonsPosted: Number(lessonsPosted ?? 0),
    },
  };
};

module.exports = {
  getDashboardStats,
  getDashboardActivity,
};
