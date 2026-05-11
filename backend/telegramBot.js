const TelegramBot = require('node-telegram-bot-api');
const Listing = require('./models/Listing');
const Service = require('./models/Service');

const WEBHOOK_PATH = '/api/telegram/webhook';

let botInstance = null;
let botMode = 'disabled';
let startupPromise = null;
let webhookRouteRegistered = false;
let handlersRegistered = false;
const PROMOTION_PLANS = {
  three_days: { days: 3, stars: 100, label: '3 дня' },
  week: { days: 7, stars: 150, label: '7 дней' },
  month: { days: 30, stars: 250, label: '1 месяц' }
};
const SERVICE_PUBLICATION_PLANS = {
  month: { days: 30, stars: 100, label: '1 месяц' }
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

function getAdminTelegramId() {
  return process.env.ADMIN_TELEGRAM_ID ? String(process.env.ADMIN_TELEGRAM_ID) : '';
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

function parseServicePublicationPayload(payload) {
  if (typeof payload !== 'string' || !payload.startsWith('service_publication:')) {
    return null;
  }

  const parts = payload.split(':');
  if (parts.length !== 6) {
    return null;
  }

  const [, serviceId, userId, planKey, stars, nonce] = parts;
  const plan = SERVICE_PUBLICATION_PLANS[planKey];

  if (!serviceId || !userId || !plan || String(plan.stars) !== String(stars) || !nonce) {
    return null;
  }

  return {
    serviceId,
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

function buildSenderInfo(msg) {
  const from = msg.from || {};
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ').trim() || 'Без имени';
  const username = from.username ? `@${from.username}` : 'username не указан';
  const userId = from.id ? String(from.id) : 'id не указан';
  const chatId = msg.chat?.id ? String(msg.chat.id) : 'chat id не указан';

  return `Новое сообщение пользователю поддержки\n\nОт: ${name}\nUsername: ${username}\nTelegram ID: ${userId}\nChat ID: ${chatId}`;
}

async function sendWelcome(bot, msg) {
  const chatId = msg.chat.id;
  const firstName = msg.from?.first_name || 'друг';

  await bot.sendMessage(
    chatId,
    `Добро пожаловать, ${firstName}!\n\n` +
      'Это Violet — маркетплейс Черногории. Здесь можно:\n\n' +
      '• продавать и покупать вещи по всей Черногории\n' +
      '• размещать услуги\n' +
      '• находить события в афише\n' +
      '• искать объявления по городам, категориям и цене\n\n' +
      'Нажмите кнопку ниже, чтобы открыть приложение.',
    { reply_markup: buildWelcomeKeyboard() }
  );
}

async function sendSupport(bot, msg) {
  await bot.sendMessage(
    msg.chat.id,
    'Служба поддержки\n\n' +
      `Напишите администратору: @${getSupportUsername()}\n\n` +
      'Можно обратиться по вопросам публикаций, оплаты, рекламы и разблокировки.',
    {
      reply_markup: {
        inline_keyboard: [[{ text: 'Написать в поддержку', url: getSupportTelegramLink() }]]
      }
    }
  );
}

async function sendHelp(bot, msg) {
  await bot.sendMessage(
    msg.chat.id,
    'Справка по Violet\n\n' +
      '/start - открыть приложение\n' +
      '/support - написать в поддержку\n\n' +
      'Обычные сообщения в этот чат будут переданы администратору.'
  );
}

async function forwardUserMessageToAdmin(bot, msg) {
  const adminId = getAdminTelegramId();

  if (!adminId) {
    console.warn('ADMIN_TELEGRAM_ID is not set. User message was not forwarded.');
    await bot.sendMessage(
      msg.chat.id,
      `Сообщение не удалось передать автоматически. Напишите напрямую: @${getSupportUsername()}`
    );
    return;
  }

  await bot.sendMessage(adminId, buildSenderInfo(msg));

  try {
    if (typeof bot.copyMessage === 'function') {
      await bot.copyMessage(adminId, msg.chat.id, msg.message_id);
    } else {
      await bot.forwardMessage(adminId, msg.chat.id, msg.message_id);
    }
  } catch (forwardError) {
    console.error('Failed to relay user message to admin:', forwardError.message);
    await bot.sendMessage(
      adminId,
      `Не удалось переслать сообщение автоматически. Chat ID: ${msg.chat?.id || 'не указан'}`
    ).catch(() => {});
    throw forwardError;
  }

  await bot.sendMessage(msg.chat.id, 'Сообщение передано администратору.');
}

function registerHandlers(bot) {
  if (handlersRegistered) {
    return;
  }

  bot.on('message', async (msg) => {
    const text = msg.text || '';

    if (msg.successful_payment) {
      return;
    }

    const command = text.trim().split(/\s+/)[0].split('@')[0].toLowerCase();

    try {
      if (command === '/start') {
        await sendWelcome(bot, msg);
        return;
      }

      if (command === '/help') {
        await sendHelp(bot, msg);
        return;
      }

      if (command === '/support') {
        await sendSupport(bot, msg);
        return;
      }

      if (text.startsWith('/')) {
        await sendHelp(bot, msg);
        return;
      }

      await forwardUserMessageToAdmin(bot, msg);
    } catch (error) {
      console.error('Error handling Telegram message:', error);
      await bot.sendMessage(
        msg.chat.id,
        `Не удалось обработать сообщение. Напишите напрямую: @${getSupportUsername()}`
      ).catch(() => {});
    }
  });

  bot.on('polling_error', (error) => {
    console.error('Telegram polling error:', error.message);
  });

  bot.on('pre_checkout_query', async (query) => {
    const promotion = parsePromotionPayload(query.invoice_payload);
    const servicePublication = parseServicePublicationPayload(query.invoice_payload);

    if (!promotion && !servicePublication) {
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
      const servicePublication = parseServicePublicationPayload(payment?.invoice_payload);

      if (servicePublication) {
        const expiresAt = await Service.activatePublication(
          servicePublication.serviceId,
          servicePublication.days,
          true
        );

        if (!expiresAt) {
          await bot.sendMessage(
            msg.chat.id,
            'Оплата прошла, но услуга не найдена. Напишите в поддержку, мы поможем.'
          );
          return;
        }

        await bot.sendMessage(
          msg.chat.id,
          `Публикация услуги активирована.\n\n` +
            `Срок: ${servicePublication.label}\n` +
            `Стоимость: ${servicePublication.stars} ⭐\n` +
            `Активно до: ${new Date(expiresAt).toLocaleDateString('ru-RU')}`
        );
        return;
      }

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

  handlersRegistered = true;
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

function registerWebhookRoute(app) {
  if (webhookRouteRegistered) {
    return;
  }

  app.post(WEBHOOK_PATH, async (req, res) => {
    try {
      if (!botInstance) {
        res.sendStatus(503);
        return;
      }

      await botInstance.processUpdate(req.body);
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

      registerWebhookRoute(options.app);

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
    handlersRegistered = false;
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
  handlersRegistered = false;
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
  SERVICE_PUBLICATION_PLANS,
  getSupportTelegramLink,
  getTelegramBotStatus,
  getTelegramBot,
  parseServicePublicationPayload,
  parsePromotionPayload,
  startTelegramBot,
  stopTelegramBot
};
