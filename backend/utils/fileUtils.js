#!/usr/bin/env node

/**
 * Утилиты для работы с изображениями и файлами
 */

const fs = require('fs');
const path = require('path');

/**
 * Конвертировать base64 в файл
 */
function base64ToFile(base64String, fileName) {
    try {
        const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        
        if (!matches || matches.length !== 3) {
            throw new Error('Invalid base64 format');
        }
        
        const type = matches[1];
        const data = matches[2];
        const buffer = Buffer.from(data, 'base64');
        
        const uploadsDir = path.join(__dirname, '../../uploads');
        
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        
        const filePath = path.join(uploadsDir, fileName);
        fs.writeFileSync(filePath, buffer);
        
        return `/uploads/${fileName}`;
    } catch (error) {
        console.error('Error converting base64:', error);
        throw error;
    }
}

/**
 * Удалить файл
 */
function deleteFile(fileName) {
    try {
        const filePath = path.join(__dirname, '../../uploads', fileName);
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Error deleting file:', error);
        return false;
    }
}

/**
 * Генерировать уникальное имя файла
 */
function generateFileName(originalName) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    const ext = path.extname(originalName);
    
    return `${timestamp}-${random}${ext}`;
}

/**
 * Валидировать размер файла
 */
function validateFileSize(base64String, maxSizeInMB = 5) {
    const sizeInBytes = Buffer.byteLength(base64String, 'utf8');
    const sizeInMB = sizeInBytes / (1024 * 1024);
    
    return sizeInMB <= maxSizeInMB;
}

module.exports = {
    base64ToFile,
    deleteFile,
    generateFileName,
    validateFileSize
};
