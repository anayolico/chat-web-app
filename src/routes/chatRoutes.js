const express = require('express');

const { accessChat, getChatMessages, getChats } = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');
const { messageReadLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.use(protect);
router.get('/', messageReadLimiter, getChats);
router.post('/access', accessChat);
router.get('/:chatId/messages', messageReadLimiter, getChatMessages);

module.exports = router;
