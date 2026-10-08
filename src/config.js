process.env.TZ = process.env.TZ || 'Asia/Tehran';
require('dotenv').config();
const c = {
  token: process.env.BOT_TOKEN,
  mongo: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/globalkick',
  ownerPass: process.env.OWNER_PASS,
  adminPass: process.env.ADMIN_PASS,
  tz: process.env.TZ,
  channel: process.env.CHANNEL_ID || '',
  slots: Number(process.env.SLOTS_PER_DAY || 5),
  gapH: Number(process.env.MATCH_GAP_HOURS || 2),
  tableMode: process.env.TABLE_MODE || 'match',
  payInfo: process.env.PAY_INFO || '',
  support: process.env.SUPPORT_ID || '',
  startCoins: 2000,
};
for (const k of ['token', 'ownerPass', 'adminPass']) {
  if (!c[k]) { console.error(`❌ مقدار ${k} در فایل .env تنظیم نشده است`); process.exit(1); }
}
module.exports = c;
