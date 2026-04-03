const mongoose = require('mongoose');
const { StatusCodes } = require('http-status-codes');

const Message = require('../models/Message');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const uploadFileToCloudinary = require('../utils/uploadFileToCloudinary');
const { allowedMimeTypes } = require('../middleware/uploadMiddleware');
const { deliverMessageIfOnline } = require('../utils/messageDelivery');
const { formatMessage } = require('../utils/messageFormatter');
const { accessChatForUsers, syncChatLastMessage } = require('../utils/chatHelpers');

const normalizeMimeType = (value) => value.split(';')[0].trim();

const resolveResourceType = (messageType, mimeType) => {
  if (messageType === 'image' || mimeType.startsWith('image/')) {
    return 'image';
  }

  if (messageType === 'audio' || mimeType.startsWith('audio/') || mimeType.startsWith('video/')) {
    return 'video';
  }

  return 'raw';
};

const uploadMessageMedia = asyncHandler(async (req, res) => {
  const senderId = req.user._id.toString();
  const receiverId = req.body.receiverId?.toString().trim();
  const type = req.body.type?.toString().trim();
  const caption = req.body.content?.toString().trim() || '';
  const file = req.file;

  if (!receiverId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'receiverId is required');
  }

  if (!mongoose.Types.ObjectId.isValid(receiverId)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'receiverId must be a valid user id');
  }

  if (receiverId === senderId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'senderId and receiverId cannot be the same');
  }

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

  const receiverExists = await User.exists({ _id: receiverId });
  if (!receiverExists) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Receiver not found');
  }

  const uploadResult = await uploadFileToCloudinary(file.buffer, {
    folder: 'chat-web-app/messages',
    public_id: `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`,
    resource_type: resolveResourceType(type, normalizedMimeType)
  });

  const chat = await accessChatForUsers(senderId, receiverId);

  const message = await Message.create({
    chatId: chat._id,
    senderId,
    receiverId,
    content: caption,
    type,
    mediaUrl: uploadResult.secure_url,
    fileUrl: uploadResult.secure_url,
    fileName: file.originalname,
    mimeType: normalizedMimeType,
    fileType: normalizedMimeType,
    fileSize: file.size,
    size: file.size,
    statusByUser: [
      {
        userId: receiverId,
        status: 'sent',
        deliveredAt: null,
        seenAt: null
      }
    ]
  });

  await syncChatLastMessage(chat._id, message);
  await deliverMessageIfOnline(message);

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Media uploaded successfully',
    data: {
      message: formatMessage(message)
    }
  });
});

module.exports = {
  uploadMessageMedia
};
