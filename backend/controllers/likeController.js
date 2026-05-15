const PublicationLike = require('../models/PublicationLike');
const User = require('../models/User');
const { getRequesterTelegramId } = require('../middleware/auth');

async function requireRequester(req, res, userId) {
  const requesterTelegramId = getRequesterTelegramId(req);

  if (!requesterTelegramId || !userId) {
    res.status(401).json({ error: 'Не удалось определить пользователя' });
    return null;
  }

  const requester = await User.findByTelegramId(requesterTelegramId);

  if (!requester || requester.id !== userId) {
    res.status(403).json({ error: 'Нельзя выполнить действие от имени другого пользователя' });
    return null;
  }

  return requester;
}

async function toggleLike(req, res) {
  try {
    const { user_id, item_type, item_id } = req.body;
    const requester = await requireRequester(req, res, user_id);

    if (!requester) {
      return;
    }

    const result = await PublicationLike.toggle(user_id, item_type, item_id);

    if (!result) {
      return res.status(404).json({ error: 'Объявление не найдено' });
    }

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error toggling publication like:', error);
    res.status(500).json({ error: 'Не удалось обновить лайк' });
  }
}

async function getUserLikes(req, res) {
  try {
    const { user_id } = req.params;
    const requester = await requireRequester(req, res, user_id);

    if (!requester) {
      return;
    }

    const items = await PublicationLike.findByUserId(user_id);
    res.json(items);
  } catch (error) {
    console.error('Error fetching user likes:', error);
    res.status(500).json({ error: 'Не удалось загрузить сохраненные объявления' });
  }
}

module.exports = {
  getUserLikes,
  toggleLike
};
