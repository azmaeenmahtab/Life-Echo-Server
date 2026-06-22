const imageService = require('../services/image.service');

/**
 * Controller layer: parses the incoming multipart upload, delegates to the
 * image service, and shapes the HTTP response. All upstream/downstream errors
 * carry a `statusCode` we forward to the client.
 */

const uploadImage = async (req, res) => {
  try {
    const result = await imageService.uploadToImgbb(req.file);
    return res.status(201).json({
      message: 'Image uploaded successfully',
      image: result,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: status === 500 ? 'Error uploading image' : error.message,
      error: error.message,
    });
  }
};

module.exports = {
  uploadImage,
};
