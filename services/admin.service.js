const { getClient } = require("../db/db");

const DB_NAME = "life-echo-db";

/**
 * Returns the contributors with the most lessons created within the
 * last `days` (defaults to 7, the "Top Contributors of the Week"
 * section on the home page).
 *
 * Each row matches the lifetime `getTopContributors` shape, plus the
 * `lessonsCount` is the count *inside the window* rather than the
 * lifetime total. Output:
 *   {
 *     userId:       string,
 *     name:         string | null,
 *     email:        string | null,
 *     image:        string | null,
 *     role:         "user" | "admin" (defaulted to "user"),
 *     title:        string | null,   // user-supplied role/title
 *     lessonsCount: number,          // lessons created in the window
 *   }
 *
 * The 24-char ObjectId heuristic from `getTopContributors` is reused
 * so invalid ids are silently dropped (the user account may have
 * been deleted). Anonymous lessons are dropped by the leading $match.
 *
 * @param {number} days   Rolling window in days. Clamped to [1, 365].
 * @param {number} limit  How many rows to return. Clamped to [1, 50].
 */
const getTopWeeklyContributors = async ({ days = 7, limit = 3 } = {}) => {
  const safeDays = Math.max(1, Math.min(365, Number.parseInt(days, 10) || 7));
  const safeLimit = Math.max(1, Math.min(50, Number.parseInt(limit, 10) || 3));

  const client = await getClient();
  const db = client.db(DB_NAME);
  const lessons = db.collection("lessons");

  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

  const pipeline = [
    {
      $match: {
        userId: { $type: "string", $ne: "" },
        createdAt: { $gte: since },
      },
    },
    {
      $group: {
        _id: "$userId",
        lessonsCount: { $sum: 1 },
      },
    },
    {
      $addFields: {
        authorObjectId: {
          $cond: [
            { $eq: [{ $strLenCP: { $ifNull: ["$_id", ""] } }, 24] },
            { $toObjectId: "$_id" },
            null,
          ],
        },
      },
    },
    {
      $lookup: {
        from: "user",
        localField: "authorObjectId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    { $sort: { lessonsCount: -1, "user.createdAt": -1 } },
    { $limit: safeLimit },
    {
      $addFields: {
        userId: "$_id",
        name: { $ifNull: ["$user.name", null] },
        email: { $ifNull: ["$user.email", null] },
        image: { $ifNull: ["$user.image", null] },
        role: { $ifNull: ["$user.role", "user"] },
        title: { $ifNull: ["$user.title", null] },
      },
    },
    { $unset: ["_id", "user", "authorObjectId"] },
  ];

  const rows = await lessons.aggregate(pipeline).toArray();

  return rows.map((row) => ({
    userId: row.userId ? row.userId.toString() : null,
    name: row.name ?? null,
    email: row.email ?? null,
    image: row.image ?? null,
    role: row.role ?? "user",
    title: row.title ?? null,
    lessonsCount: Number(row.lessonsCount ?? 0),
  }));
};

/**
 * Returns the lessons with the highest `savesCount` across the entire
 * catalogue. Powers the home "Community Favorites" section.
 *
 * Each row includes the lesson core fields plus the creator's name
 * and avatar (joined from the `user` collection in the same
 * pipeline, mirroring `getPublicLessons`):
 *   {
 *     lessonId:     string,
 *     title:        string,
 *     imageUrl:     string | null,
 *     savesCount:   number,
 *     likesCount:   number,
 *     category:     string | null,
 *     creatorName:  string | null,
 *     creatorImage: string | null,
 *   }
 *
 * Lessons with zero saves are still included if the catalogue is
 * small so the section can render three cards on a brand-new
 * platform. The sort tie-breaks on `createdAt` desc to stay
 * deterministic.
 *
 * @param {number} limit  How many rows to return. Clamped to [1, 50].
 */
const getMostSavedLessons = async ({ limit = 3 } = {}) => {
  const safeLimit = Math.max(1, Math.min(50, Number.parseInt(limit, 10) || 3));

  const client = await getClient();
  const db = client.db(DB_NAME);
  const lessons = db.collection("lessons");

  const docs = await lessons
    .aggregate([
      {
        $addFields: {
          userObjectId: {
            $cond: [
              { $eq: [{ $type: "$userId" }, "string"] },
              { $toObjectId: "$userId" },
              "$userId",
            ],
          },
        },
      },
      {
        $lookup: {
          from: "user",
          localField: "userObjectId",
          foreignField: "_id",
          as: "creator",
        },
      },
      {
        $unwind: { path: "$creator", preserveNullAndEmptyArrays: true },
      },
      {
        $addFields: {
          savesNum: {
            $convert: {
              input: { $ifNull: ["$savesCount", 0] },
              to: "double",
              onError: 0,
              onNull: 0,
            },
          },
        },
      },
      { $sort: { savesNum: -1, createdAt: -1 } },
      { $limit: safeLimit },
      {
        $addFields: {
          creatorName: { $ifNull: ["$creator.name", null] },
          creatorImage: { $ifNull: ["$creator.image", null] },
        },
      },
      { $unset: ["creator", "userObjectId", "savesNum"] },
      {
        $project: {
          lessonId: { $toString: "$_id" },
          title: 1,
          imageUrl: 1,
          savesCount: 1,
          likesCount: 1,
          category: 1,
          creatorName: 1,
          creatorImage: 1,
        },
      },
    ])
    .toArray();

  return docs.map((row) => ({
    lessonId: row.lessonId,
    title: row.title ?? "(untitled)",
    imageUrl: row.imageUrl ?? null,
    savesCount: Number(row.savesCount ?? 0),
    likesCount: Number(row.likesCount ?? 0),
    category: row.category ?? null,
    creatorName: row.creatorName ?? null,
    creatorImage: row.creatorImage ?? null,
  }));
};

/**
 * Returns the top contributors ranked by number of lessons authored.
 *
 * Each row includes:
 *   - userId:       string (matches `lessons.userId` storage format)
 *   - name:         string | null
 *   - email:        string | null
 *   - image:        string | null
 *   - role:         string | null  ("admin" | "user")
 *   - lessonsCount: number         (lifetime authored lessons)
 *
 * Implementation notes:
 *  - `lessons.userId` is stored as a *string* on this collection, so the
 *    `$group` key is the string form. We also forward the same string
 *    into the `$lookup` against `user._id` via `$toObjectId` so the
 *    join works regardless of how it was persisted.
 *  - Users with zero lessons are excluded by definition (they never
 *    appear in the lessons collection, so they can't enter the group).
 *  - Anonymous lessons (no `userId` or malformed) are dropped by the
 *    `$match` stage that runs before the group so they can't pollute
 *    the ranking.
 *
 * @param {number} limit - How many contributors to return. Defaults
 *   to 5 so the dashboard card stays a comfortable scroll-free list.
 *   Clamped to [1, 50] defensively.
 */
const getTopContributors = async ({ limit = 5 } = {}) => {
  const safeLimit = Math.max(1, Math.min(50, Number.parseInt(limit, 10) || 5));

  const client = await getClient();
  const db = client.db(DB_NAME);
  const lessons = db.collection("lessons");

  const pipeline = [
    // Drop lessons with no / invalid author so anonymous rows can't
    // skew the ranking.
    {
      $match: {
        userId: { $type: "string", $ne: "" },
      },
    },
    // Group by the string userId so we can count authored lessons.
    {
      $group: {
        _id: "$userId",
        lessonsCount: { $sum: 1 },
      },
    },
    // Convert the string key to ObjectId for the lookup. Invalid ids
    // resolve to null and are silently skipped by the preserve-null
    // unwind below (the user account may have been deleted).
    {
      $addFields: {
        authorObjectId: {
          $cond: [
            { $eq: [{ $strLenCP: { $ifNull: ["$_id", ""] } }, 24] },
            { $toObjectId: "$_id" },
            null,
          ],
        },
      },
    },
    {
      $lookup: {
        from: "user",
        localField: "authorObjectId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    // Highest lesson count first; tie-break on most-recent signup so
    // the card stays deterministic across renders.
    { $sort: { lessonsCount: -1, "user.createdAt": -1 } },
    { $limit: safeLimit },
    {
      $addFields: {
        userId: "$_id",
        name: { $ifNull: ["$user.name", null] },
        email: { $ifNull: ["$user.email", null] },
        image: { $ifNull: ["$user.image", null] },
        role: { $ifNull: ["$user.role", "user"] },
      },
    },
    { $unset: ["_id", "user", "authorObjectId"] },
    {
      $project: {
        userId: 1,
        name: 1,
        email: 1,
        image: 1,
        role: 1,
        lessonsCount: 1,
      },
    },
  ];

  const list = await lessons.aggregate(pipeline).toArray();

  // Normalise numeric output so the frontend never receives a BSON
  // Long that JSON-stringifies as `{ "low": ..., "high": ... }`.
  return list.map((row) => ({
    userId: row.userId ? row.userId.toString() : null,
    name: row.name ?? null,
    email: row.email ?? null,
    image: row.image ?? null,
    role: row.role ?? "user",
    lessonsCount: Number(row.lessonsCount ?? 0),
  }));
};

/**
 * Returns lessons authored in the last 24 hours plus a total count.
 *
 * "Today" is treated as a rolling 24-hour window ending at request
 * time rather than a calendar date — this stays robust for admins
 * who check the dashboard at unusual hours and matches the spec
 * ("past 24 hours or just fetch the lessons from the previous date").
 *
 * Each row includes:
 *   - lessonId:       string (24-char ObjectId)
 *   - title:          string
 *   - category:       string (slug, one of ALLOWED_CATEGORIES)
 *   - emotionalTone:  string (one of ALLOWED_TONES)
 *   - accessLevel:    "free" | "premium"
 *   - reviewStatus:   "pending" | "reviewed" | "rejected"
 *   - imageUrl:       string | null
 *   - createdAt:      ISO string  (serialised for the frontend)
 *   - creatorName:    string | null
 *   - creatorImage:   string | null
 *
 * Returns `{ total, lessons }`:
 *   - `total` is the count of lessons created in the last 24h (across
 *     all review statuses, including "pending" — admins want to see
 *     everything that just landed).
 *   - `lessons` is the most recent `limit` lessons (default 5,
 *     clamped to [1, 50]) sorted by `createdAt` descending.
 *
 * @param {number} limit - How many recent lessons to return. Clamped.
 */
const getTodaysLessons = async ({ limit = 5 } = {}) => {
  const safeLimit = Math.max(1, Math.min(50, Number.parseInt(limit, 10) || 5));

  const client = await getClient();
  const db = client.db(DB_NAME);
  const lessons = db.collection("lessons");

  // Rolling 24-hour window. Using $gte rather than a calendar date so
  // the count stays correct regardless of timezone / admin check time.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const total = await lessons.countDocuments({ createdAt: { $gte: since } });

  const docs = await lessons
    .aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $addFields: {
          userObjectId: {
            $cond: [
              { $eq: [{ $type: "$userId" }, "string"] },
              { $toObjectId: "$userId" },
              "$userId",
            ],
          },
        },
      },
      {
        $lookup: {
          from: "user",
          localField: "userObjectId",
          foreignField: "_id",
          as: "creator",
        },
      },
      {
        $unwind: { path: "$creator", preserveNullAndEmptyArrays: true },
      },
      { $sort: { createdAt: -1 } },
      { $limit: safeLimit },
      {
        $addFields: {
          creatorName: { $ifNull: ["$creator.name", null] },
          creatorImage: { $ifNull: ["$creator.image", null] },
        },
      },
      { $unset: ["creator", "userObjectId"] },
      {
        $project: {
          lessonId: { $toString: "$_id" },
          title: 1,
          category: 1,
          emotionalTone: 1,
          accessLevel: 1,
          reviewStatus: 1,
          imageUrl: 1,
          createdAt: 1,
          creatorName: 1,
          creatorImage: 1,
        },
      },
    ])
    .toArray();

  // Stringify ObjectId/dates so JSON.stringify doesn't drop them as
  // BSON markers on the wire.
  const lessonsList = docs.map((row) => ({
    lessonId: row.lessonId,
    title: row.title ?? "(untitled)",
    category: row.category ?? null,
    emotionalTone: row.emotionalTone ?? null,
    accessLevel: row.accessLevel ?? "free",
    reviewStatus: row.reviewStatus ?? "pending",
    imageUrl: row.imageUrl ?? null,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : row.createdAt
          ? new Date(row.createdAt).toISOString()
          : null,
    creatorName: row.creatorName ?? null,
    creatorImage: row.creatorImage ?? null,
  }));

  return { total: Number(total) || 0, lessons: lessonsList };
};

/**
 * Returns the cumulative lesson count over time.
 *
 * "Growth" here means: how many lessons existed by the end of each
 * day, rolling forward. The series always starts at 0 on `days` ago
 * and ends at the current total. Even days with no new lessons are
 * filled in so the line never has gaps.
 *
 * Args:
 *   - days  number, defaults to 30. Clamped to [1, 365].
 *
 * Returns an array of `{ date, count, cumulative }` rows, sorted by
 * date ascending. Each `date` is an ISO string at day-start UTC.
 *
 * Implementation notes:
 *   - Uses `$dateTrunc` so the bucket boundaries are timezone-neutral
 *     (UTC days). This avoids the bucket-boundary drift you'd see if
 *     we used `$dayOfMonth` group keys.
 *   - We compute the cumulative total in JS rather than via a window
 *     function so the SQL stays compatible with the existing Mongo
 *     driver setup used by the rest of the codebase.
 */
const getLessonGrowth = async ({ days = 30 } = {}) => {
  const safeDays = Math.max(1, Math.min(365, Number.parseInt(days, 10) || 30));

  const client = await getClient();
  const db = client.db(DB_NAME);
  const lessons = db.collection("lessons");

  const endOfWindow = new Date();
  endOfWindow.setUTCHours(0, 0, 0, 0);
  // Inclusive end -> include today as a bucket too.
  endOfWindow.setUTCDate(endOfWindow.getUTCDate() + 1);

  const startOfWindow = new Date(endOfWindow);
  startOfWindow.setUTCDate(startOfWindow.getUTCDate() - safeDays);

  const rows = await lessons
    .aggregate([
      { $match: { createdAt: { $gte: startOfWindow } } },
      {
        $group: {
          _id: {
            $dateTrunc: { date: "$createdAt", unit: "day" },
          },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, date: "$_id", count: 1 } },
      { $sort: { date: 1 } },
    ])
    .toArray();

  // Fill in the full window so the line has no missing days, then
  // accumulate the running total so the chart shows growth, not
  // daily increments.
  const series = [];
  let running = 0;
  for (let cursor = new Date(startOfWindow); cursor < endOfWindow; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const dayKey = cursor.toISOString();
    const match = rows.find((r) => {
      const rDate = r.date instanceof Date ? r.date.toISOString() : new Date(r.date).toISOString();
      return rDate === dayKey;
    });
    const count = Number(match?.count ?? 0);
    running += count;
    series.push({
      date: dayKey,
      count,
      cumulative: running,
    });
  }

  return {
    total: running,
    windowDays: safeDays,
    series,
  };
};

/**
 * Returns the cumulative user signup count over time.
 *
 * Mirrors `getLessonGrowth` but reads from the `user` collection and
 * uses `createdAt` (the signup timestamp) for the time axis. The
 * output shape is identical so the same `GrowthLineChart` component
 * can render both.
 *
 * Args:
 *   - days  number, defaults to 30. Clamped to [1, 365].
 *
 * Returns `{ total, windowDays, series }` where each series row is
 *   `{ date, count, cumulative }`. `date` is an ISO string at day
 * start UTC. `cumulative` is the running signup total from the start
 * of the window to that day.
 *
 * Implementation notes:
 *  - We `$match` on `createdAt` to keep the index hot.
 *  - We use the same `$dateTrunc` (unit: "day", UTC) pattern as
 *    `getLessonGrowth` so both charts share a time axis and can be
 *    compared side-by-side.
 *  - We don't exclude admin users or staff accounts — "user growth"
 *    here means every account on the platform.
 *  - The cumulative total is computed in JS for compatibility with
 *    the rest of the Mongo driver usage in this codebase.
 */
const getUserGrowth = async ({ days = 30 } = {}) => {
  const safeDays = Math.max(1, Math.min(365, Number.parseInt(days, 10) || 30));

  const client = await getClient();
  const db = client.db(DB_NAME);
  const users = db.collection("user");

  const endOfWindow = new Date();
  endOfWindow.setUTCHours(0, 0, 0, 0);
  // Inclusive end -> include today as a bucket too.
  endOfWindow.setUTCDate(endOfWindow.getUTCDate() + 1);

  const startOfWindow = new Date(endOfWindow);
  startOfWindow.setUTCDate(startOfWindow.getUTCDate() - safeDays);

  // Lifetime total = current cumulative value, independent of the
  // window. Used as the big headline number on the card so it doesn't
  // shift dramatically as the window slides.
  const total = await users.countDocuments({});

  const rows = await users
    .aggregate([
      { $match: { createdAt: { $gte: startOfWindow } } },
      {
        $group: {
          _id: {
            $dateTrunc: { date: "$createdAt", unit: "day" },
          },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, date: "$_id", count: 1 } },
      { $sort: { date: 1 } },
    ])
    .toArray();

  // Pre-window baseline: how many accounts existed *before* the
  // window opened? We add it to the running total on the first day so
  // the chart line lands on the real lifetime total, not a number
  // truncated to the last 30 days.
  const preWindowTotal = await users.countDocuments({
    createdAt: { $lt: startOfWindow },
  });

  // Fill in the full window so the line has no missing days, then
  // accumulate the running total so the chart shows growth, not
  // daily increments.
  const series = [];
  let running = preWindowTotal;
  for (
    let cursor = new Date(startOfWindow);
    cursor < endOfWindow;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const dayKey = cursor.toISOString();
    const match = rows.find((r) => {
      const rDate =
        r.date instanceof Date
          ? r.date.toISOString()
          : new Date(r.date).toISOString();
      return rDate === dayKey;
    });
    const count = Number(match?.count ?? 0);
    running += count;
    series.push({
      date: dayKey,
      count,
      cumulative: running,
    });
  }

  return {
    total: Number(total) || 0,
    windowDays: safeDays,
    series,
  };
};

module.exports = {
  getTopContributors,
  getTodaysLessons,
  getLessonGrowth,
  getUserGrowth,
  getTopWeeklyContributors,
  getMostSavedLessons,
};
