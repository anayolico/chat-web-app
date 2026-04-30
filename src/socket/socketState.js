let ioInstance = null;

const onlineUsers = new Map();
const activeConversations = new Map();
const activeChats = new Map();

const setSocketServer = (io) => {
  ioInstance = io;
};

const getSocketServer = () => ioInstance;

const addUserSocket = (userId, socketId) => {
  const activeSockets = onlineUsers.get(userId) || new Set();
  activeSockets.add(socketId);
  onlineUsers.set(userId, activeSockets);
};

const removeUserSocket = (userId, socketId) => {
  const activeSockets = onlineUsers.get(userId);

  if (!activeSockets) {
    return;
  }

  activeSockets.delete(socketId);

  if (activeSockets.size === 0) {
    onlineUsers.delete(userId);
  }
};

const isUserOnline = (userId) => onlineUsers.has(userId);

const setActiveConversation = (userId, partnerId) => {
  if (!partnerId) {
    activeConversations.delete(userId);
    return;
  }

  activeConversations.set(userId, partnerId);
};

const clearActiveConversation = (userId, partnerId) => {
  const currentPartnerId = activeConversations.get(userId);

  if (!currentPartnerId) {
    return;
  }

  if (!partnerId || currentPartnerId === partnerId) {
    activeConversations.delete(userId);
  }
};

const getActiveConversation = (userId) => activeConversations.get(userId) || null;

const setActiveChat = (userId, chatId) => {
  if (!chatId) {
    activeChats.delete(userId);
    return;
  }

  activeChats.set(userId, chatId);
};

const clearActiveChat = (userId, chatId) => {
  const currentChatId = activeChats.get(userId);

  if (!currentChatId) {
    return;
  }

  if (!chatId || currentChatId === chatId) {
    activeChats.delete(userId);
  }
};

const getActiveChat = (userId) => activeChats.get(userId) || null;

const emitToUser = (userId, eventName, payload) => {
  if (!ioInstance) {
    return;
  }

  ioInstance.to(userId).emit(eventName, payload);
};

module.exports = {
  addUserSocket,
  clearActiveChat,
  emitToUser,
  getActiveChat,
  getActiveConversation,
  getSocketServer,
  isUserOnline,
  removeUserSocket,
  clearActiveConversation,
  setActiveChat,
  setActiveConversation,
  setSocketServer
};
