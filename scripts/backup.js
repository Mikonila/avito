#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { isPostgresUrl } = require('../backend/models/database');

if (isPostgresUrl(process.env.DATABASE_URL)) {
  console.error('❌ Для PostgreSQL используйте managed backups Railway или pg_dump.');
  console.error('   Локальное копирование файла работает только для SQLite.');
  process.exit(1);
}

const dbPath = path.resolve(process.cwd(), process.env.DATABASE_URL || path.join('data', 'marketplace.db'));
const backupDir = path.join(process.cwd(), 'backups');

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(backupDir, `marketplace_${timestamp}.db`);

try {
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ База данных не найдена: ${dbPath}`);
    process.exit(1);
  }

  fs.copyFileSync(dbPath, backupFile);
  console.log(`✅ Бэкап создан: ${backupFile}`);
  console.log(`📊 Размер: ${fs.statSync(backupFile).size} байт`);

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  fs.readdirSync(backupDir).forEach((file) => {
    const filePath = path.join(backupDir, file);
    if (fs.statSync(filePath).mtime.getTime() < thirtyDaysAgo) {
      fs.unlinkSync(filePath);
      console.log(`🗑️  Удален старый бэкап: ${file}`);
    }
  });
} catch (error) {
  console.error('❌ Ошибка при создании бэкапа:', error.message);
  process.exit(1);
}
