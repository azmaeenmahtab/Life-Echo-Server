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
        creatorName: { $ifNull: ["$creator.name", null] },
        creatorProfilePic: { $ifNull: ["$creator.image", null] },
      },
    },
    { $project: { creator: 0, userObjectId: 0 } },
  ];

  const docs = await lessons.aggregate(pipeline).toArray();
  return docs[0] || null;
};

module.exports = {
  createLesson,
  getPublicLessons,
  getLessonByIdService,
};
