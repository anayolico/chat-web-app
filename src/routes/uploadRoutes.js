const express = require('express');

const { uploadMessageMedia } = require('../controllers/uploadController');
const { protect } = require('../middleware/authMiddleware');
const { uploadLimiter } = require('../middleware/rateLimiters');
const { uploadSingleMedia } = require('../middleware/uploadMiddleware');

const router = express.Router();

router.post('/message-media', protect, uploadLimiter, uploadSingleMedia, uploadMessageMedia);

module.exports = router;
