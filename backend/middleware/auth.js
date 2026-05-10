#!/usr/bin/env node

/**
 * Middleware для аутентификации
 * Проверяет наличие user_id в запросе
 */

function authMiddleware(req, res, next) {
    const userId = req.headers['x-user-id'] || req.body?.user_id || req.query?.user_id;
    
    if (!userId) {
        return res.status(401).json({ error: 'Не передан ID пользователя' });
    }
    
    req.userId = userId;
    next();
}

function getRequesterTelegramId(req) {
    return String(
        req.headers['x-telegram-id'] ||
        req.body?.telegram_id ||
        req.query?.telegram_id ||
        ''
    ).trim();
}

function isAdminTelegramId(telegramId) {
    return Boolean(
        telegramId &&
        process.env.ADMIN_TELEGRAM_ID &&
        String(telegramId) === String(process.env.ADMIN_TELEGRAM_ID)
    );
}

function requireAdmin(req, res, next) {
    const telegramId = getRequesterTelegramId(req);

    if (!isAdminTelegramId(telegramId)) {
        return res.status(403).json({ error: 'Требуются права администратора' });
    }

    req.isAdmin = true;
    next();
}

/**
 * Middleware для обработки ошибок
 */

function errorHandler(err, req, res, next) {
    console.error('Error:', err);
    
    res.status(err.status || 500).json({
        error: err.message || 'Внутренняя ошибка сервера',
        timestamp: new Date().toISOString()
    });
}

/**
 * Middleware для логирования
 */

function requestLogger(req, res, next) {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    });
    
    next();
}

module.exports = {
    authMiddleware,
    errorHandler,
    getRequesterTelegramId,
    isAdminTelegramId,
    requireAdmin,
    requestLogger
};
