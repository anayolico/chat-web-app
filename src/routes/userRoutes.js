const express = require('express');

const { deleteCurrentUser, getUsers, searchUsers } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);
router.delete('/me', deleteCurrentUser);
router.get('/search', searchUsers);
router.get('/', getUsers);

module.exports = router;
