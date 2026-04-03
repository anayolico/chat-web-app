const express = require('express');

const { getChats, getConversation } = require('../controllers/messageController');
const { protect } = require('../middleware/authMiddleware');
const { messageReadLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.use(protect);
router.get('/chats', messageReadLimiter, getChats);
router.get('/:userId', messageReadLimiter, getConversation);

module.exports = router;
