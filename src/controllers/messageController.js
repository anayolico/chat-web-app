// Message controller handling chat and conversation retrieval
// Uses MongoDB aggregation pipelines for efficient chat listing
// and message fetching with proper formatting

const mongoose = require('mongoose');
const { StatusCodes } = require('http-status-codes');

const Message = require('../models/Message');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { formatMessage } = require('../utils/messageFormatter');
const { isUserOnline } = require('../socket/socketState');

// Format user data for API responses
const formatUser = (user) => ({
  id: user._id,
  name: user.name,
  phone: user.phone,
  profilePic: user.profilePic,
  createdAt: user.createdAt,
  lastSeen: user.lastSeen || null,
  isOnline: isUserOnline(user._id.toString())
});

// Get all chats for the current user
const getChats = asyncHandler(async (req, res) => {
  const currentUserId = req.user._id;

  // MongoDB aggregation pipeline to get chats with last messages
  const chats = await Message.aggregate([
    // Match messages where current user is sender or receiver
    {
      $match: {
        $or: [{ senderId: currentUserId }, { receiverId: currentUserId }]
      }
    },
    // Add partnerId field (the other participant)
    {
      $addFields: {
        partnerId: {
          $cond: [{ $eq: ['$senderId', currentUserId] }, '$receiverId', '$senderId']
        }
      }
    },
    // Sort by creation date descending
    { $sort: { createdAt: -1 } },
    // Group by partner to get latest message per conversation
    {
      $group: {
        _id: '$partnerId',
        lastMessage: { $first: '$$ROOT' }
      }
    },
    // Join with users collection to get partner details
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'partner'
      }
    },
    // Unwind the partner array
    { $unwind: '$partner' },
    // Sort chats by last message date
    { $sort: { 'lastMessage.createdAt': -1 } }
  ]);

  // Format chats for API response
  const formattedChats = chats.map((chat) => ({
    id: chat._id.toString(),
    user: formatUser(chat.partner),
    participants: [formatUser(req.user), formatUser(chat.partner)],
    lastMessage: formatMessage(chat.lastMessage)
  }));

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      chats: formattedChats
    }
  });
});

// Get conversation messages between current user and another user
const getConversation = asyncHandler(async (req, res) => {
  const currentUserId = req.user._id;
  const { userId } = req.params;

  // Validate userId parameter
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid conversation user id');
  }

  // Find the chat partner
  const chatUser = await User.findById(userId).select('-password');

  if (!chatUser) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Chat user not found');
  }

  // Get all messages between the two users
  const messages = await Message.find({
    $and: [
      {
        $or: [
          {
            senderId: currentUserId,
            receiverId: userId
          },
          {
            senderId: userId,
            receiverId: currentUserId
          }
        ]
      },
      {
        deletedFor: { $ne: currentUserId }
      }
    ]
  }).sort({ createdAt: 1 });

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      chatUser: formatUser(chatUser),
      messages: messages.map(formatMessage)
    }
  });
});

module.exports = {
  getChats,
  getConversation
};
