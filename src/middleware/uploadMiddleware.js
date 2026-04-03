const multer = require('multer');
const { StatusCodes } = require('http-status-codes');

const ApiError = require('../utils/ApiError');
const { buildStoredFileName, ensureUploadsDirectory, uploadsDirectory } = require('../utils/fileStorage');

const diskStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    ensureUploadsDirectory();
    callback(null, uploadsDirectory);
  },
  filename: (_req, file, callback) => {
    callback(null, buildStoredFileName(file.originalname));
  }
});
const memoryStorage = multer.memoryStorage();
const normalizeMimeType = (value) => value.split(';')[0].trim();

const allowedMimeTypes = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  audio: ['audio/webm', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'],
  file: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'audio/webm',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/mp4',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
};

const supportedMimeTypes = new Set(Object.values(allowedMimeTypes).flat());

const createUploader = ({ acceptedMimeTypes, maxFileSize, storage }) =>
  multer({
    storage,
    limits: {
      fileSize: maxFileSize
    },
    fileFilter: (_req, file, callback) => {
      if (!acceptedMimeTypes.has(normalizeMimeType(file.mimetype))) {
        return callback(new ApiError(StatusCodes.BAD_REQUEST, 'Unsupported file type'));
      }

      return callback(null, true);
    }
  });

const mediaUpload = createUploader({
  acceptedMimeTypes: supportedMimeTypes,
  maxFileSize: 15 * 1024 * 1024,
  storage: diskStorage
});

const profileImageUpload = createUploader({
  acceptedMimeTypes: new Set(allowedMimeTypes.image),
  maxFileSize: 5 * 1024 * 1024,
  storage: memoryStorage
});

module.exports = {
  allowedMimeTypes,
  uploadSingleMedia: mediaUpload.single('file'),
  uploadSingleProfileImage: profileImageUpload.single('profileImage')
};
