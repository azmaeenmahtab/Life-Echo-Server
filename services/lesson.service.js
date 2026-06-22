const { client } = require("../db/db");

const DB_NAME = "life-echo-db";
const LESSONS_COLLECTION = "lessons";

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

module.exports = {
  createLesson,
};
