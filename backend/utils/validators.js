#!/usr/bin/env node

/**
 * Утилиты валидации
 */

const MAX_IMAGES_PER_ITEM = 5;
const MAX_IMAGE_SIZE_MB = 1.5;
const MAX_VIDEO_SIZE_MB = 15;
const MAX_TOTAL_MEDIA_SIZE_MB = 25;

function isRemoteImageUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function isBase64Image(value) {
    return typeof value === 'string' && value.startsWith('data:image/');
}

function isBase64Video(value) {
    return typeof value === 'string' && value.startsWith('data:video/');
}

/**
 * Валидировать email
 */
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/**
 * Валидировать номер телефона
 */
function validatePhone(phone) {
    const re = /^[\d\s\-\+\(\)]{7,}$/;
    return re.test(phone);
}

/**
 * Валидировать цену
 */
function validatePrice(price) {
    return typeof price === 'number' && price >= 0;
}

/**
 * Валидировать длину строки
 */
function validateLength(str, min, max) {
    return str && str.length >= min && str.length <= max;
}

/**
 * Санитизировать строку (удалить опасные символы)
 */
function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    
    return str
        .replace(/[<>]/g, '')
        .trim()
        .substring(0, 1000);
}

/**
 * Валидировать объект объявления
 */
function validateListing(data) {
    const errors = [];
    
    if (!data.title || !validateLength(data.title, 3, 100)) {
        errors.push('Title must be 3-100 characters');
    }
    
    if (!data.category_id) {
        errors.push('Category is required');
    }
    
    if (!data.city_id) {
        errors.push('City is required');
    }
    
    if (!validatePrice(data.price)) {
        errors.push('Invalid price');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

function normalizeImagesInput(images) {
    if (!images) {
        return [];
    }

    if (Array.isArray(images)) {
        return images;
    }

    if (typeof images === 'string') {
        try {
            const parsed = JSON.parse(images);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    return [];
}

function getBase64SizeInMb(base64String) {
    const payload = base64String.includes(',') ? base64String.split(',')[1] : base64String;
    const sizeInBytes = Buffer.byteLength(payload, 'base64');
    return sizeInBytes / (1024 * 1024);
}

function validateImages(images, options = {}) {
    const normalizedImages = normalizeImagesInput(images);
    const errors = [];
    const maxImages = options.maxImages || MAX_IMAGES_PER_ITEM;
    const maxVideoSizeMb = options.maxVideoSizeMb || MAX_VIDEO_SIZE_MB;
    const maxTotalMediaSizeMb = options.maxTotalMediaSizeMb || MAX_TOTAL_MEDIA_SIZE_MB;

    if (normalizedImages.length > maxImages) {
        errors.push(`Maximum ${maxImages} images are allowed`);
    }

    let totalSizeInMb = 0;

    normalizedImages.forEach((image, index) => {
        if (isRemoteImageUrl(image)) {
            return;
        }

        const isImage = isBase64Image(image);
        const isVideo = isBase64Video(image);

        if (!isImage && !isVideo) {
            errors.push(`Media ${index + 1} must be a valid image or video`);
            return;
        }

        const sizeInMb = getBase64SizeInMb(image);
        totalSizeInMb += sizeInMb;

        if (isImage && sizeInMb > MAX_IMAGE_SIZE_MB) {
            errors.push(`Image ${index + 1} exceeds ${MAX_IMAGE_SIZE_MB} MB`);
        }

        if (isVideo && sizeInMb > maxVideoSizeMb) {
            errors.push(`Video ${index + 1} exceeds ${maxVideoSizeMb} MB`);
        }
    });

    if (totalSizeInMb > maxTotalMediaSizeMb) {
        errors.push(`Total media payload exceeds ${maxTotalMediaSizeMb} MB`);
    }

    return {
        isValid: errors.length === 0,
        errors,
        images: normalizedImages
    };
}

module.exports = {
    validateEmail,
    validateImages,
    isBase64Image,
    isBase64Video,
    isRemoteImageUrl,
    normalizeImagesInput,
    validatePhone,
    validatePrice,
    validateLength,
    sanitizeString,
    validateListing
};
