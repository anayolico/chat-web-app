const mongoose = require('mongoose');
const { StatusCodes } = require('http-status-codes');

const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { allowedMimeTypes, normalizeMimeType } = require('../middleware/uploadMiddleware');
const { deliverMessageIfOnline } = require('../utils/messageDelivery');
const { formatMessage } = require('../utils/messageFormatter');
const { accessChatForUsers, syncChatLastMessage } = require('../utils/chatHelpers');
const { buildPublicFileUrl } = require('../utils/fileStorage');

const isBlockedRelationship = (currentUser, otherUser) =>
  (currentUser?.blockedUsers || []).some((blockedUserId) => blockedUserId.toString() === otherUser?._id?.toString()) ||
  (otherUser?.blockedUsers || []).some((blockedUserId) => blockedUserId.toString() === currentUser?._id?.toString());

const buildReplySnapshot = (message) => ({
  messageId: message._id,
  senderId: message.senderId,
  content: message.deletedForEveryone ? 'This message was deleted' : message.content || '',
  type: message.type || 'text',
  fileName: message.fileName || ''
});

const uploadMessageMedia = asyncHandler(async (req, res) => {
  const senderId = req.user._id.toString();
  const chatId = req.body.chatId?.toString().trim();
  const receiverId = req.body.receiverId?.toString().trim();
  const type = req.body.type?.toString().trim();
  const caption = req.body.content?.toString().trim() || '';
  const replyToMessageId = req.body.replyToMessageId?.toString().trim();
  const file = req.file;

  if (!file) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'A file is required');
  }

  if (!type || !allowedMimeTypes[type]) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'type must be one of image, audio, or file');
  }

  const normalizedMimeType = normalizeMimeType(file.mimetype);

  if (!allowedMimeTypes[type].includes(normalizedMimeType)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, `Invalid file type for ${type} upload`);
  }

  const publicFileUrl = buildPublicFileUrl(req, file.filename);

  let chat = null;
  let participantIds = [];
  let resolvedReceiverId = receiverId || null;

  if (chatId) {
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'chatId must be a valid chat id');
    }

    chat = await Chat.findOne({
      _id: chatId,
      participants: senderId
    }).populate('participants', '_id blockedUsers name');

    if (!chat) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Chat not found');
    }

    participantIds = (chat.participants || []).map((participant) => participant._id.toString());

    if (chat.kind === 'direct') {
      resolvedReceiverId = participantIds.find((participantId) => participantId !== senderId) || null;

      if (!resolvedReceiverId) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Chat receiver could not be resolved');
      }

      const [sender, receiver] = await Promise.all([
        User.findById(senderId).select('_id blockedUsers'),
        User.findById(resolvedReceiverId).select('_id blockedUsers')
      ]);

      if (!receiver) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Receiver not found');
      }

      if (isBlockedRelationship(sender, receiver)) {
        throw new ApiError(StatusCodes.FORBIDDEN, 'You cannot send media to this user right now');
      }
    }
  } else {
    if (!receiverId) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'receiverId is required');
    }

    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'receiverId must be a valid user id');
    }

    if (receiverId === senderId) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'senderId and receiverId cannot be the same');
    }

    const [sender, receiver] = await Promise.all([
      User.findById(senderId).select('_id blockedUsers'),
      User.findById(receiverId).select('_id blockedUsers')
    ]);

    if (!receiver) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Receiver not found');
    }

    if (isBlockedRelationship(sender, receiver)) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'You cannot send media to this user right now');
    }

    chat = await accessChatForUsers(senderId, receiverId);
    participantIds = [senderId, receiverId];
  }
  let replyTo = null;

  if (replyToMessageId) {
    const replyMessage = await Message.findOne({
      _id: replyToMessageId,
      chatId: chat._id,
      deletedFor: { $ne: senderId }
    });

    if (!replyMessage) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Reply target was not found');
    }

    replyTo = buildReplySnapshot(replyMessage);
  }

  const message = await Message.create({
    chatId: chat._id,
    senderId,
    receiverId: chat.kind === 'direct' ? resolvedReceiverId : null,
    content: caption,
    type,
    replyTo,
    mediaUrl: publicFileUrl,
    fileUrl: publicFileUrl,
    fileName: file.originalname,
    mimeType: normalizedMimeType,
    fileType: normalizedMimeType,
    fileSize: file.size,
    size: file.size,
    statusByUser: participantIds
      .filter((participantId) => participantId !== senderId)
      .map((participantId) => ({
        userId: participantId,
        status: 'sent',
        deliveredAt: null,
        seenAt: null
      }))
  });

  await syncChatLastMessage(chat._id, message);
  await deliverMessageIfOnline(message, {
    formattedMessage: {
      ...formatMessage(message),
      senderName: req.user.name
    }
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Media uploaded successfully',
    data: {
      fileName: file.originalname,
      filePath: `/uploads/${encodeURIComponent(file.filename)}`,
      fileUrl: publicFileUrl,
      mediaUrl: publicFileUrl,
      mimeType: normalizedMimeType,
      fileSize: file.size,
      message: {
        ...formatMessage(message),
        senderName: req.user.name
      }
    }
  });
});

module.exports = {
  uploadMessageMedia
};
