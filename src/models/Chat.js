const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      }
    ],
    participantsKey: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    lastMessage: {
      senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
      },
      content: {
        type: String,
        default: ''
      },
      type: {
        type: String,
        enum: ['text', 'image', 'audio', 'file'],
        default: 'text'
      },
      mediaUrl: {
        type: String,
        default: ''
      },
      fileName: {
        type: String,
        default: ''
      },
      createdAt: {
        type: Date,
        default: null
      }
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

chatSchema.index({ participants: 1 });
chatSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('Chat', chatSchema);
