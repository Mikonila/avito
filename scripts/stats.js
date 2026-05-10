#!/usr/bin/env node

require('dotenv').config();
const db = require('../backend/models/database');

async function getScalar(sql) {
  const row = await db.get(sql);
  const value = row ? Object.values(row)[0] : 0;
  return Number(value || 0);
}

async function getStats() {
  return {
    users: await getScalar('SELECT COUNT(*) as count FROM users'),
    listings: await getScalar('SELECT COUNT(*) as count FROM listings'),
    services: await getScalar('SELECT COUNT(*) as count FROM services'),
    listingsTotalPrice: await getScalar('SELECT COALESCE(SUM(price), 0) as total FROM listings'),
    servicesTotalPrice: await getScalar('SELECT COALESCE(SUM(price), 0) as total FROM services')
  };
}

async function main() {
  console.log('📊 Статистика приложения Montenegro Marketplace\n');
  console.log('='.repeat(50));

  const stats = await getStats();

  console.log(`👥 Пользователей:          ${stats.users}`);
  console.log(`📦 Объявлений товаров:     ${stats.listings}`);
  console.log(`🔧 Услуг:                  ${stats.services}`);
  console.log(`💰 Сумма объявлений:       ${stats.listingsTotalPrice.toFixed(2)} EUR`);
  console.log(`💰 Сумма услуг:            ${stats.servicesTotalPrice.toFixed(2)} EUR`);
  console.log('='.repeat(50));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Не удалось получить статистику:', error);
    process.exit(1);
  });
