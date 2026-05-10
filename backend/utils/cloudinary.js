const { v2: cloudinary } = require('cloudinary');

const CLOUDINARY_FOLDERS = {
  listing: 'montenegro-marketplace/listings',
  service: 'montenegro-marketplace/services'
};

let configured = false;

function hasCloudinaryUrl() {
  return Boolean(process.env.CLOUDINARY_URL);
}

function hasCloudinaryKeys() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

function isCloudinaryConfigured() {
  return hasCloudinaryUrl() || hasCloudinaryKeys();
}

function ensureConfigured() {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET.'
    );
  }

  if (configured) {
    return;
  }

  if (hasCloudinaryUrl()) {
    cloudinary.config(process.env.CLOUDINARY_URL);
  } else {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
  }

  configured = true;
}

function isRemoteImageUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function isBase64Image(value) {
  return typeof value === 'string' && value.startsWith('data:image/');
}

function getFolder(entityType) {
  return CLOUDINARY_FOLDERS[entityType] || 'montenegro-marketplace/misc';
}

async function uploadImage(image, entityType) {
  ensureConfigured();

  const result = await cloudinary.uploader.upload(image, {
    folder: getFolder(entityType),
    resource_type: 'image'
  });

  return result.secure_url;
}

async function uploadImages(images, entityType) {
  const preparedImages = [];

  for (const image of images) {
    if (isRemoteImageUrl(image)) {
      preparedImages.push(image);
      continue;
    }

    if (!isBase64Image(image)) {
      throw new Error('Unsupported image format. Expected base64 image or URL.');
    }

    preparedImages.push(await uploadImage(image, entityType));
  }

  return preparedImages;
}

function extractPublicIdFromUrl(imageUrl) {
  if (!isRemoteImageUrl(imageUrl)) {
    return null;
  }

  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME || cloudinary.config().cloud_name;

  if (!cloudName || !imageUrl.includes(`/res.cloudinary.com/${cloudName}/`)) {
    return null;
  }

  const uploadMarker = '/upload/';
  const markerIndex = imageUrl.indexOf(uploadMarker);

  if (markerIndex === -1) {
    return null;
  }

  let publicPath = imageUrl.slice(markerIndex + uploadMarker.length);
  const pathSegments = publicPath.split('/').filter(Boolean);

  while (pathSegments.length && pathSegments[0].includes(',')) {
    pathSegments.shift();
  }

  if (pathSegments.length && /^v\d+$/.test(pathSegments[0])) {
    pathSegments.shift();
  }

  publicPath = pathSegments.join('/');
  publicPath = publicPath.replace(/\.[^./?#]+(?:\?.*)?$/, '');

  return publicPath || null;
}

async function destroyImage(imageUrl) {
  const publicId = extractPublicIdFromUrl(imageUrl);

  if (!publicId) {
    return false;
  }

  ensureConfigured();
  await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  return true;
}

async function destroyImages(imageUrls = []) {
  for (const imageUrl of imageUrls) {
    try {
      await destroyImage(imageUrl);
    } catch (error) {
      console.error(`Failed to remove Cloudinary image ${imageUrl}:`, error.message);
    }
  }
}

module.exports = {
  destroyImages,
  isBase64Image,
  isCloudinaryConfigured,
  isRemoteImageUrl,
  uploadImages
};
