const { Readable } = require('stream');

const cloudinary = require('../config/cloudinary');

const uploadFileToCloudinary = (fileBuffer, options) =>
  new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });

    Readable.from(fileBuffer).pipe(uploadStream);
  });

module.exports = uploadFileToCloudinary;
