#!/usr/bin/env node

/**
 * Инициализация базы данных с начальными данными
 * Usage: node backend/init-db.js
 */

require('dotenv').config();
const db = require('./models/database');
const { initializeData } = require('./models/Reference');

async function initialize() {
    console.log('🗄️  Инициализация базы данных...\n');

    try {
        await initializeData();
        
        console.log('\n✅ База данных успешно инициализирована!\n');
        console.log('Инициализировано:');
        console.log('  ✓ Таблица пользователей');
        console.log('  ✓ Таблица объявлений');
        console.log('  ✓ Таблица услуг');
        console.log('  ✓ Таблица категорий (12 категорий)');
        console.log('  ✓ Таблица городов (10 городов)');
        console.log('  ✓ Таблица премиум-объявлений');
        console.log('  ✓ Таблица транзакций\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка при инициализации:', error);
        process.exit(1);
    }
}

initialize();
