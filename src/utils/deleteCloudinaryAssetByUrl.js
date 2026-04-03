const cloudinary = require('../config/cloudinary');

const RESOURCE_TYPES = ['image', 'video', 'raw'];

const getPublicIdCandidates = (assetUrl) => {
  if (!assetUrl) {
    return [];
  }

  try {
    const { pathname } = new URL(assetUrl);
    const uploadMarker = '/upload/';
    const uploadIndex = pathname.indexOf(uploadMarker);

    if (uploadIndex === -1) {
      return [];
    }

    const afterUpload = pathname.slice(uploadIndex + uploadMarker.length);
    const pathSegments = afterUpload.split('/').filter(Boolean);
    const publicIdSegments = pathSegments[0]?.match(/^v\d+$/) ? pathSegments.slice(1) : pathSegments;
    const publicId = decodeURIComponent(publicIdSegments.join('/'));

    if (!publicId) {
      return [];
    }

    const withoutExtension = publicId.replace(/\.[^/.]+$/, '');
    return [...new Set([publicId, withoutExtension].filter(Boolean))];
  } catch (_error) {
    return [];
  }
};

const getResourceTypes = (assetUrl) => {
  if (!assetUrl) {
    return RESOURCE_TYPES;
  }

  try {
    const { pathname } = new URL(assetUrl);

    if (pathname.includes('/image/upload/')) {
      return ['image'];
    }

    if (pathname.includes('/video/upload/')) {
      return ['video'];
    }

    if (pathname.includes('/raw/upload/')) {
      return ['raw'];
    }
  } catch (_error) {
    return RESOURCE_TYPES;
  }

  return RESOURCE_TYPES;
};

const deleteCloudinaryAssetByUrl = async (assetUrl) => {
  const publicIdCandidates = getPublicIdCandidates(assetUrl);

  if (!publicIdCandidates.length) {
    return;
  }

  const resourceTypes = getResourceTypes(assetUrl);
  let lastError = null;

  for (const resourceType of resourceTypes) {
    for (const publicId of publicIdCandidates) {
      try {
        const result = await cloudinary.uploader.destroy(publicId, {
          invalidate: true,
          resource_type: resourceType
        });

        if (result?.result === 'ok' || result?.result === 'not found') {
          return;
        }
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }
};

module.exports = deleteCloudinaryAssetByUrl;
