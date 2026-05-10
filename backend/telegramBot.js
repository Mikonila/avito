const TelegramBot = require('node-telegram-bot-api');

const WEBHOOK_PATH = '/api/telegram/webhook';

let botInstance = null;
let botMode = 'disabled';
let startupPromise = null;
let webhookRouteRegistered = false;

function getWebAppUrl() {
  return process.env.WEBAPP_URL || 'https://your-domain.com';
}

function buildWelcomeKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: '🏪 Открыть маркетплейс',
          web_app: { url: getWebAppUrl() }
        }
      ]
    ]
  };
}

function registerHandlers(bot) {
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name;

    bot.sendMessage(
      chatId,
      `Добро пожаловать, ${firstName}! 👋\n\n` +
        'Это бесплатный маркетплейс Черногории. Здесь вы можете:\n\n' +
        '• 📦 Продавать товары бесплатно\n' +
        '• 🔧 Предоставлять услуги (1 бесплатно)\n' +
        '• 📢 Размещать рекламу\n' +
        '• 🔍 Искать товары и услуги\n\n' +
        'Нажмите кнопку ниже, чтобы начать!',
      { reply_markup: buildWelcomeKeyboard() }
    );
  });

  bot.onText(/\/help/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      '❓ Справка по маркетплейсу\n\n' +
        '📋 Команды:\n' +
        '/start - Главное меню\n' +
        '/help - Эта справка\n' +
        '/support - Служба поддержки\n\n' +
        '💡 Подсказки:\n' +
        '• Первая услуга бесплатна\n' +
        '• Дополнительные услуги - платные\n' +
        '• Реклама стоит 9.99 EUR\n' +
        '• Контакт администратора: @helionstudio'
    );
  });

  bot.onText(/\/support/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      '📞 Служба поддержки\n\n' +
        'Если у вас есть вопросы или проблемы, свяжитесь с нами:\n\n' +
        '👤 Администратор: @helionstudio\n' +
        '💼 Бизнес: @helionstudio\n\n' +
        'Мы поможем вам с:\n' +
        '• Платежами за услуги\n' +
        '• Размещением рекламы\n' +
        '• Технической поддержкой'
    );
  });

  bot.on('message', (msg) => {
    const text = msg.text || '';

    if (text.startsWith('/')) {
      return;
    }

    bot.sendMessage(
      msg.chat.id,
      'Привет! 👋\n\n' +
        'Используйте /start для открытия маркетплейса\n' +
        'Или /help для справки'
    );
  });

  bot.on('polling_error', (error) => {
    console.error('Telegram polling error:', error.message);
  });
}

function resolveMode(requestedMode, app) {
  if (requestedMode === 'off') {
    return 'off';
  }

  if (requestedMode === 'polling') {
    return 'polling';
  }

  if (requestedMode === 'webhook') {
    return 'webhook';
  }

  const canUseWebhook =
    Boolean(app) &&
    process.env.NODE_ENV === 'production' &&
    /^https:\/\//.test(getWebAppUrl());

  return canUseWebhook ? 'webhook' : 'polling';
}

function registerWebhookRoute(app, bot) {
  if (webhookRouteRegistered) {
    return;
  }

  app.post(WEBHOOK_PATH, async (req, res) => {
    try {
      await bot.processUpdate(req.body);
      res.sendStatus(200);
    } catch (error) {
      console.error('Telegram webhook error:', error);
      res.sendStatus(500);
    }
  });

  webhookRouteRegistered = true;
}

async function startTelegramBot(options = {}) {
  if (startupPromise) {
    return startupPromise;
  }

  startupPromise = (async () => {
    const token = process.env.BOT_TOKEN;

    if (!token) {
      botMode = 'disabled';
      console.warn('BOT_TOKEN is not set. Telegram bot was not started.');
      return null;
    }

    const requestedMode = (options.mode || process.env.TELEGRAM_BOT_MODE || 'auto').toLowerCase();
    const mode = resolveMode(requestedMode, options.app);

    if (mode === 'off') {
      botMode = 'disabled';
      console.log('Telegram bot disabled by TELEGRAM_BOT_MODE=off');
      return null;
    }

    botInstance = new TelegramBot(
      token,
      mode === 'polling'
        ? {
            polling: {
              interval: 300,
              params: { timeout: 10 }
            }
          }
        : {}
    );

    registerHandlers(botInstance);

    if (mode === 'webhook') {
      if (!options.app) {
        throw new Error('Webhook mode requires an Express app instance.');
      }

      registerWebhookRoute(options.app, botInstance);

      const webhookUrl = new URL(WEBHOOK_PATH, `${getWebAppUrl().replace(/\/$/, '')}/`).toString();
      await botInstance.setWebHook(webhookUrl);
      botMode = 'webhook';
      console.log(`Telegram bot started in webhook mode: ${webhookUrl}`);
    } else {
      await botInstance.deleteWebHook().catch(() => {});
      botMode = 'polling';
      console.log('Telegram bot started in polling mode');
    }

    console.log(`Telegram Mini App URL: ${getWebAppUrl()}`);
    return botInstance;
  })().catch((error) => {
    startupPromise = null;
    botInstance = null;
    botMode = 'disabled';
    throw error;
  });

  return startupPromise;
}

async function stopTelegramBot() {
  if (!botInstance) {
    return;
  }

  if (botMode === 'polling') {
    await botInstance.stopPolling().catch(() => {});
  }

  if (botMode === 'webhook') {
    await botInstance.deleteWebHook().catch(() => {});
  }

  botInstance = null;
  botMode = 'disabled';
  startupPromise = null;
}

function getTelegramBotStatus() {
  return {
    enabled: Boolean(botInstance),
    mode: botMode,
    webhookPath: botMode === 'webhook' ? WEBHOOK_PATH : null
  };
}

module.exports = {
  getTelegramBotStatus,
  startTelegramBot,
  stopTelegramBot
};
