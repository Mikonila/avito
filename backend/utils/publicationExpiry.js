const Listing = require('../models/Listing');
const Service = require('../models/Service');

function buildExpiryMessage(title) {
  return (
    `Ваша публикация «${title}» истекла и перенесена в архив.\n\n` +
    'Чтобы бесплатно продлить ее еще на 1 месяц, активируйте ее повторно в приложении, в разделе «Мои объявления».'
  );
}

async function archiveExpiredPublications(bot) {
  const [expiredListings, expiredServices] = await Promise.all([
    Listing.findExpiredActive(),
    Service.findExpiredActive()
  ]);

  const publications = [
    ...expiredListings.map((item) => ({ ...item, type: 'listing' })),
    ...expiredServices.map((item) => ({ ...item, type: 'service' }))
  ];

  for (const publication of publications) {
    const archived = publication.type === 'service'
      ? await Service.archive(publication.id)
      : await Listing.archive(publication.id);

    if (archived && bot && publication.telegram_id) {
      try {
        await bot.sendMessage(publication.telegram_id, buildExpiryMessage(publication.title));
      } catch (error) {
        console.error('Failed to send publication expiry notification:', error);
      }
    }
  }

  return publications.length;
}

module.exports = {
  archiveExpiredPublications
};
