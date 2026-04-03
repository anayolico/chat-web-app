const fs = require('fs');
const path = require('path');

const uploadsDirectory = path.resolve(__dirname, '../../uploads');

const sanitizeFileNamePart = (value = '') =>
  value
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

const ensureUploadsDirectory = () => {
  fs.mkdirSync(uploadsDirectory, { recursive: true });
};

const buildStoredFileName = (originalName = 'file') => {
  const extension = path.extname(originalName);
  const baseName = path.basename(originalName, extension);
  const safeBaseName = sanitizeFileNamePart(baseName) || 'file';
  const safeExtension = sanitizeFileNamePart(extension).replace(/^-+/, '');
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).slice(2, 8);

  return safeExtension ? `${timestamp}-${randomSuffix}-${safeBaseName}.${safeExtension}` : `${timestamp}-${randomSuffix}-${safeBaseName}`;
};

const resolveBackendOrigin = (req) => {
  const configuredOrigin = (process.env.BACKEND_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');

  if (configuredOrigin) {
    return configuredOrigin;
  }

  return `${req.protocol}://${req.get('host')}`;
};

const buildPublicFileUrl = (req, storedFileName) =>
  `${resolveBackendOrigin(req)}/uploads/${encodeURIComponent(storedFileName)}`;

module.exports = {
  buildPublicFileUrl,
  buildStoredFileName,
  ensureUploadsDirectory,
  uploadsDirectory
};
