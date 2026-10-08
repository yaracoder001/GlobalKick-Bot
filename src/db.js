const mongoose = require('mongoose');
const { Schema } = mongoose;
const cfg = require('./config');
const { TEAMS, defaultPlayers, STARS } = require('./data');

const PlayerS = new Schema({
  name: String, pos: String, rating: Number,
  premium: { type: Boolean, default: false },
  slot: { type: Number, default: null },
  goals: { type: Number, default: 0 },
  injury: { type: Number, default: 0 }, // تعداد بازی باقی‌مانده از مصدومیت
});
const TeamS = new Schema({
  key: { type: String, unique: true }, name: String, flag: String,
  joinCode: { type: String, default: null }, // رمز تیم (ثابت می‌ماند تا ادمین آزادسازی کند)
  ownerUid: { type: String, default: null },
  coins: { type: Number, default: cfg.startCoins },
  coach: { type: Number, default: 1 }, staff: { type: Number, default: 1 }, stadium: { type: Number, default: 1 },
  players: [PlayerS],
  formation: { type: String, default: '4-3-3' }, style: { type: String, default: 'balanced' },
  p: { type: Number, default: 0 }, w: { type: Number, default: 0 }, d: { type: Number, default: 0 },
  l: { type: Number, default: 0 }, gf: { type: Number, default: 0 }, ga: { type: Number, default: 0 },
  pts: { type: Number, default: 0 },
});
const UserS = new Schema({
  uid: { type: String, unique: true }, role: { type: String, default: 'user' },
  teamId: { type: Schema.Types.ObjectId, default: null },
  state: { type: String, default: null }, ctx: { type: Schema.Types.Mixed, default: {} },
});
const StoreS = new Schema({ name: String, pos: String, rating: Number, price: Number, photo: String }); // قیمت: تومان
const OrderS = new Schema({
  no: Number, kind: { type: String, default: 'coins' }, // coins | player
  uid: String, teamId: Schema.Types.ObjectId, teamName: String,
  coins: Number, price: Number, starName: String, starPos: String, starRating: Number,
  status: { type: String, default: 'pending' },
}, { timestamps: true });
const ListingS = new Schema({
  no: Number, sellerTeam: Schema.Types.ObjectId, sellerUid: String, sellerName: String,
  player: Schema.Types.Mixed, price: Number, deposit: Number, status: { type: String, default: 'active' },
}, { timestamps: true });
const SettingS = new Schema({ key: { type: String, unique: true }, value: Schema.Types.Mixed });
const FixtureS = new Schema({
  season: Number, stage: { type: String, default: 'L' }, day: Number, idx: Number, slot: Number, at: Date,
  home: Schema.Types.ObjectId, away: Schema.Types.ObjectId,
  played: { type: Boolean, default: false }, hg: Number, ag: Number, pw: Schema.Types.ObjectId, pen: String,
});

const M = {
  Team: mongoose.model('Team', TeamS), User: mongoose.model('User', UserS),
  Store: mongoose.model('Store', StoreS), Order: mongoose.model('Order', OrderS),
  Listing: mongoose.model('Listing', ListingS), Setting: mongoose.model('Setting', SettingS),
  Fixture: mongoose.model('Fixture', FixtureS),
};
M.getSetting = async (k) => (await M.Setting.findOne({ key: k }))?.value;
M.setSetting = (k, v) => M.Setting.updateOne({ key: k }, { value: v }, { upsert: true });
M.getChannel = async () => (await M.getSetting('channel')) || cfg.channel;

M.connect = async () => {
  await mongoose.connect(cfg.mongo);
  if ((await M.Team.countDocuments()) === 0) {
    await M.Team.insertMany(TEAMS.map(([key, flag, name, base]) => ({ key, flag, name, players: defaultPlayers(key, name, base) })));
    console.log('✅ ۳۱ تیم پیش‌فرض ساخته شد');
  }
  // مهاجرت: اسم‌های عمومی قدیمی به اسم واقعی‌نما
  const GENERIC = /^(دروازه‌بان|مدافع|هافبک|مهاجم) \d+ /;
  for (const t of await M.Team.find()) {
    const base = TEAMS.find((x) => x[0] === t.key)?.[3] || 70;
    const fresh = defaultPlayers(t.key, t.name, base); let ch = false;
    t.players.forEach((p, i) => { if (!p.premium && GENERIC.test(p.name) && fresh[i]) { p.name = fresh[i].name; ch = true; } });
    if (ch) await t.save();
  }
  // قیمت بازیکنان ویژه از سکه به تومان (یک‌بار)
  if (!(await M.getSetting('toman_migrated'))) {
    if ((await M.Store.countDocuments()) > 0) await M.Store.updateMany({}, [{ $set: { price: { $multiply: ['$price', 30] } } }]);
    await M.setSetting('toman_migrated', true);
  }
  if ((await M.Store.countDocuments()) === 0) await M.Store.insertMany(STARS);
};
module.exports = M;
