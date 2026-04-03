const formatPresence = ({ userId, isOnline, lastSeen = null }) => ({
  userId,
  isOnline,
  lastSeen
});

module.exports = {
  formatPresence
};
