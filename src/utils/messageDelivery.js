const User = require('../models/User');
const { formatMessage } = require('./messageFormatter');
const { emitToUser, getActiveChat, isUserOnline } = require('../socket/socketState');

const syncAggregateStatus = (message) => {
  const receipts = message.statusByUser || [];

  if (receipts.length === 0) {
    message.status = 'sent';
    message.deliveredAt = null;
    message.seenAt = null;
    return;
  }

  if (receipts.every((receipt) => receipt.status === 'seen')) {
    const seenTimestamps = receipts.map((receipt) => receipt.seenAt).filter(Boolean);
    const latestSeenAt = seenTimestamps.length
      ? new Date(Math.max(...seenTimestamps.map((value) => new Date(value).getTime())))
      : null;

    message.status = 'seen';
    message.deliveredAt = latestSeenAt;
    message.seenAt = latestSeenAt;
    return;
  }

  if (receipts.some((receipt) => ['delivered', 'seen'].includes(receipt.status))) {
    const deliveredTimestamps = receipts
      .map((receipt) => receipt.deliveredAt || receipt.seenAt)
      .filter(Boolean);
    const latestDeliveredAt = deliveredTimestamps.length
      ? new Date(Math.max(...deliveredTimestamps.map((value) => new Date(value).getTime())))
      : null;

    message.status = 'delivered';
    message.deliveredAt = latestDeliveredAt;
    message.seenAt = null;
    return;
  }

  message.status = 'sent';
  message.deliveredAt = null;
  message.seenAt = null;
};

const updateReceipt = (message, userId, nextStatus, timestamp) => {
  const receipt = (message.statusByUser || []).find((entry) => entry.userId?.toString() === userId.toString());

  if (!receipt) {
    return;
  }

  receipt.status = nextStatus;
  if (nextStatus === 'delivered') {
    receipt.deliveredAt = timestamp;
  }
  if (nextStatus === 'seen') {
    receipt.deliveredAt = timestamp;
    receipt.seenAt = timestamp;
  }
};

const buildReceiptUpdate = (message) => ({
  messageId: message._id.toString(),
  status: message.status,
  deliveredAt: message.deliveredAt,
  seenAt: message.seenAt || null
});

const emitStatusUpdate = (userId, payload) => {
  emitToUser(userId, 'messageStatusUpdated', payload);
  emitToUser(userId, 'message_status_updated', payload);
};

const markMessagesAsDelivered = async (messages, recipientId) => {
  if (messages.length === 0 || !recipientId) {
    return;
  }

  const deliveredAt = new Date();

  await Promise.all(
    messages.map((message) =>
      message.constructor.updateOne(
        { _id: message._id, 'statusByUser.userId': recipientId },
        {
          $set: {
            'statusByUser.$.status': 'delivered',
            'statusByUser.$.deliveredAt': deliveredAt
          }
        }
      )
    )
  );

  messages.forEach((message) => {
    updateReceipt(message, recipientId, 'delivered', deliveredAt);
    syncAggregateStatus(message);
  });
};

const markMessagesAsSeen = async (messages, viewerId) => {
  if (messages.length === 0 || !viewerId) {
    return;
  }

  const seenAt = new Date();

  await Promise.all(
    messages.map((message) =>
      message.constructor.updateOne(
        { _id: message._id, 'statusByUser.userId': viewerId },
        {
          $set: {
            'statusByUser.$.status': 'seen',
            'statusByUser.$.deliveredAt': seenAt,
            'statusByUser.$.seenAt': seenAt
          }
        }
      )
    )
  );

  messages.forEach((message) => {
    updateReceipt(message, viewerId, 'seen', seenAt);
    syncAggregateStatus(message);
  });
};

const deliverMessageIfOnline = async (message, options = {}) => {
  const senderId = message.senderId.toString();
  const chatId = message.chatId?.toString() || '';
  const formattedMessage = options.formattedMessage || formatMessage(message);
  const recipientIds = (message.statusByUser || []).map((receipt) => receipt.userId?.toString()).filter(Boolean);

  if (recipientIds.length === 0) {
    return false;
  }

  let deliveredToAnyone = false;

  for (const recipientId of recipientIds) {
    if (!isUserOnline(recipientId)) {
      continue;
    }

    deliveredToAnyone = true;
    await markMessagesAsDelivered([message], recipientId);
    emitToUser(recipientId, 'receiveMessage', formattedMessage);
    emitToUser(recipientId, 'receive_message', formattedMessage);
    emitStatusUpdate(senderId, buildReceiptUpdate(message));

    if (getActiveChat(recipientId) !== chatId) {
      continue;
    }

    let shouldEmitSeenUpdate = true;

    if (message.receiverId?.toString() === recipientId) {
      const receiver = await User.findById(recipientId).select('privacy.allowReadReceipts');
      shouldEmitSeenUpdate = receiver?.privacy?.allowReadReceipts !== false;
    }

    await markMessagesAsSeen([message], recipientId);
    emitStatusUpdate(recipientId, buildReceiptUpdate(message));

    if (shouldEmitSeenUpdate) {
      emitStatusUpdate(senderId, buildReceiptUpdate(message));
    }
  }

  return deliveredToAnyone;
};

module.exports = {
  deliverMessageIfOnline,
  markMessagesAsDelivered,
  markMessagesAsSeen
};
