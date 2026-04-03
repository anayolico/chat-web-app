const WINDOW_MS = 10 * 1000;

const eventLimits = {
  sendMessage: 20,
  editMessage: 20,
  deleteMessage: 20,
  'typing:start': 30,
  'typing:stop': 30,
  markConversationSeen: 30
};

const socketEventHistory = new Map();

const isRateLimited = (socketId, eventName) => {
  const limit = eventLimits[eventName];

  if (!limit) {
    return false;
  }

  const now = Date.now();
  const socketHistory = socketEventHistory.get(socketId) || {};
  const eventHistory = (socketHistory[eventName] || []).filter((timestamp) => now - timestamp < WINDOW_MS);

  if (eventHistory.length >= limit) {
    socketHistory[eventName] = eventHistory;
    socketEventHistory.set(socketId, socketHistory);
    return true;
  }

  eventHistory.push(now);
  socketHistory[eventName] = eventHistory;
  socketEventHistory.set(socketId, socketHistory);
  return false;
};

const clearSocketRateLimit = (socketId) => {
  socketEventHistory.delete(socketId);
};

module.exports = {
  clearSocketRateLimit,
  isRateLimited
};
