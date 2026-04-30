const express = require('express');

const {
  accessChat,
  createGroup,
  getChatMessages,
  getChats,
  forwardMessage,
  toggleChatPin,
  toggleMessagePin,
  toggleSecureMode
} = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');
const { messageReadLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.use(protect);
router.get('/', messageReadLimiter, getChats);
router.post('/access', accessChat);
router.post('/group', createGroup);
router.post('/forward', forwardMessage);
router.post('/:chatId/pin', toggleChatPin);
router.post('/:chatId/secure-mode', toggleSecureMode);
router.post('/messages/:messageId/pin', toggleMessagePin);
router.get('/:chatId/messages', messageReadLimiter, getChatMessages);

module.exports = router;
