const Listing = require('../models/Listing');
const Service = require('../models/Service');
const User = require('../models/User');
const { getTelegramBot } = require('../telegramBot');
const { getAdminTelegramIds } = require('../middleware/auth');

const recentReports = new Map();

async function reportPublication(req, res) {
  try {
    const { user_id, item_id, item_type = 'listing', reason = '' } = req.body;
    if (!user_id || !item_id || !['listing', 'service'].includes(item_type)) {
      return res.status(400).json({ error: 'Некорректные данные жалобы' });
    }

    const reporter = await User.findById(user_id);
    if (!reporter) return res.status(404).json({ error: 'Пользователь не найден' });

    const publication = item_type === 'service'
      ? await Service.findById(item_id)
      : await Listing.findById(item_id);
    if (!publication) return res.status(404).json({ error: 'Публикация не найдена' });

    const rateKey = `${user_id}:${item_type}:${item_id}`;
    const lastReportAt = recentReports.get(rateKey) || 0;
    if (Date.now() - lastReportAt < 24 * 60 * 60 * 1000) {
      return res.json({ success: true, duplicate: true });
    }
    recentReports.set(rateKey, Date.now());

    const bot = getTelegramBot();
    if (bot) {
      const text = `🚩 Жалоба на публикацию\n\n${item_type === 'service' ? 'Услуга' : 'Объявление'}: «${publication.title}»\nID: ${publication.id}\nПричина: ${String(reason || 'не указана').slice(0, 500)}\n\nОтправитель: ${reporter.username ? `@${reporter.username}` : 'без username'}\nTelegram ID: ${reporter.telegram_id || 'не указан'}\nАвтор публикации (ID): ${publication.user_id}`;
      await Promise.allSettled([...new Set(getAdminTelegramIds())].map((adminId) => bot.sendMessage(adminId, text)));
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error reporting publication:', error);
    res.status(500).json({ error: 'Не удалось отправить жалобу' });
  }
}

module.exports = { reportPublication };
