const { ObjectId } = require("mongodb");
const { client } = require("../db/db");

const DB_NAME = "life-echo-db";
const LESSONS_COLLECTION = "lessons";
const USERS_COLLECTION = "user";

const ALLOWED_CATEGORIES = new Set([
  "personal-growth",
  "career",
  "relationships",
  "mindset",
  "mistakes-learned",
]);

const ALLOWED_TONES = new Set([
  "motivational",
  "sad",
  "realization",
  "gratitude",
]);

const ALLOWED_ACCESS_LEVELS = new Set(["free", "premium"]);

const escapeRegex = (str = "") =>
  str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Creates an error with an attached HTTP status code so the controller
 * can forward it without re-inspecting the message.
 */
const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

/**
 * Validates and normalises the incoming payload from the controller.
 * Throws an httpError(400) with a descriptive message on any issue.
 */
const validateLessonPayload = (payload = {}) => {
  const title = (payload.title ?? "").toString().trim();
  const story = (payload.story ?? "").toString().trim();
  const category = (payload.category ?? "").toString().trim();
  const emotionalTone = (payload.emotionalTone ?? "").toString().trim();
  const accessLevel = (payload.accessLevel ?? "free").toString().trim();
  const imageUrl = payload.imageUrl ? payload.imageUrl.toString().trim() : null;
  const userId = payload.userId ? payload.userId.toString().trim() : null;

  if (!title) throw httpError(400, "Lesson title is required");
  if (title.length > 200)
    throw httpError(400, "Lesson title must be 200 characters or fewer");
  if (!story) throw httpError(400, "Story content is required");
  if (!category || !ALLOWED_CATEGORIES.has(category)) {
    throw httpError(400, "A valid category is required");
  }
  if (!emotionalTone || !ALLOWED_TONES.has(emotionalTone)) {
    throw httpError(400, "A valid emotional tone is required");
  }
  if (!ALLOWED_ACCESS_LEVELS.has(accessLevel)) {
    throw httpError(400, 'Access level must be either "free" or "premium"');
  }
  if (!userId) throw httpError(400, "A userId is required to author a lesson");

  return {
    title,
    story,
    category,
    emotionalTone,
    accessLevel,
    imageUrl: imageUrl || null,
    userId,
  };
};

/**
 * Persists a new lesson authored by the given user. Returns the inserted
 * document (including its generated `_id`) on success.
 */
const createLesson = async (rawPayload) => {
  const lesson = validateLessonPayload(rawPayload);
  const lessons = client.db(DB_NAME).collection(LESSONS_COLLECTION);

  const now = new Date();
  const document = {
    ...lesson,
    createdAt: now,
    updatedAt: now,
  };

  const result = await lessons.insertOne(document);
  return { _id: result.insertedId, ...document };
};

/**
 * Normalises and validates the public-list query params.
 * Returns a Mongo `filter` object and a `sort` spec, or throws httpError(400).
 */
const buildPublicLessonQuery = (query = {}) => {
  const filter = {};

  // Category: single value, must be one of the allowed slugs.
  if (query.category != null && query.category !== "") {
    const category = query.category.toString().trim();
    if (!ALLOWED_CATEGORIES.has(category)) {
      throw httpError(400, `Invalid category: ${category}`);
    }
    filter.category = category;
  }

  // Tone: single value, must be one of the allowed tones.
  if (query.tone != null && query.tone !== "") {
    const tone = query.tone.toString().trim();
    if (!ALLOWED_TONES.has(tone)) {
      throw httpError(400, `Invalid emotional tone: ${tone}`);
    }
    filter.emotionalTone = tone;
  }

  // Keyword: case-insensitive partial match across title + story.
  if (query.keywords != null && query.keywords !== "") {
    const keywords = query.keywords.toString().trim();
    if (keywords.length > 0) {
      // Escape regex metacharacters so user input is treated literally.
      const escaped = keywords.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      filter.$or = [{ title: regex }, { story: regex }];
    }
  }

  // Only surface public, free lessons on the public route.

  // filter.accessLevel = "free";

  // Sort: "mostsaved" (descending saves count) or "newest" (default).
  let sort = { createdAt: -1 };
  const sortby = (query.sortby ?? "newest").toString().trim().toLowerCase();
  if (sortby === "mostsaved") {
    sort = { savesCount: -1, createdAt: -1 };
  } else if (sortby !== "newest") {
    throw httpError(400, `Invalid sortby: ${sortby}`);
  }

  return { filter, sort };
};

/**
 * Fetches public lessons, applying the optional category / tone / keyword
 * filters and the chosen sort. Joins the author document from the `user`
 * collection so each lesson ships with the creator's name and profile pic.
 * Returns an array (empty on no matches).
 */
const getPublicLessons = async (query = {}) => {
  const { filter, sort } = buildPublicLessonQuery(query);
  const lessons = client.db(DB_NAME).collection(LESSONS_COLLECTION);

  // Convert string `userId`s on lessons into ObjectIds for the join.
  // Only valid ObjectIds are forwarded; orphans are skipped silently.
  const pipeline = [
    { $match: filter },
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
        from: USERS_COLLECTION,
        localField: "userObjectId",
        foreignField: "_id",
        as: "creator",
      },
    },
    {
      $unwind: {
        path: "$creator",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $addFields: {
        creatorId: { $ifNull: ["$creator._id", null] },
        creatorName: { $ifNull: ["$creator.name", null] },
        creatorProfilePic: { $ifNull: ["$creator.image", null] },
      },
    },
    { $project: { creator: 0, userObjectId: 0 } },
    { $sort: sort },
  ];

  const docs = await lessons.aggregate(pipeline).toArray();
  return docs;
};

const getLessonByIdService = async (lessonId) => {
  const lessons = client.db(DB_NAME).collection(LESSONS_COLLECTION);

  const pipeline = [
    { $match: { _id: new ObjectId(lessonId) } },
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
        from: USERS_COLLECTION,
        localField: "userObjectId",
        foreignField: "_id",
        as: "creator",
      },
    },
    {
      $unwind: {
        path: "$creator",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $addFields: {
        creatorId: { $ifNull: ["$creator._id", null] },
        creatorName: { $ifNull: ["$creator.name", null] },
        creatorProfilePic: { $ifNull: ["$creator.image", null] },
      },
    },
    { $project: { creator: 0, userObjectId: 0 } },
  ];

  const docs = await lessons.aggregate(pipeline).toArray();
  return docs[0] || null;
};

/**
 * Fetches every lesson authored by the given user. The lookup mirrors
 * `getPublicLessons`: lessons are joined to the `user` collection so the
 * frontend gets the creator's name + profile pic in one round-trip.
 *
 * Returns an array (empty when the user has no lessons). Throws
 * httpError(400) if `userId` is missing or not a valid ObjectId.
 */
const getLessonsByUserId = async (userId) => {
  if (!userId) throw httpError(400, "userId is required");

  const uid = userId.toString().trim();
  if (!ObjectId.isValid(uid)) {
    throw httpError(400, "Invalid userId");
  }

  const lessons = client.db(DB_NAME).collection(LESSONS_COLLECTION);

  const pipeline = [
    {
      $match: {
        $expr: { $eq: [{ $toString: "$userId" }, uid] },
      },
    },
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
        from: USERS_COLLECTION,
        localField: "userObjectId",
        foreignField: "_id",
        as: "creator",
      },
    },
    {
      $unwind: {
        path: "$creator",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $addFields: {
        creatorId: { $ifNull: ["$creator._id", null] },
        creatorName: { $ifNull: ["$creator.name", null] },
        creatorProfilePic: { $ifNull: ["$creator.image", null] },
      },
    },
    { $project: { creator: 0, userObjectId: 0 } },
    { $sort: { createdAt: -1 } },
  ];

  const docs = await lessons.aggregate(pipeline).toArray();
  return docs;
};

/**
 * Fetches every lesson the given user has bookmarked.
 *
 * The "favorites" concept maps to the `savedBy` array on each lesson: any
 * lesson where `savedBy` contains the user's id (stored as a string) is
 * treated as a favorite.
 *
 * Optional filters:
 *   - category        single value, must be one of ALLOWED_CATEGORIES
 *   - emotionalTone   single value, must be one of ALLOWED_TONES
 *
 * Sort order: most recently saved first. Because the document doesn't carry
 * a per-user `savedAt`, we sort by `_id` descending (ObjectId encodes a
 * creation timestamp) as a stand-in for "recently favorited". Acceptable
 * approximation since favorites usually accumulate close to lesson creation.
 *
 * Creator lookup is performed the same way as `getLessonsByUserId` so the
 * front-end can render the author without a second round-trip.
 */
const getFavoriteLessonsService = async (userId, query = {}) => {
  if (!userId) throw httpError(400, "userId is required");

  const uid = userId.toString().trim();
  if (!ObjectId.isValid(uid)) {
    throw httpError(400, "Invalid userId");
  }

  if (query.category != null && query.category !== "") {
    const category = query.category.toString().trim().toLowerCase();
    if (!ALLOWED_CATEGORIES.has(category)) {
      throw httpError(400, `Invalid category: ${category}`);
    }
  }
  if (query.emotionalTone != null && query.emotionalTone !== "") {
    const tone = query.emotionalTone.toString().trim().toLowerCase();
    if (!ALLOWED_TONES.has(tone)) {
      throw httpError(400, `Invalid emotionalTone: ${tone}`);
    }
  }

  const lessons = client.db(DB_NAME).collection(LESSONS_COLLECTION);

  const filter = { savedBy: uid };
  if (query.category) {
    const category = query.category.toString().trim().toLowerCase();
    // Case-insensitive exact match so capitalized/mixed-case stored
    // values (e.g. "Career") still match a lowercase filter.
    filter.category = { $regex: `^${escapeRegex(category)}$`, $options: "i" };
  }
  if (query.emotionalTone) {
    const tone = query.emotionalTone.toString().trim().toLowerCase();
    filter.emotionalTone = { $regex: `^${escapeRegex(tone)}$`, $options: "i" };
  }

  const pipeline = [
    { $match: filter },
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
        from: USERS_COLLECTION,
        localField: "userObjectId",
        foreignField: "_id",
        as: "creator",
      },
    },
    {
      $unwind: {
        path: "$creator",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $addFields: {
        creatorId: { $ifNull: ["$creator._id", null] },
        creatorName: { $ifNull: ["$creator.name", null] },
        creatorProfilePic: { $ifNull: ["$creator.image", null] },
      },
    },
    { $project: { creator: 0, userObjectId: 0 } },
    // Approximation of "most recently saved" using ObjectId timestamp.
    { $sort: { _id: -1 } },
  ];

  const docs = await lessons.aggregate(pipeline).toArray();
  return docs;
};

/**
 * Toggles the current user's like on a lesson.
 *
 * Data model:
 *   - lessons.likedBy:  array of userId strings (kept as strings because
 *     lessons.userId is stored as a string in this collection; mixing
 *     strings and ObjectIds in one array would make `$addToSet`/`$pull`
 *     miss matches).
 *   - lessons.likesCount: counter cache, kept in sync via `$inc`.
 *
 * Idempotency / concurrency:
 *   - Read the current `likedBy` once.
 *   - If the user is already in it → `$pull` and `$inc -1`.
 *   - Otherwise → `$addToSet` (atomic no-op on duplicate) and `$inc +1`.
 *   - `$addToSet` itself is the race guard: two near-simultaneous likes
 *     both attempt to add the same userId; only one array entry exists,
 *     so the count stays correct even under double-click.
 *
 * Response shape (matches the contract expected by the frontend
 * `lib/actions/lessonActions.js` toggleLikeLesson):
 *   {
 *     action:      "like" | "unlike",
 *     lessonId:    string,
 *     isLiked:     boolean,   // post-toggle
 *     likesCount:  number,    // post-toggle
 *   }
 */
const toggleLikeLesson = async ({ lessonId, userId }) => {
  if (!lessonId) throw httpError(400, "lessonId is required");
  if (!userId) throw httpError(400, "userId is required");

  if (!ObjectId.isValid(lessonId)) {
    throw httpError(400, "Invalid lessonId");
  }

  const lessons = client.db(DB_NAME).collection(LESSONS_COLLECTION);

  const existing = await lessons.findOne(
    { _id: new ObjectId(lessonId) },
    { projection: { likedBy: 1 } },
  );
  if (!existing) throw httpError(404, "Lesson not found");

  // Coerce to string so the membership check matches how `likedBy` is stored.
  const uid = userId.toString();
  const alreadyLiked =
    Array.isArray(existing.likedBy) && existing.likedBy.includes(uid);

  let updated;
  if (alreadyLiked) {
    const result = await lessons.findOneAndUpdate(
      { _id: new ObjectId(lessonId) },
      { $pull: { likedBy: uid }, $inc: { likesCount: -1 } },
      { returnDocument: "after" },
    );
    updated = result?.value ?? result; // driver v6 returns doc directly
  } else {
    const result = await lessons.findOneAndUpdate(
      { _id: new ObjectId(lessonId) },
      { $addToSet: { likedBy: uid }, $inc: { likesCount: 1 } },
      { returnDocument: "after" },
    );
    updated = result?.value ?? result;
  }

  // Defensive: never let the counter go negative even if it was already
  // out of sync before this request.
  const likesCount = Math.max(0, Number(updated?.likesCount ?? 0));

  return {
    action: alreadyLiked ? "unlike" : "like",
    lessonId: lessonId.toString(),
    isLiked: !alreadyLiked,
    likesCount,
  };
};

/**
 * Toggles the current user's save (bookmark) on a lesson.
 *
 * Mirrors `toggleLikeLesson` but operates on `savedBy` / `savesCount`.
 * The bookmark list is typically smaller than the like list, but the
 * race-safe `$addToSet` + `$inc` pattern is the same: a near-simultaneous
 * double-tap converges on the correct counter value because `addToSet`
 * is itself idempotent at the array level.
 *
 * Response shape (matches the contract expected by the frontend
 * `lib/actions/lessonActions.js` toggleSaveLesson):
 *   {
 *     action:     "save" | "unsave",
 *     lessonId:   string,
 *     isSaved:    boolean,   // post-toggle
 *     savesCount: number,    // post-toggle
 *   }
 */
const toggleSaveLesson = async ({ lessonId, userId }) => {
  if (!lessonId) throw httpError(400, "lessonId is required");
  if (!userId) throw httpError(400, "userId is required");

  if (!ObjectId.isValid(lessonId)) {
    throw httpError(400, "Invalid lessonId");
  }

  const lessons = client.db(DB_NAME).collection(LESSONS_COLLECTION);

  const existing = await lessons.findOne(
    { _id: new ObjectId(lessonId) },
    { projection: { savedBy: 1 } },
  );
  if (!existing) throw httpError(404, "Lesson not found");

  const uid = userId.toString();
  const alreadySaved =
    Array.isArray(existing.savedBy) && existing.savedBy.includes(uid);

  let updated;
  if (alreadySaved) {
    const result = await lessons.findOneAndUpdate(
      { _id: new ObjectId(lessonId) },
      { $pull: { savedBy: uid }, $inc: { savesCount: -1 } },
      { returnDocument: "after" },
    );
    updated = result?.value ?? result;
  } else {
    const result = await lessons.findOneAndUpdate(
      { _id: new ObjectId(lessonId) },
      { $addToSet: { savedBy: uid }, $inc: { savesCount: 1 } },
      { returnDocument: "after" },
    );
    updated = result?.value ?? result;
  }

  const savesCount = Math.max(0, Number(updated?.savesCount ?? 0));

  return {
    action: alreadySaved ? "unsave" : "save",
    lessonId: lessonId.toString(),
    isSaved: !alreadySaved,
    savesCount,
  };
};

const ALLOWED_VISIBILITIES = ["public", "private"];

const changeVisibilityService = async ({ lessonId, userId, visibility }) => {
  if (!lessonId) throw httpError(400, "lessonId is required");
  if (!userId) throw httpError(400, "userId is required");
  if (!visibility) throw httpError(400, "visibility is required");

  if (!ObjectId.isValid(lessonId)) {
    throw httpError(400, "Invalid lessonId");
  }

  if (!ALLOWED_VISIBILITIES.includes(visibility)) {
    throw httpError(
      400,
      `visibility must be one of: ${ALLOWED_VISIBILITIES.join(", ")}`,
    );
  }

  const lessons = client.db(DB_NAME).collection(LESSONS_COLLECTION);

  const existing = await lessons.findOne(
    { _id: new ObjectId(lessonId) },
    { projection: { userId: 1, visibility: 1 } },
  );
  if (!existing) throw httpError(404, "Lesson not found");

  // Only the owner can change visibility
  if (existing.userId?.toString() !== userId.toString()) {
    throw httpError(
      403,
      "You are not allowed to change this lesson's visibility",
    );
  }

  // No-op if visibility is already what was requested
  if (existing.visibility === visibility) {
    return {
      lessonId: lessonId.toString(),
      visibility,
      changed: false,
    };
  }

  const result = await lessons.findOneAndUpdate(
    { _id: new ObjectId(lessonId) },
    { $set: { visibility, updatedAt: new Date() } },
    { returnDocument: "after", projection: { visibility: 1 } },
  );

  const updated = result?.value ?? result;
  if (!updated) throw httpError(404, "Lesson not found");

  return {
    lessonId: lessonId.toString(),
    visibility: updated.visibility,
    changed: true,
  };
};

/**
 * Changes the access level of a lesson (free | premium).
 *
 * Authorization rules:
 *   - Only the lesson owner can change access level.
 *   - Only "pro" plan users are allowed to mark a lesson as "premium".
 *     Attempting to upgrade to "premium" on a "free" plan returns 403.
 *
 * Response shape:
 *   { lessonId, accessLevel, changed }
 */
const changeAccessLevelService = async ({ lessonId, userId, accessLevel }) => {
  if (!lessonId) throw httpError(400, "lessonId is required");
  if (!userId) throw httpError(400, "userId is required");
  if (!accessLevel) throw httpError(400, "accessLevel is required");

  if (!ObjectId.isValid(lessonId)) {
    throw httpError(400, "Invalid lessonId");
  }

  if (!ALLOWED_ACCESS_LEVELS.has(accessLevel)) {
    throw httpError(
      400,
      `accessLevel must be one of: ${Array.from(ALLOWED_ACCESS_LEVELS).join(", ")}`,
    );
  }

  const db = client.db(DB_NAME);
  const lessons = db.collection(LESSONS_COLLECTION);
  const users = db.collection(USERS_COLLECTION);

  const lesson = await lessons.findOne(
    { _id: new ObjectId(lessonId) },
    { projection: { userId: 1, accessLevel: 1 } },
  );
  if (!lesson) throw httpError(404, "Lesson not found");

  if (lesson.userId?.toString() !== userId.toString()) {
    throw httpError(
      403,
      "You are not allowed to change this lesson's access level",
    );
  }

  // Premium tier gate: the owner must be on the "pro" plan to set premium.
  if (accessLevel === "premium") {
    let ownerPlan = null;
    if (ObjectId.isValid(userId)) {
      const owner = await users.findOne(
        { _id: new ObjectId(userId) },
        { projection: { plan: 1 } },
      );
      ownerPlan = owner?.plan ?? null;
    } else {
      const owner = await users.findOne(
        { _id: userId },
        { projection: { plan: 1 } },
      );
      ownerPlan = owner?.plan ?? null;
    }

    if (ownerPlan !== "pro") {
      throw httpError(
        403,
        "You must upgrade to Pro plan to publish premium lessons",
      );
    }
  }

  if (lesson.accessLevel === accessLevel) {
    return {
      lessonId: lessonId.toString(),
      accessLevel,
      changed: false,
    };
  }

  const result = await lessons.findOneAndUpdate(
    { _id: new ObjectId(lessonId) },
    { $set: { accessLevel, updatedAt: new Date() } },
    { returnDocument: "after", projection: { accessLevel: 1 } },
  );

  const updated = result?.value ?? result;
  if (!updated) throw httpError(404, "Lesson not found");

  return {
    lessonId: lessonId.toString(),
    accessLevel: updated.accessLevel,
    changed: true,
  };
};

/**
 * Updates an existing lesson owned by `userId`.
 *
 * Allowed fields: title, story, category, emotionalTone, accessLevel,
 * imageUrl. User identity (userId) is taken from req.body and cannot be
 * changed here. The `accessLevel === "premium"` branch is gated on the
 * owner's plan === "pro" using the same check as changeAccessLevelService.
 *
 * Returns the updated lesson document.
 */
const updateLessonService = async ({ lessonId, userId, payload }) => {
  if (!lessonId) throw httpError(400, "lessonId is required");
  if (!userId) throw httpError(400, "userId is required");
  if (!payload || typeof payload !== "object") {
    throw httpError(400, "payload is required");
  }

  if (!ObjectId.isValid(lessonId)) {
    throw httpError(400, "Invalid lessonId");
  }

  const updates = {};

  if (payload.title !== undefined) {
    const title = payload.title.toString().trim();
    if (!title) throw httpError(400, "Lesson title is required");
    if (title.length > 200) {
      throw httpError(400, "Lesson title must be 200 characters or fewer");
    }
    updates.title = title;
  }

  if (payload.story !== undefined) {
    const story = payload.story.toString().trim();
    if (!story) throw httpError(400, "Story content is required");
    updates.story = story;
  }

  if (payload.category !== undefined) {
    const category = payload.category.toString().trim();
    if (!ALLOWED_CATEGORIES.has(category)) {
      throw httpError(400, "A valid category is required");
    }
    updates.category = category;
  }

  if (payload.emotionalTone !== undefined) {
    const emotionalTone = payload.emotionalTone.toString().trim();
    if (!ALLOWED_TONES.has(emotionalTone)) {
      throw httpError(400, "A valid emotional tone is required");
    }
    updates.emotionalTone = emotionalTone;
  }

  if (payload.imageUrl !== undefined) {
    // empty string / null clears the image; otherwise trim and store.
    if (payload.imageUrl === null || payload.imageUrl === "") {
      updates.imageUrl = null;
    } else {
      updates.imageUrl = payload.imageUrl.toString().trim();
    }
  }

  if (payload.accessLevel !== undefined) {
    const accessLevel = payload.accessLevel.toString().trim();
    if (!ALLOWED_ACCESS_LEVELS.has(accessLevel)) {
      throw httpError(400, 'Access level must be either "free" or "premium"');
    }
    updates.accessLevel = accessLevel;
  }

  if (Object.keys(updates).length === 0) {
    throw httpError(400, "No updatable fields provided");
  }

  const db = client.db(DB_NAME);
  const lessons = db.collection(LESSONS_COLLECTION);
  const users = db.collection(USERS_COLLECTION);

  const existing = await lessons.findOne(
    { _id: new ObjectId(lessonId) },
    { projection: { userId: 1 } },
  );
  if (!existing) throw httpError(404, "Lesson not found");

  if (existing.userId?.toString() !== userId.toString()) {
    throw httpError(403, "You are not allowed to update this lesson");
  }

  // Premium tier gate: only Pro plan owners can set premium.
  if (updates.accessLevel === "premium") {
    let ownerPlan = null;
    if (ObjectId.isValid(userId)) {
      const owner = await users.findOne(
        { _id: new ObjectId(userId) },
        { projection: { plan: 1 } },
      );
      ownerPlan = owner?.plan ?? null;
    } else {
      const owner = await users.findOne(
        { _id: userId },
        { projection: { plan: 1 } },
      );
      ownerPlan = owner?.plan ?? null;
    }

    if (ownerPlan !== "pro") {
      throw httpError(
        403,
        "You must upgrade to Pro plan to publish premium lessons",
      );
    }
  }

  updates.updatedAt = new Date();

  const result = await lessons.findOneAndUpdate(
    { _id: new ObjectId(lessonId) },
    { $set: updates },
    { returnDocument: "after" },
  );

  const updated = result?.value ?? result;
  if (!updated) throw httpError(404, "Lesson not found");

  return updated;
};

/**
 * Deletes a lesson owned by `userId`.
 *
 * - Requires both `lessonId` and `userId`.
 * - Enforces ownership: the caller's userId must match the lesson's
 *   stored userId, otherwise throws 403.
 * - Returns the deleted lessonId on success.
 *
 * Cascade behaviour (e.g. removing likes / saves / comments) is the
 * caller's responsibility — this service removes the lesson document only.
 */
const deleteLessonService = async ({ lessonId, userId }) => {
  if (!lessonId) throw httpError(400, "lessonId is required");
  if (!userId) throw httpError(400, "userId is required");

  if (!ObjectId.isValid(lessonId)) {
    throw httpError(400, "Invalid lessonId");
  }

  const db = client.db(DB_NAME);
  const lessons = db.collection(LESSONS_COLLECTION);

  const existing = await lessons.findOne(
    { _id: new ObjectId(lessonId) },
    { projection: { userId: 1 } },
  );
  if (!existing) throw httpError(404, "Lesson not found");

  if (existing.userId?.toString() !== userId.toString()) {
    throw httpError(403, "You are not allowed to delete this lesson");
  }

  const result = await lessons.deleteOne({ _id: new ObjectId(lessonId) });
  if (result.deletedCount === 0) {
    throw httpError(404, "Lesson not found");
  }

  return { lessonId };
};

const removeFavoriteLessonService = async (userId, lessonId) => {
  if (!userId) throw httpError(400, "userId is required");
  if (!lessonId) throw httpError(400, "lessonId is required");

  const uid = userId.toString().trim();
  const lid = lessonId.toString().trim();

  if (!ObjectId.isValid(uid)) throw httpError(400, "Invalid userId");
  if (!ObjectId.isValid(lid)) throw httpError(400, "Invalid lessonId");

  const lessons = client.db(DB_NAME).collection(LESSONS_COLLECTION);

  const result = await lessons.updateOne(
    { _id: new ObjectId(lid) },
    { $pull: { savedBy: uid } },
  );

  if (result.matchedCount === 0) {
    throw httpError(404, "Lesson not found");
  }

  return { lessonId: lid, userId: uid, removed: result.modifiedCount > 0 };
};

module.exports = {
  createLesson,
  getPublicLessons,
  getLessonByIdService,
  getLessonsByUserId,
  getFavoriteLessonsService,
  removeFavoriteLessonService,
  toggleLikeLesson,
  toggleSaveLesson,
  changeVisibilityService,
  changeAccessLevelService,
  updateLessonService,
  deleteLessonService,
};
