const mongoose = require('mongoose');
const { StatusCodes } = require('http-status-codes');

const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { deliverMessageIfOnline } = require('../utils/messageDelivery');
const { formatMessage } = require('../utils/messageFormatter');
const { accessChatForUsers, createGroupChat, formatChat, formatChatUser, syncChatLastMessage } = require('../utils/chatHelpers');

const chatParticipantProjection = 'name phone profilePic lastSeen createdAt privacy blockedUsers';

const isBlockedRelationship = (currentUser, otherUser) => {
  const blockedByCurrentUser = (currentUser.blockedUsers || []).some(
    (blockedUserId) => blockedUserId.toString() === otherUser._id.toString()
  );
  const blockedByOtherUser = (otherUser.blockedUsers || []).some(
    (blockedUserId) => blockedUserId.toString() === currentUser._id.toString()
  );

  return blockedByCurrentUser || blockedByOtherUser;
};

const buildChatSummaryForConversation = (chat, currentUser) => {
  if (chat.kind === 'group') {
    return {
      id: chat._id.toString(),
      kind: 'group',
      name: chat.name || 'Untitled group',
      profilePic: '',
      phone: '',
      memberCount: (chat.participants || []).length,
      participants: (chat.participants || []).map((participant) => formatChatUser(participant, currentUser))
    };
  }

  const chatUser =
    (chat.participants || []).find((participant) => participant._id.toString() !== currentUser._id.toString()) || null;

  return chatUser ? formatChatUser(chatUser, currentUser) : null;
};

const buildForwardSource = async (messageId, currentUserId) => {
  const message = await Message.findOne({
    _id: messageId,
    deletedFor: { $ne: currentUserId }
  });

  if (!message) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Message not found');
  }

  const chat = await Chat.exists({
    _id: message.chatId,
    participants: currentUserId
  });

  if (!chat) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Message not found');
  }

  return message;
};

const getChats = asyncHandler(async (req, res) => {
  const chats = await Chat.find({
    participants: req.user._id
  })
    .populate('participants', chatParticipantProjection)
    .sort({ updatedAt: -1, createdAt: -1 });

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      chats: await Promise.all(
        chats
          .filter((chat) => {
            if (chat.kind === 'group') {
              return true;
            }

            const partner = (chat.participants || []).find(
              (participant) => participant._id.toString() !== req.user._id.toString()
            );

            return !partner || !isBlockedRelationship(req.user, partner);
          })
          .map(async (chat) => {
            const unreadCount = await Message.countDocuments({
              chatId: chat._id,
              senderId: { $ne: req.user._id },
              deletedForEveryone: false,
              deletedFor: { $ne: req.user._id },
              statusByUser: {
                $elemMatch: {
                  userId: req.user._id,
                  status: { $in: ['sent', 'delivered'] }
                }
              }
            });

            return formatChat(chat, req.user, unreadCount);
          })
      )
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

  if (isBlockedRelationship(req.user, otherUser)) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'You cannot start or reopen a chat with this user right now');
  }

  const chat = await accessChatForUsers(req.user._id, otherUserId);

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      chat: formatChat(chat, req.user)
    }
  });
});

const createGroup = asyncHandler(async (req, res) => {
  const name = req.body.name?.toString().trim();
  const memberIds = Array.isArray(req.body.memberIds) ? req.body.memberIds.map((memberId) => memberId?.toString().trim()).filter(Boolean) : [];

  if (!name) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Group name is required');
  }

  if (memberIds.length < 2) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Select at least two members to create a group');
  }

  const uniqueMemberIds = Array.from(new Set(memberIds));

  if (uniqueMemberIds.some((memberId) => !mongoose.Types.ObjectId.isValid(memberId))) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'All memberIds must be valid user ids');
  }

  if (uniqueMemberIds.includes(req.user._id.toString())) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Do not include yourself in memberIds');
  }

  const members = await User.find({
    _id: { $in: uniqueMemberIds }
  }).select(chatParticipantProjection);

  if (members.length !== uniqueMemberIds.length) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'One or more selected users were not found');
  }

  const blockedMember = members.find((member) => isBlockedRelationship(req.user, member));
  if (blockedMember) {
    throw new ApiError(StatusCodes.FORBIDDEN, `You cannot add ${blockedMember.name} to this group right now`);
  }

  const chat = await createGroupChat({
    creatorId: req.user._id,
    memberIds: uniqueMemberIds,
    name
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    data: {
      chat: formatChat(chat, req.user)
    }
  });
});

const getChatMessages = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const rawLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isNaN(rawLimit) ? 50 : Math.min(Math.max(rawLimit, 1), 100);
  const beforeRaw = req.query.before?.toString().trim();
  const searchRaw = req.query.search?.toString().trim();

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

  const query = {
    chatId,
    deletedFor: { $ne: req.user._id }
  };

  if (beforeRaw) {
    const beforeDate = new Date(beforeRaw);
    if (!Number.isNaN(beforeDate.getTime())) {
      query.createdAt = { $lt: beforeDate };
    }
  }

  if (searchRaw) {
    query.deletedForEveryone = false;
    query.content = { $regex: searchRaw, $options: 'i' };
  }

  const rows = await Message.find(query).sort({ createdAt: -1 }).limit(limit + 1);
  const hasMore = rows.length > limit;
  const visibleRows = hasMore ? rows.slice(0, limit) : rows;
  const messages = visibleRows.reverse();
  const nextBefore = hasMore && visibleRows.length > 0 ? visibleRows[visibleRows.length - 1].createdAt : null;

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      chat: formatChat(chat, req.user),
      chatUser: buildChatSummaryForConversation(chat, req.user),
      messages: messages.map(formatMessage),
      pinnedMessages: messages
        .filter((message) => (message.pinnedBy || []).some((userId) => userId.toString() === req.user._id.toString()))
        .map(formatMessage),
      pagination: {
        limit,
        hasMore,
        nextBefore
      }
    }
  });
});

const toggleChatPin = asyncHandler(async (req, res) => {
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

  const isPinned = (chat.pinnedBy || []).some((userId) => userId.toString() === req.user._id.toString());

  await Chat.findByIdAndUpdate(chatId, isPinned ? { $pull: { pinnedBy: req.user._id } } : { $addToSet: { pinnedBy: req.user._id } });
  const updatedChat = await Chat.findById(chatId).populate('participants', chatParticipantProjection);

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      chat: formatChat(updatedChat, req.user),
      isPinned: !isPinned
    }
  });
});

const toggleSecureMode = asyncHandler(async (req, res) => {
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

  chat.isSecure = !chat.isSecure;
  await chat.save();

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      chat: formatChat(chat, req.user),
      isSecure: chat.isSecure
    }
  });
});

const toggleMessagePin = asyncHandler(async (req, res) => {
  const { messageId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid message id');
  }

  const message = await Message.findOne({
    _id: messageId,
    deletedFor: { $ne: req.user._id }
  });

  if (!message) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Message not found');
  }

  const chat = await Chat.exists({
    _id: message.chatId,
    participants: req.user._id
  });

  if (!chat) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Message not found');
  }

  const isPinned = (message.pinnedBy || []).some((userId) => userId.toString() === req.user._id.toString());

  await Message.findByIdAndUpdate(
    messageId,
    isPinned ? { $pull: { pinnedBy: req.user._id } } : { $addToSet: { pinnedBy: req.user._id } }
  );
  const updatedMessage = await Message.findById(messageId);

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      message: formatMessage(updatedMessage),
      isPinned: !isPinned
    }
  });
});

const forwardMessage = asyncHandler(async (req, res) => {
  const targetUserId = req.body.targetUserId?.toString().trim();
  const sourceMessageId = req.body.messageId?.toString().trim();

  if (!targetUserId || !mongoose.Types.ObjectId.isValid(targetUserId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'targetUserId must be a valid user id');
  }

  if (targetUserId === req.user._id.toString()) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'You cannot forward to yourself');
  }

  const targetUser = await User.findById(targetUserId).select(chatParticipantProjection);
  if (!targetUser) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Target user not found');
  }

  if (isBlockedRelationship(req.user, targetUser)) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'You cannot forward a message to this user');
  }

  const sourceMessage = await buildForwardSource(sourceMessageId, req.user._id);
  const sourceChat = await Chat.findById(sourceMessage.chatId).select('isSecure');
  if (sourceChat?.isSecure) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Secure chat messages cannot be forwarded');
  }

  const targetChat = await accessChatForUsers(req.user._id, targetUserId);
  if (targetChat.isSecure) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Forwarding into a secure chat is not allowed');
  }

  const forwardedMessage = await Message.create({
    chatId: targetChat._id,
    senderId: req.user._id,
    receiverId: targetUserId,
    content: sourceMessage.content,
    type: sourceMessage.type,
    mediaUrl: sourceMessage.mediaUrl || '',
    fileUrl: sourceMessage.fileUrl || '',
    fileName: sourceMessage.fileName || '',
    mimeType: sourceMessage.mimeType || '',
    fileType: sourceMessage.fileType || '',
    fileSize: sourceMessage.fileSize || 0,
    size: sourceMessage.size || 0,
    forwardedFrom: {
      messageId: sourceMessage._id,
      senderId: sourceMessage.senderId,
      name: req.user.name
    },
    statusByUser: [
      {
        userId: targetUserId,
        status: 'sent',
        deliveredAt: null,
        seenAt: null
      }
    ]
  });

  await syncChatLastMessage(targetChat._id, forwardedMessage);
  await deliverMessageIfOnline(forwardedMessage, {
    formattedMessage: {
      ...formatMessage(forwardedMessage),
      senderName: req.user.name
    }
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    data: {
      chat: formatChat(targetChat, req.user),
      message: {
        ...formatMessage(forwardedMessage),
        senderName: req.user.name
      }
    }
  });
});

module.exports = {
  accessChat,
  createGroup,
  getChatMessages,
  getChats,
  forwardMessage,
  toggleChatPin,
  toggleMessagePin,
  toggleSecureMode
};
