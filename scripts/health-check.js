#!/usr/bin/env node

/**
 * Скрипт для проверки здоровья приложения
 * Usage: node scripts/health-check.js
 */

require('dotenv').config();
const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = 'localhost';

console.log('🏥 Проверка здоровья приложения...\n');

// Проверить API здоровья
http.get(`http://${HOST}:${PORT}/api/health`, (res) => {
    let data = '';
    
    res.on('data', chunk => {
        data += chunk;
    });
    
    res.on('end', () => {
        if (res.statusCode === 200) {
            console.log('✅ API здоров');
            console.log(`   Статус код: ${res.statusCode}`);
            
            const response = JSON.parse(data);
            console.log(`   Статус: ${response.status}`);
            console.log(`   Время: ${response.timestamp}\n`);
        } else {
            console.log(`❌ API не отвечает корректно (${res.statusCode})\n`);
            process.exit(1);
        }
        
        // Проверить категории
        http.get(`http://${HOST}:${PORT}/api/reference/categories`, (res) => {
            let data = '';
            
            res.on('data', chunk => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode === 200) {
                    const categories = JSON.parse(data);
                    console.log(`✅ Категории доступны: ${categories.length} категорий`);
                } else {
                    console.log(`❌ Ошибка при загрузке категорий (${res.statusCode})`);
                }
                
                // Проверить города
                http.get(`http://${HOST}:${PORT}/api/reference/cities`, (res) => {
                    let data = '';
                    
                    res.on('data', chunk => {
                        data += chunk;
                    });
                    
                    res.on('end', () => {
                        if (res.statusCode === 200) {
                            const cities = JSON.parse(data);
                            console.log(`✅ Города доступны: ${cities.length} городов\n`);
                            console.log('🎉 Приложение здорово и готово к работе!');
                        } else {
                            console.log(`❌ Ошибка при загрузке городов (${res.statusCode})\n`);
                            process.exit(1);
                        }
                        
                        process.exit(0);
                    });
                });
            });
        });
    });
}).on('error', (err) => {
    console.error(`❌ Ошибка подключения: ${err.message}`);
    console.error(`   Приложение не запущено на ${HOST}:${PORT}`);
    console.error(`   Используйте: npm start`);
    process.exit(1);
});
