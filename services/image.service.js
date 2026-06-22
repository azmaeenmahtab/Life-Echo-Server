require("dotenv").config();

const IMGBB_ENDPOINT = "https://api.imgbb.com/1/upload";
// imgbb free tier caps uploads at 32MB per image.
const MAX_FILE_SIZE_BYTES = 32 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
]);

/**
 * Uploads a single image buffer to imgbb and returns the public URL.
 *
 * @param {Object} file - multer file object ({ buffer, mimetype, originalname, size })
 * @returns {Promise<{ url: string, displayUrl: string, deleteUrl: string, width: number, height: number }>}
 * @throws Error with `statusCode` set when the upload is rejected or imgbb fails.
 */
const uploadToImgbb = async (file) => {
  if (!file) {
    const error = new Error("No image file provided");
    error.statusCode = 400;
    throw error;
  }

  if (!file.buffer || file.buffer.length === 0) {
    const error = new Error("Uploaded file is empty");
    error.statusCode = 400;
    throw error;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const error = new Error("Image exceeds imgbb 32MB limit");
    error.statusCode = 413;
    throw error;
  }

  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    const error = new Error(
      "Unsupported image type. Allowed: JPEG, PNG, GIF, WEBP, BMP",
    );
    error.statusCode = 415;
    throw error;
  }

  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) {
    const error = new Error("IMGBB_API_KEY is not configured on the server");
    error.statusCode = 500;
    throw error;
  }

  const base64Image = file.buffer.toString("base64");

  const formData = new URLSearchParams();
  formData.append("key", apiKey);
  formData.append("image", base64Image);
  if (file.originalname) {
    formData.append("name", file.originalname.split(".")[0]);
  }

  console.log("image upload form data (url search Param) ", formData);

  let response;
  try {
    response = await fetch(IMGBB_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });
  } catch (networkError) {
    const error = new Error("Failed to reach imgbb upload service");
    error.statusCode = 502;
    error.cause = networkError;
    throw error;
  }

  // imgbb returns a JSON envelope with a `success` boolean. Non-2xx responses
  // also include a structured `error` object we can surface to the client.
  let payload;
  try {
    payload = await response.json();
  } catch (parseError) {
    const error = new Error("Invalid response from imgbb");
    error.statusCode = 502;
    error.cause = parseError;
    throw error;
  }

  if (!response.ok || !payload?.success) {
    const message =
      payload?.error?.message ||
      `imgbb upload failed with status ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status === 0 ? 502 : response.status;
    throw error;
  }

  const { url, display_url, delete_url, width, height } = payload.data;

  return {
    url,
    displayUrl: display_url,
    deleteUrl: delete_url,
    width,
    height,
  };
};

module.exports = {
  uploadToImgbb,
};
