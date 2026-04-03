const multer = require('multer');
const { StatusCodes } = require('http-status-codes');

const ApiError = require('../utils/ApiError');

const storage = multer.memoryStorage();
const normalizeMimeType = (value) => value.split(';')[0].trim();

const allowedMimeTypes = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  audio: ['audio/webm', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'],
  file: [
    'application/pdf',
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'audio/webm',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/mp4',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/rtf',
    'text/csv',
    'text/markdown',
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/vnd.rar',
    'application/octet-stream',
    'text/plain'
  ]
};

const supportedMimeTypes = new Set(Object.values(allowedMimeTypes).flat());

const createUploader = ({ acceptedMimeTypes, maxFileSize }) =>
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
  maxFileSize: 15 * 1024 * 1024
});

const profileImageUpload = createUploader({
  acceptedMimeTypes: new Set(allowedMimeTypes.image),
  maxFileSize: 5 * 1024 * 1024
});

module.exports = {
  allowedMimeTypes,
  uploadSingleMedia: mediaUpload.single('file'),
  uploadSingleProfileImage: profileImageUpload.single('profileImage')
};
