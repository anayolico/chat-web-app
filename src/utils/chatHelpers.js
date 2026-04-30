const mongoose = require('mongoose');

const Chat = require('../models/Chat');
const Message = require('../models/Message');
const { isUserOnline } = require('../socket/socketState');

const buildParticipantsKey = (userIds) =>
  [...userIds].map((userId) => userId.toString()).sort().join(':');

const isBlockedByUser = (user, targetUserId) =>
  (user?.blockedUsers || []).some((blockedUserId) => blockedUserId?.toString() === targetUserId?.toString());

const formatChatUser = (user, viewer = null) => {
  const userId = user._id.toString();
  const isOnline = isUserOnline(userId);
  const isBlocked = viewer ? isBlockedByUser(viewer, userId) : false;
  const viewerIsBlocked = viewer ? isBlockedByUser(user, viewer._id) : false;
  const showOnlineStatus = user.privacy?.showOnlineStatus !== false && !isBlocked && !viewerIsBlocked;
  const showLastSeen = user.privacy?.showLastSeen !== false && !isBlocked && !viewerIsBlocked;

  return {
    id: userId,
    name: user.name,
    profilePic: user.profilePic || '',
    status: showOnlineStatus && isOnline ? 'online' : 'offline',
    isOnline: showOnlineStatus ? isOnline : false,
    lastSeen: showLastSeen ? user.lastSeen || null : null,
    phone: user.phone || '',
    createdAt: user.createdAt || null,
    privacy: {
      showLastSeen: user.privacy?.showLastSeen !== false,
      showOnlineStatus: user.privacy?.showOnlineStatus !== false,
      allowReadReceipts: user.privacy?.allowReadReceipts !== false
    },
    isBlocked,
    viewerIsBlocked
  };
};

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

const formatChat = (chat, currentUser, unreadCount = 0) => {
  const currentUserId = currentUser?._id?.toString() || currentUser?.toString() || '';
  const participants = (chat.participants || []).map((participant) => formatChatUser(participant, currentUser));
  const partner = participants.find((participant) => participant.id !== currentUserId) || null;
  const isGroupChat = chat.kind === 'group';
  const summaryUser = isGroupChat
    ? {
        id: chat._id.toString(),
        kind: 'group',
        name: chat.name || 'Untitled group',
        profilePic: '',
        phone: '',
        isOnline: false,
        lastSeen: null,
        memberCount: participants.length,
        participants
      }
    : partner;

  return {
    id: chat._id.toString(),
    kind: chat.kind || 'direct',
    name: isGroupChat ? chat.name || 'Untitled group' : chat.name || partner?.name || '',
    participants,
    user: summaryUser,
    groupOwnerId: chat.groupOwnerId?.toString() || '',
    memberCount: participants.length,
    isPinned: (chat.pinnedBy || []).some((userId) => userId.toString() === currentUserId),
    isSecure: Boolean(chat.isSecure),
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
    updatedAt: chat.updatedAt,
    unreadCount: Number.isFinite(unreadCount) ? unreadCount : 0
  };
};

const accessChatForUsers = async (currentUserId, otherUserId) => {
  const participants = [currentUserId, otherUserId].map((value) => new mongoose.Types.ObjectId(value));
  const participantsKey = buildParticipantsKey(participants);

  let chat = await Chat.findOne({ participantsKey }).populate(
    'participants',
    'name phone profilePic lastSeen createdAt privacy blockedUsers'
  );

  if (!chat) {
    chat = await Chat.create({
      participants,
      participantsKey
    });

    chat = await Chat.findById(chat._id).populate(
      'participants',
      'name phone profilePic lastSeen createdAt privacy blockedUsers'
    );
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
      chat = await Chat.findById(chat._id).populate(
        'participants',
        'name phone profilePic lastSeen createdAt privacy blockedUsers'
      );
    }
  }

  return chat;
};

const createGroupChat = async ({ creatorId, memberIds, name }) => {
  const uniqueParticipantIds = Array.from(new Set([creatorId.toString(), ...memberIds.map((memberId) => memberId.toString())]));
  const participants = uniqueParticipantIds.map((value) => new mongoose.Types.ObjectId(value));

  const chat = await Chat.create({
    kind: 'group',
    name: String(name || '').trim(),
    participants,
    participantsKey: `group:${new mongoose.Types.ObjectId().toString()}`,
    groupOwnerId: creatorId
  });

  return Chat.findById(chat._id).populate(
    'participants',
    'name phone profilePic lastSeen createdAt privacy blockedUsers'
  );
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
  createGroupChat,
  formatChat,
  formatChatUser,
  syncChatLastMessage,
  syncChatLastMessageFromHistory
};
