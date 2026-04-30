const deriveMessageStatus = (message) => {
  const receipts = message.statusByUser || [];

  if (receipts.length === 0) {
    return {
      status: message.status || 'sent',
      deliveredAt: message.deliveredAt || null,
      seenAt: message.seenAt || null
    };
  }

  const allSeen = receipts.every((receipt) => receipt.status === 'seen');
  if (allSeen) {
    const seenTimestamps = receipts.map((receipt) => receipt.seenAt).filter(Boolean);
    const latestSeenAt = seenTimestamps.length ? new Date(Math.max(...seenTimestamps.map((value) => new Date(value).getTime()))) : null;

    return {
      status: 'seen',
      deliveredAt: latestSeenAt,
      seenAt: latestSeenAt
    };
  }

  const anyDelivered = receipts.some((receipt) => ['delivered', 'seen'].includes(receipt.status));
  if (anyDelivered) {
    const deliveredTimestamps = receipts
      .map((receipt) => receipt.deliveredAt || receipt.seenAt)
      .filter(Boolean);
    const latestDeliveredAt = deliveredTimestamps.length
      ? new Date(Math.max(...deliveredTimestamps.map((value) => new Date(value).getTime())))
      : null;

    return {
      status: 'delivered',
      deliveredAt: latestDeliveredAt,
      seenAt: null
    };
  }

  return {
    status: 'sent',
    deliveredAt: null,
    seenAt: null
  };
};

const formatMessage = (message) => {
  const isDeleted = Boolean(message.deletedForEveryone);
  const receiptStatus = deriveMessageStatus(message);

  return {
    id: message._id,
    chatId: message.chatId?.toString() || '',
    senderId: message.senderId.toString(),
    receiverId: message.receiverId?.toString() || '',
    senderName: message.senderName || message.sender?.name || '',
    content: isDeleted ? 'This message was deleted' : message.content,
    type: message.type,
    createdAt: message.createdAt,
    status: receiptStatus.status,
    delivered: ['delivered', 'seen'].includes(receiptStatus.status),
    deliveredAt: receiptStatus.deliveredAt,
    seenAt: receiptStatus.seenAt,
    seen: receiptStatus.status === 'seen',
    mediaUrl: isDeleted ? '' : message.mediaUrl || '',
    fileUrl: isDeleted ? '' : message.fileUrl || message.mediaUrl || '',
    fileName: isDeleted ? '' : message.fileName || '',
    mimeType: isDeleted ? '' : message.mimeType || '',
    fileType: isDeleted ? '' : message.fileType || message.mimeType || '',
    fileSize: message.fileSize || message.size || 0,
    size: message.size || message.fileSize || 0,
    isEdited: Boolean(message.isEdited),
    editedAt: message.editedAt || null,
    isDeleted,
    deletedAt: message.deletedAt || null,
    replyTo: message.replyTo?.messageId
      ? {
          messageId: message.replyTo.messageId?.toString() || '',
          senderId: message.replyTo.senderId?.toString() || '',
          content: message.replyTo.content || '',
          type: message.replyTo.type || 'text',
          fileName: message.replyTo.fileName || ''
        }
      : null,
    forwardedFrom: message.forwardedFrom?.messageId
      ? {
          messageId: message.forwardedFrom.messageId?.toString() || '',
          senderId: message.forwardedFrom.senderId?.toString() || '',
          name: message.forwardedFrom.name || ''
        }
      : null,
    isPinned: (message.pinnedBy || []).length > 0,
    reactions: (message.reactions || []).map((reaction) => ({
      userId: reaction.userId?.toString() || '',
      emoji: reaction.emoji || '',
      createdAt: reaction.createdAt || null
    })),
    statusByUser: (message.statusByUser || []).map((receipt) => ({
      userId: receipt.userId?.toString() || '',
      status: receipt.status || 'sent',
      deliveredAt: receipt.deliveredAt || null,
      seenAt: receipt.seenAt || null
    }))
  };
};

module.exports = {
  formatMessage
};
