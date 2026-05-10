#!/usr/bin/env node

require('dotenv').config();
const { startTelegramBot, stopTelegramBot } = require('./backend/telegramBot');

async function main() {
  try {
    const bot = await startTelegramBot({ mode: 'polling' });

    if (!bot) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Failed to start Telegram bot:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  await stopTelegramBot();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await stopTelegramBot();
  process.exit(0);
});

main();
