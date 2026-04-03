const mongoose = require('mongoose');

const Chat = require('../models/Chat');
const Message = require('../models/Message');
const { isUserOnline } = require('../socket/socketState');

const buildParticipantsKey = (userIds) =>
  [...userIds].map((userId) => userId.toString()).sort().join(':');

const formatChatUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  profilePic: user.profilePic || '',
  status: isUserOnline(user._id.toString()) ? 'online' : 'offline',
  isOnline: isUserOnline(user._id.toString()),
  lastSeen: user.lastSeen || null,
  phone: user.phone || '',
  createdAt: user.createdAt || null
});

const buildLastMessagePreview = (message) => {
  if (!message) {
    return null;
  }

  if (message.deletedForEveryone) {
    return {
      senderId: message.senderId?.toString() || null,
      content: 'This message was deleted',
      type: message.type || 'text',
      mediaUrl: '',
      fileName: '',
      createdAt: message.createdAt || new Date()
    };
  }

  return {
    senderId: message.senderId?.toString() || null,
    content: message.content || '',
    type: message.type || 'text',
    mediaUrl: message.mediaUrl || '',
    fileName: message.fileName || '',
    createdAt: message.createdAt || new Date()
  };
};

const formatChat = (chat, currentUserId) => {
  const participants = (chat.participants || []).map(formatChatUser);
  const partner =
    participants.find((participant) => participant.id !== currentUserId.toString()) || null;

  return {
    id: chat._id.toString(),
    participants,
    user: partner,
    lastMessage: chat.lastMessage?.createdAt
      ? {
          senderId: chat.lastMessage.senderId?.toString() || null,
          content: chat.lastMessage.content || '',
          type: chat.lastMessage.type || 'text',
          mediaUrl: chat.lastMessage.mediaUrl || '',
          fileName: chat.lastMessage.fileName || '',
          createdAt: chat.lastMessage.createdAt
        }
      : null,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt
  };
};

const accessChatForUsers = async (currentUserId, otherUserId) => {
  const participants = [currentUserId, otherUserId].map((value) => new mongoose.Types.ObjectId(value));
  const participantsKey = buildParticipantsKey(participants);

  let chat = await Chat.findOne({ participantsKey }).populate('participants', 'name phone profilePic lastSeen createdAt');

  if (!chat) {
    chat = await Chat.create({
      participants,
      participantsKey
    });

    chat = await Chat.findById(chat._id).populate('participants', 'name phone profilePic lastSeen createdAt');
  }

  if (!chat.lastMessage?.createdAt) {
    const [firstParticipantId, secondParticipantId] = participants.map((participant) => participant.toString());
    const latestMessage = await Message.findOne({
      $or: [
        {
          senderId: firstParticipantId,
          receiverId: secondParticipantId
        },
        {
          senderId: secondParticipantId,
          receiverId: firstParticipantId
        }
      ]
    }).sort({ createdAt: -1 });

    if (latestMessage) {
      await Message.updateMany(
        {
          $or: [
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
          $set: {
            chatId: chat._id
          }
        }
      );

      await syncChatLastMessage(chat._id, latestMessage);
      chat = await Chat.findById(chat._id).populate('participants', 'name phone profilePic lastSeen createdAt');
    }
  }

  return chat;
};

const syncChatLastMessage = async (chatId, message) => {
  if (!chatId || !message) {
    return;
  }

  const preview = buildLastMessagePreview(message);

  await Chat.findByIdAndUpdate(chatId, {
    $set: {
      lastMessage: preview,
      updatedAt: message.createdAt || new Date()
    }
  });
};

const syncChatLastMessageFromHistory = async (chatId) => {
  if (!chatId) {
    return;
  }

  const latestMessage = await Message.findOne({ chatId }).sort({ createdAt: -1 });

  if (!latestMessage) {
    await Chat.findByIdAndUpdate(chatId, {
      $set: {
        lastMessage: {
          senderId: null,
          content: '',
          type: 'text',
          mediaUrl: '',
          fileName: '',
          createdAt: null
        },
        updatedAt: new Date()
      }
    });
    return;
  }

  await syncChatLastMessage(chatId, latestMessage);
};

module.exports = {
  accessChatForUsers,
  buildParticipantsKey,
  formatChat,
  formatChatUser,
  syncChatLastMessage,
  syncChatLastMessageFromHistory
};
