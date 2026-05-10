#!/usr/bin/env node

/**
 * Скрипт для очистки логов
 * Usage: node scripts/clean-logs.js
 */

const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '../logs');

if (!fs.existsSync(logsDir)) {
    console.log('Директория логов не найдена');
    process.exit(0);
}

try {
    const files = fs.readdirSync(logsDir);
    
    files.forEach(file => {
        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);
        const fileSize = stats.size / 1024; // KB
        
        // Очистить файлы больше 10MB
        if (fileSize > 10 * 1024) {
            fs.writeFileSync(filePath, '');
            console.log(`🗑️  Очищен лог: ${file}`);
        }
    });
    
    console.log('✅ Логи очищены');
} catch (error) {
    console.error('❌ Ошибка при очистке логов:', error.message);
    process.exit(1);
}
