const TelegramBot = require('node-telegram-bot-api');
const Listing = require('./models/Listing');
const Service = require('./models/Service');

const WEBHOOK_PATH = '/api/telegram/webhook';

let botInstance = null;
let botMode = 'disabled';
let startupPromise = null;
let webhookRouteRegistered = false;
const PROMOTION_PLANS = {
  test: { days: 1, stars: 1, label: 'тестовый день' },
  day: { days: 1, stars: 100, label: '1 день' },
  three_days: { days: 3, stars: 150, label: '3 дня' },
  week: { days: 7, stars: 250, label: '7 дней' },
  month: { days: 30, stars: 500, label: 'месяц' }
};

function getWebAppUrl() {
  return process.env.WEBAPP_URL || 'https://your-domain.com';
}

function getSupportUsername() {
  return process.env.SUPPORT_USERNAME || 'helionstudio';
}

function getSupportTelegramLink() {
  return `https://t.me/${getSupportUsername()}`;
}

function parsePromotionPayload(payload) {
  if (typeof payload !== 'string' || !payload.startsWith('promotion:')) {
    return null;
  }

  const parts = payload.split(':');
  if (parts.length !== 6 && parts.length !== 7) {
    return null;
  }

  const hasItemType = parts.length === 7;
  const itemType = hasItemType ? parts[1] : 'listing';
  const itemId = hasItemType ? parts[2] : parts[1];
  const userId = hasItemType ? parts[3] : parts[2];
  const planKey = hasItemType ? parts[4] : parts[3];
  const stars = hasItemType ? parts[5] : parts[4];
  const nonce = hasItemType ? parts[6] : parts[5];
  const plan = PROMOTION_PLANS[planKey];

  if (!['listing', 'service'].includes(itemType) || !itemId || !userId || !plan || String(plan.stars) !== String(stars) || !nonce) {
    return null;
  }

  return {
    itemId,
    itemType,
    listingId: itemId,
    userId,
    planKey,
    stars: Number(stars),
    days: plan.days,
    label: plan.label
  };
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
        `👤 Поддержка: @${getSupportUsername()}\n\n` +
        'Мы поможем вам с:\n' +
        '• Платежами за услуги\n' +
        '• Размещением рекламы\n' +
        '• Технической поддержкой',
      {
        reply_markup: {
          inline_keyboard: [[{ text: 'Написать в поддержку', url: getSupportTelegramLink() }]]
        }
      }
    );
  });

  bot.on('message', (msg) => {
    const text = msg.text || '';

    if (!text || text.startsWith('/') || msg.successful_payment) {
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

  bot.on('pre_checkout_query', async (query) => {
    const promotion = parsePromotionPayload(query.invoice_payload);

    if (!promotion) {
      await bot.answerPreCheckoutQuery(query.id, false, {
        error_message: 'Не удалось проверить данные платежа'
      });
      return;
    }

    await bot.answerPreCheckoutQuery(query.id, true);
  });

  bot.on('successful_payment', async (msg) => {
    try {
      const payment = msg.successful_payment;
      const promotion = parsePromotionPayload(payment?.invoice_payload);

      if (!promotion) {
        return;
      }

      const model = promotion.itemType === 'service' ? Service : Listing;
      const expiresAt = await model.activatePromotion(promotion.itemId, promotion.days);

      if (!expiresAt) {
        await bot.sendMessage(
          msg.chat.id,
          'Оплата прошла, но объявление не найдено. Напишите в поддержку, мы поможем.'
        );
        return;
      }

      await bot.sendMessage(
        msg.chat.id,
        `Продвижение включено.\n\n` +
          `Срок: ${promotion.label}\n` +
          `Стоимость: ${promotion.stars} ⭐\n` +
          `Активно до: ${new Date(expiresAt).toLocaleDateString('ru-RU')}`
      );
    } catch (error) {
      console.error('Error processing successful payment:', error);
    }
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

function getTelegramBot() {
  return botInstance;
}

module.exports = {
  PROMOTION_PLANS,
  getSupportTelegramLink,
  getTelegramBotStatus,
  getTelegramBot,
  parsePromotionPayload,
  startTelegramBot,
  stopTelegramBot
};
