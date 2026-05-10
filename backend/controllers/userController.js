const User = require('../models/User');

async function register(req, res) {
  try {
    const { telegram_id, first_name, last_name, username } = req.body;

    if (!telegram_id) {
      return res.status(400).json({ error: 'telegram_id is required' });
    }

    // Check if user exists
    const existingUser = await User.findByTelegramId(telegram_id);
    if (existingUser) {
      return res.json(existingUser);
    }

    // Create new user
    const newUser = await User.create(telegram_id, {
      first_name,
      last_name,
      username
    });

    res.json(newUser);
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
}

async function getUserProfile(req, res) {
  try {
    const { user_id } = req.params;

    const user = await User.findById(user_id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
}

async function updateUserCity(req, res) {
  try {
    const { user_id } = req.params;
    const { city } = req.body;

    if (!city) {
      return res.status(400).json({ error: 'city is required' });
    }

    const updated = await User.updateCity(user_id, city);
    res.json({ success: updated });
  } catch (error) {
    console.error('Error updating city:', error);
    res.status(500).json({ error: 'Failed to update city' });
  }
}

async function updateUserPhone(req, res) {
  try {
    const { user_id } = req.params;
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'phone is required' });
    }

    const updated = await User.updatePhone(user_id, phone);
    res.json({ success: updated });
  } catch (error) {
    console.error('Error updating phone:', error);
    res.status(500).json({ error: 'Failed to update phone' });
  }
}

module.exports = {
  register,
  getUserProfile,
  updateUserCity,
  updateUserPhone
};
