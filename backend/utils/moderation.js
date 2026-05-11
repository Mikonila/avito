const User = require('../models/User');
const { getRequesterTelegramId, isAdminTelegramId } = require('../middleware/auth');
const { getTelegramBot } = require('../telegramBot');

const BAN_REASON = 'Нарушение правил платформы';

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
  isUserBanned,
  notifyUserAboutBan,
  requireAdminUser
};
