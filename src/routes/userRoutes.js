const express = require('express');

const { deleteCurrentUser, getUsers, searchUsers, toggleBlockedUser } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);
router.delete('/me', deleteCurrentUser);
router.post('/block/:userId', toggleBlockedUser);
router.get('/search', searchUsers);
router.get('/', getUsers);

module.exports = router;
