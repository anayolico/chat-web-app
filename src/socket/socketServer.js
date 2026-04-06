// Socket.IO server implementation for real-time chat functionality
// Handles WebSocket connections, message sending, presence tracking,
// typing indicators, and message delivery status updates

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const Message = require('../models/Message');
const User = require('../models/User');
const Chat = require('../models/Chat');
const { formatMessage } = require('../utils/messageFormatter');
const { getSocketCorsOptions } = require('../utils/corsConfig');
const { deliverMessageIfOnline, markMessagesAsDelivered, markMessagesAsSeen } = require('../utils/messageDelivery');
const { formatPresence } = require('../utils/presenceFormatter');
const { clearSocketRateLimit, isRateLimited } = require('../utils/socketRateLimiter');
const { accessChatForUsers, syncChatLastMessage, syncChatLastMessageFromHistory } = require('../utils/chatHelpers');
const logger = require('../utils/logger');
const {
  addUserSocket,
  clearActiveConversation,
  emitToUser,
  getSocketServer,
  isUserOnline,
  removeUserSocket,
  setActiveConversation,
  setSocketServer
} = require('./socketState');

// Allowed message types for validation
const allowedMessageTypes = new Set(['text', 'image', 'audio', 'file']);

// Generate chat room name for Socket.IO rooms
const getChatRoom = (chatId) => `chat:${chatId}`;

// Extract authentication token from socket handshake
const getSocketToken = (socket) => {
  const authToken = socket.handshake.auth?.token;
  const headerToken = socket.handshake.headers?.authorization;

  if (authToken) {
    return authToken.replace(/^Bearer\s+/i, '').trim();
  }

  if (headerToken) {
    return headerToken.replace(/^Bearer\s+/i, '').trim();
  }

  return null;
};

// Broadcast user presence updates to all connected clients
const broadcastPresence = (userId, isOnline, lastSeen = null) => {
  const payload = formatPresence({ userId, isOnline, lastSeen });
  const io = getSocketServer();

  if (io) {
    io.emit('presence:update', payload);
    io.emit(isOnline ? 'user_online' : 'user_offline', payload);
  }
};

const emitIncomingMessage = (target, payload) => {
  emitToUser(target, 'receiveMessage', payload);
  emitToUser(target, 'receive_message', payload);
};

const emitMessageStatusUpdate = (target, payload) => {
  emitToUser(target, 'messageStatusUpdated', payload);
  emitToUser(target, 'message_status_updated', payload);
};

const emitTypingUpdate = (target, payload) => {
  emitToUser(target, 'typing:update', payload);
  emitToUser(target, 'typing', payload);
};

// Deliver pending messages when user comes online
const deliverPendingMessages = async (_io, userId) => {
  // Replay stored messages in order when an offline user reconnects.
  const pendingMessages = await Message.find({
    receiverId: userId,
    status: 'sent',
    deletedForEveryone: false,
    deletedFor: { $ne: userId }
  }).sort({ createdAt: 1 });

  if (pendingMessages.length === 0) {
    return;
  }

  if (!isUserOnline(userId)) {
    return;
  }

  await markMessagesAsDelivered(pendingMessages);

  pendingMessages.forEach((message) => {
    emitIncomingMessage(userId, formatMessage(message));
    emitMessageStatusUpdate(message.senderId.toString(), {
      messageId: message._id.toString(),
      status: message.status,
      deliveredAt: message.deliveredAt,
      seenAt: message.seenAt || null
    });
  });
};

// Validate message payload before processing
const validateMessagePayload = async (payload, senderId) => {
  const chatId = payload?.chatId?.toString().trim();
  const receiverId = payload?.receiverId?.toString().trim();
  const clientTempId = payload?.clientTempId?.toString().trim();
  const content = payload?.content?.toString().trim();
  const type = payload?.type?.toString().trim() || 'text';

  // Basic validation
  if (!receiverId) {
    throw new Error('receiverId is required');
  }

  if (!content) {
    throw new Error('content is required');
  }

  if (content.length > 5000) {
    throw new Error('content cannot exceed 5000 characters');
  }

  if (!allowedMessageTypes.has(type)) {
    throw new Error('type must be one of text, image, audio, or file');
  }

  if (!mongoose.Types.ObjectId.isValid(receiverId)) {
    throw new Error('receiverId must be a valid user id');
  }

  if (receiverId === senderId) {
    throw new Error('senderId and receiverId cannot be the same');
  }

  // Check if receiver exists
  const receiverExists = await User.exists({ _id: receiverId });
  if (!receiverExists) {
    throw new Error('Receiver not found');
  }

  let chat = null;

  // Validate or create chat
  if (chatId) {
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      throw new Error('chatId must be a valid chat id');
    }

    chat = await Chat.findOne({
      _id: chatId,
      participants: { $all: [senderId, receiverId] }
    });

    if (!chat) {
      throw new Error('Chat not found for these participants');
    }
  } else {
    chat = await accessChatForUsers(senderId, receiverId);
  }

  return {
    chatId: chat._id.toString(),
    clientTempId: clientTempId || '',
    receiverId,
    content,
    type
  };
};

const findMessageForParticipant = async (messageId, userId) => {
  if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
    throw new Error('messageId must be a valid message id');
  }

  const message = await Message.findOne({
    _id: messageId,
    $or: [{ senderId: userId }, { receiverId: userId }]
  });

  if (!message) {
    throw new Error('Message not found');
  }

  return message;
};

const emitMessageUpdate = (message) => {
  const payload = {
    message: formatMessage(message)
  };

  emitToUser(message.senderId.toString(), 'messageUpdated', payload);
  emitToUser(message.receiverId.toString(), 'messageUpdated', payload);
};

const emitMessageRemovedForUser = (userId, message) => {
  emitToUser(userId, 'messageRemoved', {
    chatId: message.chatId?.toString() || '',
    messageId: message._id.toString()
  });
};

const maybeHardDeleteMessage = async (message) => {
  const participantIds = [message.senderId, message.receiverId].map((value) => value.toString());
  const deletedForIds = (message.deletedFor || []).map((value) => value.toString());
  const isHiddenForAll = participantIds.every((participantId) => deletedForIds.includes(participantId));

  if (!isHiddenForAll) {
    return false;
  }

  const chatId = message.chatId;
  await Message.findByIdAndDelete(message._id);
  await syncChatLastMessageFromHistory(chatId);
  return true;
};

// Create and configure Socket.IO server
const createSocketServer = (httpServer) => {
  const io = new Server(httpServer, {
    cors: getSocketCorsOptions(),
    pingTimeout: 20000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
  });

  setSocketServer(io);

  // Socket authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = getSocketToken(socket);

      if (!token) {
        return next(new Error('Authentication token is required'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('_id name phone profilePic createdAt');

      if (!user) {
        return next(new Error('Socket authentication failed'));
      }

      // Attach user info to socket
      socket.user = {
        id: user._id.toString(),
        name: user.name,
        phone: user.phone,
        profilePic: user.profilePic,
        createdAt: user.createdAt
      };

      return next();
    } catch (_error) {
      return next(new Error('Invalid or expired token'));
    }
  });

  // Handle socket connections
  io.on('connection', async (socket) => {
    const userId = socket.user.id;

    // Track all active sockets for a user so multiple devices stay in sync.
    addUserSocket(userId, socket.id);
    socket.join(userId);
    await User.findByIdAndUpdate(userId, { $set: { lastSeen: new Date() } });

    broadcastPresence(userId, true);

    try {
      await deliverPendingMessages(io, userId);
    } catch (error) {
      logger.error('Failed to deliver pending messages', {
        message: error.message,
        userId
      });
    }

    // Handle sending messages
    const handleSendMessage = async (payload, callback) => {
      try {
        if (isRateLimited(socket.id, 'sendMessage')) {
          throw new Error('Message rate limit exceeded. Please slow down.');
        }

        const { chatId, clientTempId, receiverId, content, type } = await validateMessagePayload(payload, userId);

        // Create message in database
        const message = await Message.create({
          chatId,
          senderId: userId,
          receiverId,
          content,
          type,
          statusByUser: [
            {
              userId: receiverId,
              status: 'sent',
              deliveredAt: null,
              seenAt: null
            }
          ]
        });

        const formattedMessage = {
          ...formatMessage(message),
          clientTempId
        };

        // Update chat's last message
        await syncChatLastMessage(chatId, message);
        // Broadcast to chat room
        io.to(getChatRoom(chatId)).emit('receiveMessage', formattedMessage);
        io.to(getChatRoom(chatId)).emit('receive_message', formattedMessage);
        // Deliver if receiver is online
        await deliverMessageIfOnline(message);

        if (typeof callback === 'function') {
          callback({
            success: true,
            data: {
              message: formattedMessage
            }
          });
        }
      } catch (error) {
        if (typeof callback === 'function') {
          callback({
            success: false,
            message: error.message || 'Failed to send message'
          });
        }
      }
    };

    socket.on('sendMessage', handleSendMessage);
    socket.on('send_message', handleSendMessage);

    socket.on('editMessage', async (payload, callback) => {
      try {
        if (isRateLimited(socket.id, 'editMessage')) {
          throw new Error('Edit rate limit exceeded. Please slow down.');
        }

        const messageId = payload?.messageId?.toString().trim();
        const nextContent = payload?.content?.toString().trim();

        if (!nextContent) {
          throw new Error('content is required');
        }

        if (nextContent.length > 5000) {
          throw new Error('content cannot exceed 5000 characters');
        }

        const message = await findMessageForParticipant(messageId, userId);

        if (message.senderId.toString() !== userId) {
          throw new Error('Only the sender can edit this message');
        }

        if (message.type !== 'text') {
          throw new Error('Only text messages can be edited');
        }

        if (message.deletedForEveryone) {
          throw new Error('Deleted messages cannot be edited');
        }

        message.content = nextContent;
        message.isEdited = true;
        message.editedAt = new Date();
        await message.save();

        await syncChatLastMessage(message.chatId, message);
        emitMessageUpdate(message);

        if (typeof callback === 'function') {
          callback({
            success: true,
            data: {
              message: formatMessage(message)
            }
          });
        }
      } catch (error) {
        if (typeof callback === 'function') {
          callback({
            success: false,
            message: error.message || 'Failed to edit message'
          });
        }
      }
    });

    socket.on('deleteMessage', async (payload, callback) => {
      try {
        if (isRateLimited(socket.id, 'deleteMessage')) {
          throw new Error('Delete rate limit exceeded. Please slow down.');
        }

        const messageId = payload?.messageId?.toString().trim();
        const scope = payload?.scope?.toString().trim();

        if (!['me', 'everyone'].includes(scope)) {
          throw new Error('scope must be either "me" or "everyone"');
        }

        const message = await findMessageForParticipant(messageId, userId);

        if (scope === 'everyone') {
          if (message.senderId.toString() !== userId) {
            throw new Error('Only the sender can delete for everyone');
          }

          if (message.deletedForEveryone) {
            throw new Error('Message has already been deleted for everyone');
          }

          message.deletedForEveryone = true;
          message.deletedAt = new Date();
          message.isEdited = false;
          message.editedAt = null;
          await message.save();

          await syncChatLastMessage(message.chatId, message);
          emitMessageUpdate(message);

          if (typeof callback === 'function') {
            callback({
              success: true,
              data: {
                message: formatMessage(message),
                scope
              }
            });
          }

          return;
        }

        const alreadyDeletedForUser = (message.deletedFor || []).some((value) => value.toString() === userId);

        if (alreadyDeletedForUser) {
          throw new Error('Message has already been deleted for you');
        }

        message.deletedFor = [...(message.deletedFor || []), new mongoose.Types.ObjectId(userId)];
        await message.save();
        await maybeHardDeleteMessage(message);
        emitMessageRemovedForUser(userId, message);

        if (typeof callback === 'function') {
          callback({
            success: true,
            data: {
              messageId: message._id.toString(),
              chatId: message.chatId?.toString() || '',
              scope
            }
          });
        }
      } catch (error) {
        if (typeof callback === 'function') {
          callback({
            success: false,
            message: error.message || 'Failed to delete message'
          });
        }
      }
    });

    // Handle joining a conversation (mark messages as seen)
    socket.on('conversation:join', async (payload) => {
      const partnerId = payload?.partnerId?.toString().trim();

      if (!partnerId || !mongoose.Types.ObjectId.isValid(partnerId)) {
        return;
      }

      setActiveConversation(userId, partnerId);

      const unseenMessages = await Message.find({
        senderId: partnerId,
        receiverId: userId,
        deletedForEveryone: false,
        status: { $in: ['sent', 'delivered'] }
      }).sort({ createdAt: 1 });

      if (unseenMessages.length === 0) {
        return;
      }

      await markMessagesAsSeen(unseenMessages);

      unseenMessages.forEach((message) => {
        const statusPayload = {
          messageId: message._id.toString(),
          status: message.status,
          deliveredAt: message.deliveredAt,
          seenAt: message.seenAt
        };

        emitMessageStatusUpdate(userId, statusPayload);
        emitMessageStatusUpdate(partnerId, statusPayload);
      });
    });

    // Handle joining a chat room
    socket.on('chat:join', async (payload) => {
      const chatId = payload?.chatId?.toString().trim();

      if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
        return;
      }

      const chat = await Chat.exists({
        _id: chatId,
        participants: userId
      });

      if (!chat) {
        return;
      }

      socket.join(getChatRoom(chatId));
    });

    // Handle leaving a chat room
    socket.on('chat:leave', (payload) => {
      const chatId = payload?.chatId?.toString().trim();

      if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
        return;
      }

      socket.leave(getChatRoom(chatId));
    });

    // Handle leaving a conversation
    socket.on('conversation:leave', (payload) => {
      const partnerId = payload?.partnerId?.toString().trim();
      clearActiveConversation(userId, partnerId);
    });

    // Handle typing start
    socket.on('typing:start', (payload) => {
      if (isRateLimited(socket.id, 'typing:start')) {
        return;
      }

      const partnerId = payload?.partnerId?.toString().trim();

      if (!partnerId || !mongoose.Types.ObjectId.isValid(partnerId)) {
        return;
      }

      emitTypingUpdate(partnerId, {
        userId,
        partnerId,
        isTyping: true
      });
    });

    // Handle typing stop
    socket.on('typing:stop', (payload) => {
      if (isRateLimited(socket.id, 'typing:stop')) {
        return;
      }

      const partnerId = payload?.partnerId?.toString().trim();

      if (!partnerId || !mongoose.Types.ObjectId.isValid(partnerId)) {
        return;
      }

      emitTypingUpdate(partnerId, {
        userId,
        partnerId,
        isTyping: false
      });
    });

    socket.on('typing', (payload) => {
      if (isRateLimited(socket.id, 'typing:start')) {
        return;
      }

      const partnerId = payload?.partnerId?.toString().trim();

      if (!partnerId || !mongoose.Types.ObjectId.isValid(partnerId)) {
        return;
      }

      emitTypingUpdate(partnerId, {
        userId,
        partnerId,
        isTyping: true
      });
    });

    // Handle marking conversation as seen
    socket.on('markConversationSeen', async (payload) => {
      if (isRateLimited(socket.id, 'markConversationSeen')) {
        return;
      }

      const partnerId = payload?.partnerId?.toString().trim();

      if (!partnerId || !mongoose.Types.ObjectId.isValid(partnerId)) {
        return;
      }

      const unseenMessages = await Message.find({
        senderId: partnerId,
        receiverId: userId,
        deletedForEveryone: false,
        status: { $in: ['sent', 'delivered'] }
      }).sort({ createdAt: 1 });

      if (unseenMessages.length === 0) {
        return;
      }

      await markMessagesAsSeen(unseenMessages);

      unseenMessages.forEach((message) => {
        const statusPayload = {
          messageId: message._id.toString(),
          status: message.status,
          deliveredAt: message.deliveredAt,
          seenAt: message.seenAt
        };

        emitMessageStatusUpdate(userId, statusPayload);
        emitMessageStatusUpdate(partnerId, statusPayload);
      });
    });

    // Handle socket disconnection
    socket.on('disconnect', async () => {
      removeUserSocket(userId, socket.id);
      clearActiveConversation(userId);
      clearSocketRateLimit(socket.id);

      if (!isUserOnline(userId)) {
        const lastSeen = new Date();
        await User.findByIdAndUpdate(userId, { $set: { lastSeen } });
        broadcastPresence(userId, false, lastSeen);
      }
    });
  });

  return io;
};

module.exports = createSocketServer;
