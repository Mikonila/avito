require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const userRoutes = require('./routes/userRoutes');
const listingRoutes = require('./routes/listingRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const referenceRoutes = require('./routes/referenceRoutes');
const { initializeData } = require('./models/Reference');
const { healthCheck, initializeDatabase, close } = require('./models/database');
const { getTelegramBotStatus, startTelegramBot, stopTelegramBot } = require('./telegramBot');
const { isCloudinaryConfigured } = require('./utils/cloudinary');
const { archiveExpiredPublications } = require('./utils/publicationExpiry');

const app = express();
const PORT = process.env.PORT || 3000;
let serverInstance = null;
let expiryInterval = null;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/users', userRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/reference', referenceRoutes);

app.get('/api/health', async (req, res) => {
  const database = await healthCheck();
  const telegramBot = getTelegramBotStatus();
  const statusCode = database.ok ? 200 : 503;

  res.status(statusCode).json({
    status: database.ok ? 'OK' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    database,
    cloudinary: {
      configured: isCloudinaryConfigured()
    },
    telegramBot
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);

  try {
    if (expiryInterval) {
      clearInterval(expiryInterval);
    }
    await stopTelegramBot();
    await close();
  } catch (error) {
    console.error('Error during shutdown:', error);
  }

  if (!serverInstance) {
    process.exit(0);
    return;
  }

  serverInstance.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

async function startServer() {
  try {
    await initializeDatabase();
    await initializeData();

    serverInstance = app.listen(PORT, async () => {
      console.log(`Server running on port ${PORT}`);

      let bot = null;
      try {
        bot = await startTelegramBot({ app });
      } catch (error) {
        console.error('Error starting Telegram bot:', error);
      }

      await archiveExpiredPublications(bot);
      expiryInterval = setInterval(() => {
        archiveExpiredPublications(bot).catch((error) => {
          console.error('Error archiving expired publications:', error);
        });
      }, 60 * 60 * 1000);
    });
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startServer();

module.exports = app;
