const { StatusCodes } = require('http-status-codes');
const mongoose = require('mongoose');

const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { deleteAccountData } = require('../services/accountDeletionService');
const asyncHandler = require('../utils/asyncHandler');
const { formatChatUser } = require('../utils/chatHelpers');

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getUsers = asyncHandler(async (req, res) => {
  const blockedUserIds = (req.user.blockedUsers || []).map((blockedUserId) => blockedUserId.toString());
  const users = await User.find({
    _id: {
      $nin: [req.user._id, ...blockedUserIds]
    },
    blockedUsers: {
      $ne: req.user._id
    }
  })
    .select('name phone profilePic lastSeen createdAt privacy blockedUsers')
    .sort({ name: 1 });

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      users: users.map((user) => formatChatUser(user, req.user))
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
    blockedUsers: {
      $ne: req.user._id
    },
    name: {
      $regex: `^${escapeRegex(query)}`,
      $options: 'i'
    }
  })
    .select('name phone profilePic lastSeen createdAt privacy blockedUsers')
    .sort({ name: 1 })
    .limit(10);

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      users: users
        .filter((user) => !(req.user.blockedUsers || []).some((blockedUserId) => blockedUserId.toString() === user._id.toString()))
        .map((user) => formatChatUser(user, req.user))
    }
  });
});

const toggleBlockedUser = asyncHandler(async (req, res) => {
  const targetUserId = req.params.userId?.toString().trim();

  if (!targetUserId || !mongoose.Types.ObjectId.isValid(targetUserId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'userId must be a valid user id');
  }

  if (targetUserId === req.user._id.toString()) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'You cannot block yourself');
  }

  const targetUser = await User.findById(targetUserId).select('_id');
  if (!targetUser) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  const blockedUsers = (req.user.blockedUsers || []).map((blockedUserId) => blockedUserId.toString());
  const isBlocked = blockedUsers.includes(targetUserId);

  const user = await User.findByIdAndUpdate(
    req.user._id,
    isBlocked
      ? {
          $pull: {
            blockedUsers: new mongoose.Types.ObjectId(targetUserId)
          }
        }
      : {
          $addToSet: {
            blockedUsers: new mongoose.Types.ObjectId(targetUserId)
          }
        },
    {
      new: true
    }
  ).select('blockedUsers');

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      blockedUsers: (user.blockedUsers || []).map((blockedUserId) => blockedUserId.toString()),
      isBlocked: !isBlocked
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
  deleteCurrentUser,
  toggleBlockedUser
};
