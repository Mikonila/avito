#!/usr/bin/env node

/**
 * Утилиты логирования
 */

const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '../../logs');

// Создать директорию логов если её нет
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Логировать ошибку
 */
function logError(error, context = '') {
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] ERROR${context ? ` (${context})` : ''}: ${error.message}\n`;
    
    console.error(message);
    
    const logFile = path.join(logsDir, 'error.log');
    fs.appendFileSync(logFile, message);
}

/**
 * Логировать информацию
 */
function logInfo(message, context = '') {
    const timestamp = new Date().toISOString();
    const fullMessage = `[${timestamp}] INFO${context ? ` (${context})` : ''}: ${message}\n`;
    
    console.log(fullMessage);
    
    const logFile = path.join(logsDir, 'app.log');
    fs.appendFileSync(logFile, fullMessage);
}

/**
 * Логировать предупреждение
 */
function logWarn(message, context = '') {
    const timestamp = new Date().toISOString();
    const fullMessage = `[${timestamp}] WARN${context ? ` (${context})` : ''}: ${message}\n`;
    
    console.warn(fullMessage);
    
    const logFile = path.join(logsDir, 'warn.log');
    fs.appendFileSync(logFile, fullMessage);
}

/**
 * Логировать API запрос
 */
function logRequest(method, path, statusCode, duration) {
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] ${method} ${path} - ${statusCode} (${duration}ms)\n`;
    
    const logFile = path.join(logsDir, 'api.log');
    fs.appendFileSync(logFile, message);
}

module.exports = {
    logError,
    logInfo,
    logWarn,
    logRequest
};
