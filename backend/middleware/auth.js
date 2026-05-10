#!/usr/bin/env node

/**
 * Middleware для аутентификации
 * Проверяет наличие user_id в запросе
 */

function authMiddleware(req, res, next) {
    const userId = req.headers['x-user-id'] || req.body?.user_id || req.query?.user_id;
    
    if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
    }
    
    req.userId = userId;
    next();
}

/**
 * Middleware для обработки ошибок
 */

function errorHandler(err, req, res, next) {
    console.error('Error:', err);
    
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
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
    requestLogger
};
