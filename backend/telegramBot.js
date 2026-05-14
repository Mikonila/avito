const TelegramBot = require('node-telegram-bot-api');
const Listing = require('./models/Listing');
const Service = require('./models/Service');

const WEBHOOK_PATH = '/api/telegram/webhook';

let botInstance = null;
let botMode = 'disabled';
let startupPromise = null;
let webhookRouteRegistered = false;
const botsWithRegisteredHandlers = new WeakSet();
const botDiagnostics = {
  lastWebhookUpdateAt: null,
  lastProcessedUpdateAt: null,
  lastProcessedUpdateType: null,
  lastError: null,
  webhookUrl: null
};
const PROMOTION_PLANS = {
  test: { days: 1, stars: 1, label: 'Тест' },
  three_days: { days: 3, stars: 100, label: '3 дня' },
  week: { days: 7, stars: 150, label: '7 дней' },
  month: { days: 30, stars: 250, label: '1 месяц' }
};
const SERVICE_PUBLICATION_PLANS = {
  month: { days: 30, stars: 100, label: '1 месяц' }
};

function getWebAppUrl() {
  const webAppUrl = process.env.WEBAPP_URL || 'https://your-domain.com';

  if (/^https?:\/\//i.test(webAppUrl)) {
    return webAppUrl;
  }

  return `https://${webAppUrl}`;
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
  if (botsWithRegisteredHandlers.has(bot)) {
    return;
  }

  bot.on('message', async (msg) => {
    botDiagnostics.lastProcessedUpdateAt = new Date().toISOString();
    botDiagnostics.lastProcessedUpdateType = 'message';
    const text = msg.text || '';
    console.log(`Telegram message handler received: chat=${msg.chat?.id || 'unknown'} text=${text || '[non-text]'}`);

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
      botDiagnostics.lastError = error.message;
      console.error('Error handling Telegram message:', error);
      await bot.sendMessage(
        msg.chat.id,
        `Не удалось обработать сообщение. Напишите напрямую: @${getSupportUsername()}`
      ).catch(() => {});
    }
  });

  bot.on('polling_error', (error) => {
    botDiagnostics.lastError = error.message;
    console.error('Telegram polling error:', error.message);
  });

  bot.on('pre_checkout_query', async (query) => {
    botDiagnostics.lastProcessedUpdateAt = new Date().toISOString();
    botDiagnostics.lastProcessedUpdateType = 'pre_checkout_query';
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
    botDiagnostics.lastProcessedUpdateAt = new Date().toISOString();
    botDiagnostics.lastProcessedUpdateType = 'successful_payment';
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
      botDiagnostics.lastError = error.message;
      console.error('Error processing successful payment:', error);
    }
  });

  botsWithRegisteredHandlers.add(bot);
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

      const updateId = req.body?.update_id || 'unknown';
      const updateType = Object.keys(req.body || {}).find((key) => key !== 'update_id') || 'unknown';
      botDiagnostics.lastWebhookUpdateAt = new Date().toISOString();
      const message = req.body?.message;
      const command = message?.text?.trim()?.split(/\s+/)[0] || '';
      console.log(`Telegram webhook update received: ${updateId} type=${updateType}${command ? ` ${command}` : ''}`);

      await botInstance.processUpdate(req.body);
      res.sendStatus(200);
    } catch (error) {
      botDiagnostics.lastError = error.message;
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
              autoStart: false,
              interval: 300,
              params: { timeout: 10 }
            }
          }
        : { polling: false }
    );
    registerHandlers(botInstance);

    if (mode === 'webhook') {
      if (!options.app) {
        throw new Error('Webhook mode requires an Express app instance.');
      }

      registerWebhookRoute(options.app);

      const webhookUrl = new URL(WEBHOOK_PATH, `${getWebAppUrl().replace(/\/$/, '')}/`).toString();
      botDiagnostics.webhookUrl = webhookUrl;
      await botInstance.setWebHook(webhookUrl, {
        drop_pending_updates: true
      });
      const webhookInfo = await botInstance.getWebHookInfo().catch((error) => {
        botDiagnostics.lastError = error.message;
        return null;
      });
      botMode = 'webhook';
      console.log(`Telegram bot started in webhook mode: ${webhookUrl}`);
      if (webhookInfo) {
        console.log(
          `Telegram webhook info: pending=${webhookInfo.pending_update_count || 0}` +
          `${webhookInfo.last_error_message ? ` last_error=${webhookInfo.last_error_message}` : ''}`
        );
      }
    } else {
      await botInstance.deleteWebHook({ drop_pending_updates: true }).catch((error) => {
        botDiagnostics.lastError = error.message;
        console.warn('Failed to delete Telegram webhook before polling:', error.message);
      });
      await botInstance.startPolling({ restart: true });
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
    console.log('Telegram webhook left registered on shutdown');
  }

  botInstance = null;
  botMode = 'disabled';
  startupPromise = null;
}

async function getTelegramBotStatus() {
  const webhookInfo = botInstance
    ? await botInstance.getWebHookInfo().catch((error) => {
        botDiagnostics.lastError = error.message;
        return null;
      })
    : null;

  return {
    enabled: Boolean(botInstance),
    mode: botMode,
    webhookPath: botMode === 'webhook' ? WEBHOOK_PATH : null,
    diagnostics: {
      ...botDiagnostics,
      webhookInfo: webhookInfo
        ? {
            url: webhookInfo.url || '',
            pending_update_count: webhookInfo.pending_update_count || 0,
            last_error_date: webhookInfo.last_error_date || null,
            last_error_message: webhookInfo.last_error_message || '',
            max_connections: webhookInfo.max_connections || null
          }
        : null
    }
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
