#!/usr/bin/env node

/**
 * DEPLOY-MINIMAL.js
 * Minimal deployment script (without database initialization)
 * Use this when deploying to a server with existing database
 * Usage: node deploy/deploy-minimal.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.join(__dirname, '..');

console.log('🚀 Montenegro Marketplace - МИНИМАЛЬНЫЙ ДЕПЛОЙ');
console.log('=============================================\n');

// Step 1: Install dependencies
console.log('📦 Установка зависимостей...');
try {
    execSync('npm install --production', { cwd: projectRoot, stdio: 'inherit' });
    console.log('✅ Зависимости установлены\n');
} catch (error) {
    console.error('❌ Ошибка установки зависимостей');
    process.exit(1);
}

// Step 2: Check .env file
console.log('⚙️  Проверка .env файла...');
const envPath = path.join(projectRoot, '.env');
if (!fs.existsSync(envPath)) {
    console.error('❌ Ошибка: .env файл не найден!');
    console.log('\nСоздайте .env файл со следующими переменными:');
    console.log(`
BOT_TOKEN=your_telegram_bot_token_here
WEBAPP_URL=https://your-domain.com
DATABASE_URL=./data/marketplace.db
PORT=3000
NODE_ENV=production
ADMIN_TELEGRAM_ID=your_admin_id
    `);
    process.exit(1);
} else {
    console.log('✅ .env файл найден');
}

// Step 3: Check database
console.log('\n🗄️  Проверка базы данных...');
const dataDir = path.join(projectRoot, 'data');
const dbPath = path.join(dataDir, 'marketplace.db');

if (!fs.existsSync(dbPath)) {
    console.warn('⚠️  Предупреждение: база данных не найдена');
    console.warn('   Убедитесь, что база данных скопирована на сервер');
} else {
    console.log('✅ База данных найдена');
}

// Step 4: Build check
console.log('\n🔨 Проверка структуры проекта...');
const requiredDirs = [
    'backend',
    'backend/routes',
    'backend/controllers',
    'backend/models',
    'frontend'
];

let allExist = true;
requiredDirs.forEach(dir => {
    if (!fs.existsSync(path.join(projectRoot, dir))) {
        console.error(`❌ Отсутствует директория: ${dir}`);
        allExist = false;
    }
});

if (allExist) {
    console.log('✅ Все необходимые директории присутствуют');
}

// Step 5: Display configuration
console.log('\n' + '='.repeat(50));
console.log('✅ МИНИМАЛЬНОЕ РАЗВЕРТЫВАНИЕ ЗАВЕРШЕНО');
console.log('='.repeat(50));

console.log('\n🚀 Для запуска сервера выполните:');
console.log('  npm start');

console.log('\n📚 Документация:');
console.log('  • API доступно на: http://localhost:3000/api');
console.log('  • Веб-приложение: http://localhost:3000');
console.log('  • Здоровье: http://localhost:3000/api/health');

console.log('\n⚠️  Убедитесь перед запуском:');
console.log('  • ✓ Скопирована база данных (data/marketplace.db)');
console.log('  • ✓ Конфигурированы переменные .env');
console.log('  • ✓ BOT_TOKEN установлен');
console.log('  • ✓ WEBAPP_URL указывает на ваш домен');

console.log('\n💾 Резервное копирование:');
console.log('  Перед началом работы сделайте резервную копию:');
console.log('  cp data/marketplace.db data/marketplace.db.backup');

console.log('\n');
