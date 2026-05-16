const TelegramBot = require('node-telegram-bot-api');
const Listing = require('./models/Listing');
const Service = require('./models/Service');
const User = require('./models/User');
const AppSettings = require('./models/AppSettings');
const { getAdminTelegramIds, isAdminTelegramId } = require('./middleware/auth');
const { isCloudinaryConfigured, uploadImages } = require('./utils/cloudinary');

const WEBHOOK_PATH = '/api/telegram/webhook';

let botInstance = null;
let botMode = 'disabled';
let startupPromise = null;
let webhookRouteRegistered = false;
const botsWithRegisteredHandlers = new WeakSet();
const adminAdSessions = new Map();
const adminChannelPostSessions = new Map();
const botDiagnostics = {
  lastWebhookUpdateAt: null,
  lastProcessedUpdateAt: null,
  lastProcessedUpdateType: null,
  lastError: null,
  webhookUrl: null
};
const PROMOTION_PLANS = {
  three_days: { days: 3, stars: 100, label: '3 дня' },
  week: { days: 7, stars: 150, label: '7 дней' },
  month: { days: 30, stars: 250, label: '1 месяц' }
};
const SERVICE_PUBLICATION_PLANS = {
  month: { days: 30, stars: 100, label: '1 месяц' }
};
const HERO_AD_SETTING_KEY = 'hero_ad';
const DEFAULT_CHANNEL_ID = '-1003793027909';

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

function getChannelId() {
  return process.env.TELEGRAM_CHANNEL_ID || DEFAULT_CHANNEL_ID;
}

function isAdminMessage(msg) {
  return isAdminTelegramId(msg.from?.id);
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
          text: 'Открыть маркетплейс',
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

function escapeTelegramHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendWelcome(bot, msg) {
  const chatId = msg.chat.id;
  const firstName = msg.from?.first_name || 'друг';

  await bot.sendMessage(
    chatId,
    `<b>${escapeTelegramHtml(firstName)}, добро пожаловать в Violet — бесплатный маркетплейс Черногории.</b>\n\n` +
      'Если вы тоже устали от поиска нужного товара среди тысяч сообщений, выбора мастеров без отзывов и от того, что ваше объявление теряется в сотнях других, то мы здесь именно для того, чтобы это исправить!\n' +
      'И для этого вам даже не придется регистрироваться и выходить из телеграма - все происходит автоматически при открытии маркетплейса.\n\n' +
      '<b>Здесь можно:</b>\n' +
      '• продавать и покупать товары по всей стране\n' +
      '• размещать услуги и вакансии на широкую аудиторию\n' +
      '• искать объявления по удобным и привычным фильтрам\n' +
      '• находить вещи, которые люди готовы отдать совершенно бесплатно\n' +
      '• продвигать объявления дешевле чашки кофе и получать больше откликов\n' +
      '• просматривать рекомендованные объявления, подобранные под ваши интересы\n' +
      '• находить мастер-классы, лекции, предстоящие концерты, либо размещать свои\n\n' +
      'Мы создали этот сервис, потому что скучаем по авито( и чтобы всем наконец было удобно размещать свои товары и искать покупателей, ибо все будет собрано в одном месте ❤️\n\n' +
      'Будем рады любому фидбэку – ко всем прислушаемся, сервис будем регулярно обновлять и улучшать. Для этого вы можете просто отправить сообщение этому боту.\n\n' +
      '<b>На этом все, можете открывать приложение ⤵️</b>',
    {
      parse_mode: 'HTML',
      reply_markup: buildWelcomeKeyboard()
    }
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
  const adminHelp = isAdminMessage(msg)
    ? '\n\nКоманды администратора:\n' +
      '/unban <id> - разбанить пользователя по ID или Telegram ID\n' +
      '/ad_create - создать рекламу в верхнем блоке\n' +
      '/ad_reset - вернуть стандартный верхний блок\n' +
      '/channel_post - написать пост в канал с кнопкой\n' +
      '/cancel - отменить текущее действие'
    : '';

  await bot.sendMessage(
    msg.chat.id,
    'Справка по Violet\n\n' +
      '/start - открыть приложение\n' +
      '/support - написать в поддержку\n\n' +
      'Обычные сообщения в этот чат будут переданы администратору.' +
      adminHelp
  );
}

async function downloadTelegramPhotoAsDataUrl(bot, fileId) {
  const fileUrl = await bot.getFileLink(fileId);
  const response = await fetch(fileUrl);

  if (!response.ok) {
    throw new Error(`Не удалось скачать фото из Telegram: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

async function saveHeroAdFromTelegramPhoto(bot, session, fileId) {
  const dataUrl = await downloadTelegramPhotoAsDataUrl(bot, fileId);
  const imageUrl = isCloudinaryConfigured()
    ? (await uploadImages([dataUrl], 'hero'))[0]
    : dataUrl;

  return AppSettings.set(HERO_AD_SETTING_KEY, {
    title: session.title,
    description: session.description,
    image_url: imageUrl,
    is_custom: true,
    updated_at: new Date().toISOString()
  });
}

async function handleUnbanCommand(bot, msg, args) {
  if (!isAdminMessage(msg)) {
    await bot.sendMessage(msg.chat.id, 'Команда доступна только администратору.');
    return;
  }

  const identifier = args[0];

  if (!identifier) {
    await bot.sendMessage(msg.chat.id, 'Укажите ID: /unban <id>');
    return;
  }

  const wasUnbanned = await User.unbanByIdentifier(identifier);
  await bot.sendMessage(
    msg.chat.id,
    wasUnbanned
      ? `Пользователь ${identifier} разбанен.`
      : `Пользователь ${identifier} не найден или уже не забанен.`
  );
}

async function startHeroAdCreation(bot, msg) {
  if (!isAdminMessage(msg)) {
    await bot.sendMessage(msg.chat.id, 'Команда доступна только администратору.');
    return;
  }

  adminAdSessions.set(String(msg.chat.id), { step: 'title' });
  await bot.sendMessage(msg.chat.id, 'Введите заголовок рекламного блока. Для отмены: /cancel');
}

async function resetHeroAd(bot, msg) {
  if (!isAdminMessage(msg)) {
    await bot.sendMessage(msg.chat.id, 'Команда доступна только администратору.');
    return;
  }

  await AppSettings.set(HERO_AD_SETTING_KEY, null);
  adminAdSessions.delete(String(msg.chat.id));
  await bot.sendMessage(msg.chat.id, 'Рекламный блок сброшен. Вернулся стандартный блок.');
}

async function startChannelPostCreation(bot, msg) {
  if (!isAdminMessage(msg)) {
    await bot.sendMessage(msg.chat.id, 'Команда доступна только администратору.');
    return;
  }

  adminChannelPostSessions.set(String(msg.chat.id), { step: 'post_text' });
  await bot.sendMessage(msg.chat.id, 'Введите текст поста для канала. Для отмены: /cancel');
}

function normalizeButtonUrl(value = '') {
  const trimmed = value.trim();
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(normalized);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch (error) {
    return '';
  }
}

async function publishChannelPost(bot, session) {
  return bot.sendMessage(getChannelId(), session.postText, {
    reply_markup: {
      inline_keyboard: [[
        {
          text: session.buttonText,
          url: session.buttonUrl
        }
      ]]
    },
    disable_web_page_preview: false
  });
}

async function handleChannelPostSession(bot, msg) {
  const chatId = String(msg.chat.id);
  const session = adminChannelPostSessions.get(chatId);

  if (!session) {
    return false;
  }

  if (!isAdminMessage(msg)) {
    adminChannelPostSessions.delete(chatId);
    await bot.sendMessage(msg.chat.id, 'Действие отменено: нет прав администратора.');
    return true;
  }

  const text = (msg.text || '').trim();

  if (text === '/cancel') {
    adminChannelPostSessions.delete(chatId);
    await bot.sendMessage(msg.chat.id, 'Создание поста отменено.');
    return true;
  }

  if (session.step === 'post_text') {
    if (!text || text.startsWith('/')) {
      await bot.sendMessage(msg.chat.id, 'Введите текст поста обычным сообщением.');
      return true;
    }

    session.postText = text.slice(0, 4096);
    session.step = 'button_text';
    adminChannelPostSessions.set(chatId, session);
    await bot.sendMessage(msg.chat.id, 'Введите текст кнопки.');
    return true;
  }

  if (session.step === 'button_text') {
    if (!text || text.startsWith('/')) {
      await bot.sendMessage(msg.chat.id, 'Введите текст кнопки обычным сообщением.');
      return true;
    }

    session.buttonText = text.slice(0, 64);
    session.step = 'button_url';
    adminChannelPostSessions.set(chatId, session);
    await bot.sendMessage(msg.chat.id, 'Введите ссылку для кнопки. Ссылка должна начинаться с http:// или https://');
    return true;
  }

  if (session.step === 'button_url') {
    const buttonUrl = normalizeButtonUrl(text);

    if (!buttonUrl) {
      await bot.sendMessage(msg.chat.id, 'Введите корректную ссылку: http:// или https://');
      return true;
    }

    session.buttonUrl = buttonUrl;

    try {
      await publishChannelPost(bot, session);
      adminChannelPostSessions.delete(chatId);
      await bot.sendMessage(msg.chat.id, 'Пост отправлен в канал.');
    } catch (error) {
      botDiagnostics.lastError = error.message;
      console.error('Error publishing channel post:', error);
      await bot.sendMessage(
        msg.chat.id,
        `Не удалось отправить пост в канал. Проверьте, что бот админ канала и может публиковать сообщения.\n\nОшибка: ${error.message}`
      );
    }

    return true;
  }

  adminChannelPostSessions.delete(chatId);
  return false;
}

async function handleHeroAdSession(bot, msg) {
  const chatId = String(msg.chat.id);
  const session = adminAdSessions.get(chatId);

  if (!session) {
    return false;
  }

  if (!isAdminMessage(msg)) {
    adminAdSessions.delete(chatId);
    await bot.sendMessage(msg.chat.id, 'Действие отменено: нет прав администратора.');
    return true;
  }

  const text = (msg.text || '').trim();

  if (text === '/cancel') {
    adminAdSessions.delete(chatId);
    await bot.sendMessage(msg.chat.id, 'Создание рекламы отменено.');
    return true;
  }

  if (session.step === 'title') {
    if (!text || text.startsWith('/')) {
      await bot.sendMessage(msg.chat.id, 'Введите заголовок текстом.');
      return true;
    }

    session.title = text.slice(0, 120);
    session.step = 'description';
    adminAdSessions.set(chatId, session);
    await bot.sendMessage(msg.chat.id, 'Теперь введите описание рекламного блока.');
    return true;
  }

  if (session.step === 'description') {
    if (!text || text.startsWith('/')) {
      await bot.sendMessage(msg.chat.id, 'Введите описание текстом.');
      return true;
    }

    session.description = text.slice(0, 500);
    session.step = 'photo';
    adminAdSessions.set(chatId, session);
    await bot.sendMessage(msg.chat.id, 'Отправьте фото для рекламного блока.');
    return true;
  }

  if (session.step === 'photo') {
    const photo = Array.isArray(msg.photo) ? msg.photo[msg.photo.length - 1] : null;

    if (!photo?.file_id) {
      await bot.sendMessage(msg.chat.id, 'Нужно отправить фото. Для отмены: /cancel');
      return true;
    }

    await saveHeroAdFromTelegramPhoto(bot, session, photo.file_id);
    adminAdSessions.delete(chatId);
    await bot.sendMessage(msg.chat.id, 'Реклама обновлена и появится в верхнем блоке приложения.');
    return true;
  }

  adminAdSessions.delete(chatId);
  return false;
}

async function forwardUserMessageToAdmin(bot, msg) {
  const adminIds = getAdminTelegramIds();

  if (adminIds.length === 0) {
    console.warn('ADMIN_TELEGRAM_ID/ADMIN_TELEGRAM_IDS is not set. User message was not forwarded.');
    await bot.sendMessage(
      msg.chat.id,
      `Сообщение не удалось передать автоматически. Напишите напрямую: @${getSupportUsername()}`
    );
    return;
  }

  let delivered = false;
  let lastForwardError = null;

  for (const adminId of adminIds) {
    try {
      await bot.sendMessage(adminId, buildSenderInfo(msg));

      if (typeof bot.copyMessage === 'function') {
        await bot.copyMessage(adminId, msg.chat.id, msg.message_id);
      } else {
        await bot.forwardMessage(adminId, msg.chat.id, msg.message_id);
      }

      delivered = true;
    } catch (forwardError) {
      lastForwardError = forwardError;
      console.error(`Failed to relay user message to admin ${adminId}:`, forwardError.message);
      await bot.sendMessage(
        adminId,
        `Не удалось переслать сообщение автоматически. Chat ID: ${msg.chat?.id || 'не указан'}`
      ).catch(() => {});
    }
  }

  if (!delivered) {
    throw lastForwardError || new Error('Failed to relay user message to admins');
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

    const textParts = text.trim().split(/\s+/).filter(Boolean);
    const command = (textParts[0] || '').split('@')[0].toLowerCase();
    const commandArgs = textParts.slice(1);

    try {
      if (await handleHeroAdSession(bot, msg)) {
        return;
      }

      if (await handleChannelPostSession(bot, msg)) {
        return;
      }

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

      if (command === '/unban' || command === '/разбан') {
        await handleUnbanCommand(bot, msg, commandArgs);
        return;
      }

      if (command === '/ad_create' || command === '/create_ad' || command === '/реклама') {
        await startHeroAdCreation(bot, msg);
        return;
      }

      if (command === '/ad_reset' || command === '/reset_ad' || command === '/сброс_рекламы') {
        await resetHeroAd(bot, msg);
        return;
      }

      if (command === '/channel_post' || command === '/post_channel' || command === '/пост_в_канал') {
        await startChannelPostCreation(bot, msg);
        return;
      }

      if (command === '/cancel') {
        adminAdSessions.delete(String(msg.chat.id));
        adminChannelPostSessions.delete(String(msg.chat.id));
        await bot.sendMessage(msg.chat.id, 'Нет активного действия для отмены.');
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
