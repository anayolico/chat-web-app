const mongoose = require('mongoose');

const MESSAGE_TTL_DAYS = 5;
const MESSAGE_TTL_MS = MESSAGE_TTL_DAYS * 24 * 60 * 60 * 1000;

const messageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      required: [true, 'Chat is required']
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender is required']
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Receiver is required']
    },
    content: {
      type: String,
      default: '',
      trim: true,
      maxlength: [5000, 'Message content cannot exceed 5000 characters']
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
    fileUrl: {
      type: String,
      default: ''
    },
    fileName: {
      type: String,
      default: ''
    },
    mimeType: {
      type: String,
      default: ''
    },
    fileType: {
      type: String,
      default: ''
    },
    fileSize: {
      type: Number,
      default: 0
    },
    size: {
      type: Number,
      default: 0
    },
    isEdited: {
      type: Boolean,
      default: false
    },
    editedAt: {
      type: Date,
      default: null
    },
    deletedForEveryone: {
      type: Boolean,
      default: false
    },
    deletedAt: {
      type: Date,
      default: null
    },
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    statusByUser: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        status: {
          type: String,
          enum: ['sent', 'delivered', 'seen'],
          default: 'sent'
        },
        deliveredAt: {
          type: Date,
          default: null
        },
        seenAt: {
          type: Date,
          default: null
        }
      }
    ],
    status: {
      type: String,
      enum: ['sent', 'delivered', 'seen'],
      default: 'sent'
    },
    deliveredAt: {
      type: Date,
      default: null
    },
    seenAt: {
      type: Date,
      default: null
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + MESSAGE_TTL_MS),
      required: true
    }
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false
    },
    versionKey: false
  }
);

messageSchema.index({ receiverId: 1, status: 1, createdAt: 1 });
messageSchema.index({ chatId: 1, createdAt: 1 });
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, type: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, senderId: 1, status: 1, createdAt: -1 });
messageSchema.index({ chatId: 1, deletedForEveryone: 1, createdAt: -1 });
messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Message', messageSchema);
