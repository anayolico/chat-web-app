const mongoose = require('mongoose');
const { StatusCodes } = require('http-status-codes');

const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { formatMessage } = require('../utils/messageFormatter');
const { accessChatForUsers, formatChat, formatChatUser } = require('../utils/chatHelpers');

const chatParticipantProjection = 'name phone profilePic lastSeen createdAt';

const getChats = asyncHandler(async (req, res) => {
  const chats = await Chat.find({
    participants: req.user._id
  })
    .populate('participants', chatParticipantProjection)
    .sort({ updatedAt: -1, createdAt: -1 });

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      chats: chats.map((chat) => formatChat(chat, req.user._id))
    }
  });
});

const accessChat = asyncHandler(async (req, res) => {
  const otherUserId = req.body.userId?.toString().trim();

  if (!otherUserId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'userId is required');
  }

  if (!mongoose.Types.ObjectId.isValid(otherUserId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'userId must be a valid user id');
  }

  if (otherUserId === req.user._id.toString()) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'You cannot create a chat with yourself');
  }

  const otherUser = await User.findById(otherUserId).select(chatParticipantProjection);

  if (!otherUser) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  const chat = await accessChatForUsers(req.user._id, otherUserId);

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      chat: formatChat(chat, req.user._id)
    }
  });
});

const getChatMessages = asyncHandler(async (req, res) => {
  const { chatId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(chatId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid chat id');
  }

  const chat = await Chat.findOne({
    _id: chatId,
    participants: req.user._id
  }).populate('participants', chatParticipantProjection);

  if (!chat) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Chat not found');
  }

  const chatUser =
    (chat.participants || []).find((participant) => participant._id.toString() !== req.user._id.toString()) || null;

  const participantIds = (chat.participants || []).map((participant) => participant._id.toString());
  const [firstParticipantId, secondParticipantId] = participantIds;
  const messages = await Message.find({
    $and: [
      {
        $or: [
          { chatId },
          {
            senderId: firstParticipantId,
            receiverId: secondParticipantId
          },
          {
            senderId: secondParticipantId,
            receiverId: firstParticipantId
          }
        ]
      },
      {
        deletedFor: { $ne: req.user._id }
      }
    ]
  }).sort({ createdAt: 1 });

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      chat: formatChat(chat, req.user._id),
      chatUser: chatUser ? formatChatUser(chatUser) : null,
      messages: messages.map(formatMessage)
    }
  });
});

module.exports = {
  accessChat,
  getChatMessages,
  getChats
};
