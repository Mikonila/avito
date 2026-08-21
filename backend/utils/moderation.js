const User = require('../models/User');
const { getRequesterTelegramId, isAdminTelegramId } = require('../middleware/auth');
const { getTelegramBot } = require('../telegramBot');
const AppSettings = require('../models/AppSettings');
const { getAdminTelegramIds } = require('../middleware/auth');

const BAN_REASON = 'Нарушение правил платформы';
const FORBIDDEN_WORDS_KEY = 'forbidden_publication_words';

function normalizeModerationText(value) {
  return ` ${String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').trim()} `;
}

async function findForbiddenWord(...values) {
  const words = await AppSettings.get(FORBIDDEN_WORDS_KEY) || [];
  const text = normalizeModerationText(values.join(' '));
  return words.find((word) => text.includes(normalizeModerationText(word))) || null;
}

async function notifyForbiddenPublication(author, title, forbiddenWord, itemType = 'объявление') {
  const bot = getTelegramBot();
  if (!bot) return;

  const userMessage = `Публикация «${title}» отклонена и не была размещена: в тексте найдено запрещённое слово или выражение «${forbiddenWord}». Измените текст и попробуйте снова.`;
  const adminMessage = `⚠️ Фильтр публикаций\n\nОтклонено: ${itemType} «${title}»\nПричина: запрещённое слово «${forbiddenWord}»\nПользователь: ${author?.username ? `@${author.username}` : 'без username'}\nTelegram ID: ${author?.telegram_id || 'не указан'}\nID пользователя: ${author?.id || 'не указан'}`;

  const recipients = [...new Set(getAdminTelegramIds())];
  await Promise.allSettled([
    author?.telegram_id ? bot.sendMessage(author.telegram_id, userMessage) : Promise.resolve(),
    ...recipients.map((adminId) => bot.sendMessage(adminId, adminMessage))
  ]);
}

function isUserBanned(user) {
  return user?.is_banned === true || user?.is_banned === 1 || user?.is_banned === '1';
}

async function requireAdminUser(req, res) {
  const requesterTelegramId = getRequesterTelegramId(req);

  if (!isAdminTelegramId(requesterTelegramId)) {
    res.status(403).json({ error: 'Требуются права администратора' });
    return null;
  }

  const admin = await User.findByTelegramId(requesterTelegramId);
  if (!admin) {
    res.status(401).json({ error: 'Администратор не найден' });
    return null;
  }

  return admin;
}

async function ensureUserCanPublish(userId, res) {
  const user = await User.findById(userId);

  if (!user) {
    res.status(404).json({ error: 'Пользователь не найден' });
    return null;
  }

  if (isUserBanned(user)) {
    res.status(403).json({
      error: 'Ваш аккаунт заблокирован. Если вы считаете, что произошла ошибка, напишите @helionstudio.'
    });
    return null;
  }

  return user;
}

async function notifyUserAboutBan(user, publicationTitle = '') {
  const bot = getTelegramBot();

  if (!bot || !user?.telegram_id) {
    return;
  }

  const titleLine = publicationTitle ? `\n\nОбъявление: «${publicationTitle}»` : '';
  const message =
    `Ваше объявление удалено, потому что оно нарушает правила платформы.${titleLine}\n\n` +
    'Аккаунт заблокирован на неопределенный срок. Если вы считаете, что произошла ошибка, или хотите уточнить условия разблокировки, напишите @helionstudio.';

  try {
    await bot.sendMessage(user.telegram_id, message);
  } catch (error) {
    console.error('Failed to send ban notification:', error);
  }
}

module.exports = {
  BAN_REASON,
  ensureUserCanPublish,
  findForbiddenWord,
  isUserBanned,
  notifyForbiddenPublication,
  notifyUserAboutBan,
  requireAdminUser
};
