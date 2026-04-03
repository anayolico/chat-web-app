const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const deleteCloudinaryAssetByUrl = require('../utils/deleteCloudinaryAssetByUrl');

const collectUniqueAssetUrls = (urls) => [...new Set((urls || []).filter(Boolean))];

const deleteAccountData = async (userId) => {
  const chats = await Chat.find({ participants: userId }).select('_id');
  const chatIds = chats.map((chat) => chat._id);

  const relatedMessages = await Message.find({
    $or: [{ chatId: { $in: chatIds } }, { senderId: userId }, { receiverId: userId }]
  }).select('mediaUrl fileUrl');

  const user = await User.findById(userId).select('profilePic');

  const assetUrls = collectUniqueAssetUrls([
    user?.profilePic,
    ...relatedMessages.flatMap((message) => [message.mediaUrl, message.fileUrl])
  ]);

  for (const assetUrl of assetUrls) {
    await deleteCloudinaryAssetByUrl(assetUrl);
  }

  await Message.deleteMany({
    $or: [{ chatId: { $in: chatIds } }, { senderId: userId }, { receiverId: userId }]
  });
  await Chat.deleteMany({ participants: userId });
  await User.deleteOne({ _id: userId });
};

module.exports = {
  deleteAccountData
};
