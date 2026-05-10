#!/usr/bin/env node

/**
 * DEPLOY-FULL.js
 * Complete deployment script with database initialization and .env setup
 * Usage: node deploy/deploy-full.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.join(__dirname, '..');

console.log('🚀 Montenegro Marketplace - ПОЛНЫЙ ДЕПЛОЙ');
console.log('==========================================\n');

// Step 1: Install dependencies
console.log('📦 Установка зависимостей...');
try {
    execSync('npm install', { cwd: projectRoot, stdio: 'inherit' });
    console.log('✅ Зависимости установлены\n');
} catch (error) {
    console.error('❌ Ошибка установки зависимостей');
    process.exit(1);
}

// Step 2: Create .env file
console.log('⚙️  Настройка .env файла...');
const envPath = path.join(projectRoot, '.env');
const envContent = `
# Telegram Bot Configuration
BOT_TOKEN=${process.env.BOT_TOKEN || 'your_telegram_bot_token_here'}
WEBAPP_URL=${process.env.WEBAPP_URL || 'https://your-domain.com'}
ADMIN_TELEGRAM_ID=${process.env.ADMIN_TELEGRAM_ID || 'your_admin_id'}

# Server Configuration
PORT=${process.env.PORT || 3000}
NODE_ENV=production
DATABASE_URL=${process.env.DATABASE_URL || './data/marketplace.db'}

# Optional: Payment integration
STRIPE_KEY=${process.env.STRIPE_KEY || ''}
STRIPE_SECRET=${process.env.STRIPE_SECRET || ''}
`;

if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, envContent.trim());
    console.log('✅ .env файл создан');
} else {
    console.log('⏭️  .env файл уже существует');
}

// Step 3: Create data directory
console.log('\n📁 Создание директории данных...');
const dataDir = path.join(projectRoot, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('✅ Директория данных создана');
}

// Step 4: Initialize database
console.log('\n🗄️  Инициализация базы данных...');
try {
    const db = require(path.join(projectRoot, 'backend/models/database'));
    const { initializeData } = require(path.join(projectRoot, 'backend/models/Reference'));
    
    setTimeout(async () => {
        try {
            await initializeData();
            console.log('✅ База данных инициализирована');
        } catch (error) {
            console.warn('⚠️  Ошибка при инициализации данных:', error.message);
        }
    }, 1000);
} catch (error) {
    console.warn('⚠️  Не удалось инициализировать БД:', error.message);
}

// Step 5: Display configuration
console.log('\n' + '='.repeat(50));
console.log('✅ РАЗВЕРТЫВАНИЕ ЗАВЕРШЕНО');
console.log('='.repeat(50));
console.log('\n📝 Конфигурация:');
console.log(`  • Порт: ${process.env.PORT || 3000}`);
console.log(`  • БД: ${process.env.DATABASE_URL || './data/marketplace.db'}`);
console.log(`  • Среда: production`);

console.log('\n🚀 Для запуска сервера выполните:');
console.log('  npm start');

console.log('\n📚 Документация:');
console.log('  • API доступно на: http://localhost:${PORT}/api');
console.log('  • Веб-приложение: http://localhost:${PORT}');
console.log('  • Здоровье: http://localhost:${PORT}/api/health');

console.log('\n⚙️  Важные переменные окружения:');
console.log('  • BOT_TOKEN - токен вашего Telegram бота');
console.log('  • WEBAPP_URL - URL вашего веб-приложения');
console.log('  • ADMIN_TELEGRAM_ID - ID администратора');

console.log('\n💡 Для смены конфигурации отредактируйте .env файл');
console.log('\n');
