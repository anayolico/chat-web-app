const { StatusCodes } = require('http-status-codes');

const User = require('../models/User');
const { deleteAccountData } = require('../services/accountDeletionService');
const asyncHandler = require('../utils/asyncHandler');
const { formatChatUser } = require('../utils/chatHelpers');

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getUsers = asyncHandler(async (req, res) => {
  const users = await User.find({
    _id: { $ne: req.user._id }
  })
    .select('name phone profilePic lastSeen createdAt')
    .sort({ name: 1 });

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      users: users.map(formatChatUser)
    }
  });
});

const searchUsers = asyncHandler(async (req, res) => {
  const query = (req.query.query || '').trim();

  if (!query) {
    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        users: []
      }
    });
  }

  const users = await User.find({
    _id: { $ne: req.user._id },
    name: {
      $regex: `^${escapeRegex(query)}`,
      $options: 'i'
    }
  })
    .select('name phone profilePic lastSeen createdAt')
    .sort({ name: 1 })
    .limit(10);

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      users: users.map(formatChatUser)
    }
  });
});

const deleteCurrentUser = asyncHandler(async (req, res) => {
  await deleteAccountData(req.user._id);

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Account deleted successfully'
  });
});

module.exports = {
  getUsers,
  searchUsers,
  deleteCurrentUser
};
