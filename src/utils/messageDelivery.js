const Message = require('../models/Message');
const { formatMessage } = require('./messageFormatter');
const { emitToUser, getActiveConversation, isUserOnline } = require('../socket/socketState');

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
    const latestSeenAt = seenTimestamps.length ? new Date(Math.max(...seenTimestamps.map((value) => new Date(value).getTime()))) : null;
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
    message.statusByUser = [
      ...(message.statusByUser || []),
      {
        userId,
        status: nextStatus,
        deliveredAt: nextStatus !== 'sent' ? timestamp : null,
        seenAt: nextStatus === 'seen' ? timestamp : null
      }
    ];
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

const markMessagesAsDelivered = async (messages) => {
  if (messages.length === 0) {
    return;
  }

  const ids = messages.map((message) => message._id);
  const deliveredAt = new Date();

  await Promise.all(
    messages.map((message) =>
      Message.updateOne(
        { _id: message._id, 'statusByUser.userId': message.receiverId },
        {
          $set: {
            status: 'delivered',
            deliveredAt,
            'statusByUser.$.status': 'delivered',
            'statusByUser.$.deliveredAt': deliveredAt
          }
        }
      )
    )
  );

  messages.forEach((message) => {
    updateReceipt(message, message.receiverId, 'delivered', deliveredAt);
    syncAggregateStatus(message);
  });
};

const markMessagesAsSeen = async (messages) => {
  if (messages.length === 0) {
    return;
  }

  const ids = messages.map((message) => message._id);
  const seenAt = new Date();

  await Promise.all(
    messages.map((message) =>
      Message.updateOne(
        { _id: message._id, 'statusByUser.userId': message.receiverId },
        {
          $set: {
            status: 'seen',
            seenAt,
            deliveredAt: seenAt,
            'statusByUser.$.status': 'seen',
            'statusByUser.$.seenAt': seenAt,
            'statusByUser.$.deliveredAt': seenAt
          }
        }
      )
    )
  );

  messages.forEach((message) => {
    updateReceipt(message, message.receiverId, 'seen', seenAt);
    syncAggregateStatus(message);
  });
};

const deliverMessageIfOnline = async (message) => {
  const receiverId = message.receiverId.toString();
  const senderId = message.senderId.toString();

  if (!isUserOnline(receiverId)) {
    return false;
  }

  await markMessagesAsDelivered([message]);
  emitToUser(receiverId, 'receiveMessage', formatMessage(message));
  emitToUser(receiverId, 'receive_message', formatMessage(message));
  emitToUser(senderId, 'messageStatusUpdated', {
    messageId: message._id.toString(),
    status: message.status,
    deliveredAt: message.deliveredAt,
    seenAt: message.seenAt || null
  });
  emitToUser(senderId, 'message_status_updated', {
    messageId: message._id.toString(),
    status: message.status,
    deliveredAt: message.deliveredAt,
    seenAt: message.seenAt || null
  });

  if (getActiveConversation(receiverId) === senderId) {
    await markMessagesAsSeen([message]);
    emitToUser(receiverId, 'messageStatusUpdated', {
      messageId: message._id.toString(),
      status: message.status,
      deliveredAt: message.deliveredAt,
      seenAt: message.seenAt
    });
    emitToUser(receiverId, 'message_status_updated', {
      messageId: message._id.toString(),
      status: message.status,
      deliveredAt: message.deliveredAt,
      seenAt: message.seenAt
    });
    emitToUser(senderId, 'messageStatusUpdated', {
      messageId: message._id.toString(),
      status: message.status,
      deliveredAt: message.deliveredAt,
      seenAt: message.seenAt
    });
    emitToUser(senderId, 'message_status_updated', {
      messageId: message._id.toString(),
      status: message.status,
      deliveredAt: message.deliveredAt,
      seenAt: message.seenAt
    });
  }

  return true;
};

module.exports = {
  deliverMessageIfOnline,
  markMessagesAsDelivered,
  markMessagesAsSeen
};
