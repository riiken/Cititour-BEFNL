/**
 * Revenue & usage report: `npm run stats` (optionally `npm run stats -- 7` for days).
 * Read-only; uses MONGODB_URI from .env.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Event = require('../model/Event');
const Itinerary = require('../model/Itinerary');

const days = Number(process.argv[2] || 30);

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const since = new Date(Date.now() - days * 86400000);

  const clicks = await Event.aggregate([
    { $match: { type: 'outbound_click', createdAt: { $gte: since } } },
    { $group: { _id: { partner: '$partner', placement: '$placement' }, clicks: { $sum: 1 } } },
    { $sort: { clicks: -1 } }
  ]);
  const shares = await Event.countDocuments({ type: 'share', createdAt: { $gte: since } });
  const plans = await Itinerary.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: '$generatedBy.method', plans: { $sum: 1 }, views: { $sum: '$views' } } }
  ]);
  const topDestinations = await Itinerary.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: { $toLower: '$request.destination' }, plans: { $sum: 1 } } },
    { $sort: { plans: -1 } },
    { $limit: 10 }
  ]);

  console.log(`\nCitiTour, last ${days} days\n`);
  console.log('Plans created:', plans.map((p) => `${p._id || 'unknown'}=${p.plans} (views ${p.views})`).join(', ') || 'none');
  console.log('Shares:', shares);
  console.log('\nOutbound clicks (partner / placement):');
  console.table(clicks.map((c) => ({ partner: c._id.partner, placement: c._id.placement, clicks: c.clicks })));
  console.log('Top destinations:');
  console.table(topDestinations.map((d) => ({ destination: d._id, plans: d.plans })));

  await mongoose.disconnect();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
