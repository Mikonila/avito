#!/usr/bin/env node

/**
 * Создание администратора и тестовых данных
 * Usage: node backend/seed-db.js
 */

require('dotenv').config();
const db = require('./models/database');
const { getCategories, getCities } = require('./models/Reference');
const Listing = require('./models/Listing');
const User = require('./models/User');
const { v4: uuidv4 } = require('uuid');

async function seedDatabase() {
    console.log('🌱 Добавление тестовых данных...\n');

    try {
        // Create test user
        const testUser = await User.create('123456789', {
            first_name: 'Test',
            last_name: 'User',
            username: 'testuser'
        });

        console.log('✅ Создан тестовый пользователь:', testUser.id);

        // Get categories and cities
        const categories = await getCategories();
        const cities = await getCities();

        if (categories.length === 0 || cities.length === 0) {
            console.warn('⚠️  Категории или города не найдены');
            return;
        }

        // Create test listings
        const testListings = [
            {
                title: 'iPhone 14 Pro',
                description: 'Скоро новый iPhone в отличном состоянии',
                price: 799,
                category_id: categories[0].id,
                city_id: cities[0].id
            },
            {
                title: 'Диван 3-местный',
                description: 'Удобный диван для гостиной',
                price: 350,
                category_id: categories[3].id,
                city_id: cities[1].id
            },
            {
                title: 'Велосипед горный',
                description: 'Горный велосипед, хорошее состояние',
                price: 250,
                category_id: categories[7].id,
                city_id: cities[2].id
            }
        ];

        for (const listing of testListings) {
            await Listing.create(testUser.id, listing);
        }

        console.log('✅ Созданы 3 тестовых объявления\n');
        
        console.log('Тестовые данные успешно добавлены!');
        console.log('\nДанные для тестирования:');
        console.log('  User ID:', testUser.id);
        console.log('  Telegram ID:', testUser.telegram_id);
        console.log('  Username:', testUser.username);
        console.log('  Город:', testUser.city);

        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка при добавлении данных:', error);
        process.exit(1);
    }
}

seedDatabase();
