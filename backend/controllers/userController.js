const User = require('../models/User');
const Review = require('../models/Review');
const { getRequesterTelegramId, isAdminTelegramId } = require('../middleware/auth');

function serializeUser(user) {
  if (!user) {
    return user;
  }

  return {
    ...user,
    is_admin: isAdminTelegramId(user.telegram_id)
  };
}

async function register(req, res) {
  try {
    const { telegram_id, first_name = '', last_name = '', username = '', avatar_url = '' } = req.body;

    if (!telegram_id) {
      return res.status(400).json({ error: 'Не передан Telegram ID' });
    }

    const existingUser = await User.findByTelegramId(telegram_id);
    if (existingUser) {
      const syncedUser = await User.fillMissingFromTelegram(existingUser.id, {
        first_name,
        last_name,
        username,
        avatar_url
      });
      return res.json(serializeUser(syncedUser));
    }

    const newUser = await User.create(telegram_id, {
      first_name,
      last_name,
      username,
      avatar_url
    });

    res.json(serializeUser(newUser));
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Не удалось создать профиль' });
  }
}

async function getUserProfile(req, res) {
  try {
    const { user_id } = req.params;
    const requesterTelegramId = getRequesterTelegramId(req);
    const includeAdminFields = isAdminTelegramId(requesterTelegramId);

    const user = await User.findById(user_id);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const reviews = await Review.findByTargetUserId(user_id, { includeAdminFields });

    res.json({
      ...serializeUser(user),
      reviews
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Не удалось загрузить профиль' });
  }
}

async function updateUserProfile(req, res) {
  try {
    const { user_id } = req.params;
    const { first_name = '', last_name = '', username = '', phone = '', city = '', about = '' } = req.body;
    const requesterTelegramId = getRequesterTelegramId(req);

    if (!requesterTelegramId) {
      return res.status(401).json({ error: 'Не удалось определить пользователя Telegram' });
    }

    const requester = await User.findByTelegramId(requesterTelegramId);
    if (!requester) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    if (requester.id !== user_id) {
      return res.status(403).json({ error: 'Нельзя редактировать чужой профиль' });
    }

    const updated = await User.updateProfile(user_id, {
      first_name,
      last_name,
      username,
      phone,
      city,
      about
    });

    if (!updated) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const user = await User.findById(user_id);
    res.json({ success: true, user: serializeUser(user) });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Не удалось обновить профиль' });
  }
}

module.exports = {
  register,
  getUserProfile,
  updateUserProfile
};
