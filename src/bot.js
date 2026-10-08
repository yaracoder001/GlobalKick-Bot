const cfg = require("./config");
const {
  User,
  Team,
  Store,
  Order,
  Listing,
  getSetting,
  setSetting,
  getChannel,
} = require("./db");
const api = require("./rubika");
const game = require("./game");
const { POS_FA, PACKS } = require("./data");

const L = {
  back: "بازگشت",
  myTeam: "تیم من",
  shop: "فروشگاه",
  table: "جدول",
  fixtures: "برنامه بازی‌ها",
  help: "راهنما",
  lineup: "ترکیب تیم",
  swap: "تعویض بازیکن",
  tactic: "تاکتیک",
  upPlayer: "ارتقای بازیکن",
  upCoach: "ارتقای مربی",
  upStaff: "ارتقای کادر فنی",
  upStadium: "ارتقای استادیوم",
  status: "وضعیت تیم",
  myCode: "کد تیم من",
  leave: "خروج از تیم",
  packs: "پک‌های سکه",
  stars: "بازیکنان ویژه",
  market: "بازار نقل‌وانتقال",
  mBuy: "خرید از بازار",
  mSell: "فروش بازیکن",
  mMine: "آگهی‌های من",
  pSeason: "شروع سیزن",
  pSched: "زمان‌بندی",
  pRun: "اجرای فوری",
  pTeams: "تیم‌ها",
  pCode: "ساخت کد",
  pCodes: "رمز تیم‌ها",
  pStars: "لیست بازیکن VIP",
  pFree: "آزادسازی",
  pCoins: "افزودن سکه",
  pStar: "افزودن بازیکن VIP",
  pStore: "افزودن بازیکن VIP به فروشگاه",
  pOrders: "سفارش‌ها",
  pCast: "پیام به کانال",
  pChan: "ثبت کانال",
  pExit: "خروج",
};
const MENUS = {
  main: [[L.myTeam, L.shop], [L.table, L.fixtures], [L.help]],
  team: [
    [L.lineup, L.swap],
    [L.tactic, L.upPlayer],
    [L.upCoach, L.upStaff],
    [L.upStadium, L.status],
    [L.myCode, L.leave],
    [L.back],
  ],
  shop: [[L.packs, L.stars], [L.market], [L.back]],
  market: [[L.mBuy, L.mSell], [L.mMine], [L.back]],
  owner: [
    [L.pRun, L.pSeason, L.pSched],
    [L.pStars, L.pStar],
    [L.pCode, L.pCodes, L.pTeams],
    [L.pStore],
    [L.pOrders, L.pFree, L.pCoins],
    [L.pCast, L.pChan],
    [L.pExit],
  ],
  admin: [
    [L.pSeason, L.pRun, L.pSched],
    [L.pStars, L.pFree],
    [L.pCode, L.pTeams, L.pCodes],
    [L.pExit],
  ],
};
const MENU_TEXTS = new Set(Object.values(L));
const SKIP = "⏭ بدون عکس",
  CONFIRM = "✅ تایید شروع سیزن";
const CAT = {
  "🧤 دروازه‌بان": "GK",
  "🛡 مدافع": "DEF",
  "🎯 هافبک": "MID",
  "⚡ مهاجم": "FWD",
};
const STYLE_FA = { attack: "هجومی", balanced: "متعادل", defense: "دفاعی" };
const STYLE_BTN = {
  "⚔️ هجومی": "attack",
  "⚖️ متعادل": "balanced",
  "🛡 دفاعی": "defense",
};
const FORM_BTN = Object.keys(game.FORMS).map((f) => `📐 ${f}`);
const MAXLV = 10,
  MAXR = 99,
  MIN_SELL = 500,
  FEE = 0.05;

const en = (x) =>
  x
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
const fmt = (n) => Number(n).toLocaleString("en-US");
const pl = (p, i) =>
  `${i + 1}) ${p.injury ? "🤕" : ""}${p.premium ? "⭐" : ""}${p.name} | ${POS_FA[p.pos]} | ${p.rating}`;
const chunk = (a, n = 2) =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) =>
    a.slice(i * n, i * n + n),
  );
const teamBtn = (t) => `${t.flag} ${t.name}`;
const teamRows = (ts) => [...chunk(ts.map(teamBtn), 2), [L.back]];
const findTeam = (txt) =>
  Team.findOne({ name: txt.slice(txt.indexOf(" ") + 1).trim() });
const dep = (price) => Math.max(200, Math.round(price * 0.1));
const isStaff = (u) => u.role === "owner" || u.role === "admin";
const myTeam = (u) => (u.teamId ? Team.findById(u.teamId) : null);
const code6 = () =>
  "GK-" + Math.random().toString(36).slice(2, 8).toUpperCase();

async function menu(chat, u, name, text) {
  u.state = null;
  u.ctx = {};
  u.markModified("ctx");
  await u.save();
  const key =
    name === "panel" ? (u.role === "owner" ? "owner" : "admin") : name;
  return api.send(chat, text || "منوی اصلی", MENUS[key]);
}
const ask = async (chat, u, state, text, rows, ctx) => {
  u.state = state;
  if (ctx) {
    u.ctx = ctx;
    u.markModified("ctx");
  }
  await u.save();
  return api.send(chat, text, rows || [[L.back]]);
};
// خروج: کاربر از دیتابیس پاک می‌شود (اگر تیم نداشته باشد) و منو به حالت اولیه برمی‌گردد
async function logout(u, chat, text) {
  if (u.teamId) {
    u.role = "user";
    u.state = null;
    u.ctx = {};
    u.markModified("ctx");
    await u.save();
  } else await User.deleteOne({ _id: u._id });
  return api.send(chat, text, [["/start"]]);
}

// عکس اصلی بازیکن ویژه بدون هیچ ویرایشی در کانال و گروه
async function readPhoto(t, m) {
  if (t === SKIP) return { id: null };
  const id = m?.file?.file_id;
  return id ? { id } : null;
}
async function announce(caption, photoId) {
  const targets = [await getChannel(), await getSetting("group")].filter(
    Boolean,
  );
  if (!targets.length) return "⚠️ کانال/گروه ثبت نشده.";
  for (const c of targets) {
    if (photoId) {
      if (await api.sendFileId(c, photoId, caption)) continue;
      const buf = await api.download(photoId);
      if (buf) {
        await api.sendImage(c, buf, caption);
        continue;
      }
    }
    await api.send(c, caption);
  }
  return "📡 در کانال/گروه منتشر شد.";
}

function lineupText(t) {
  const st = t.players
    .filter((p) => p.slot !== null)
    .sort((a, b) => a.slot - b.slot);
  const bench = t.players.filter((p) => p.slot === null);
  const g = (pos) =>
    st
      .filter((p) => p.pos === pos)
      .map((p) => `${p.injury ? "🤕" : ""}${p.name}(${p.rating})`)
      .join(" | ");
  return (
    `📋 ترکیب ${t.flag} ${t.name} (${t.formation || "4-3-3"})\n\n🧤 ${g("GK")}\n🛡 ${g("DEF")}\n🎯 ${g("MID")}\n⚡ ${g("FWD")}\n\n🪑 ذخیره‌ها:\n` +
    (bench
      .map(
        (p) =>
          `• ${p.injury ? "🤕" : ""}${p.premium ? "⭐" : ""}${p.name} | ${POS_FA[p.pos]} | ${p.rating}`,
      )
      .join("\n") || "—") +
    `\n\n💪 قدرت تیم: ${game.strength(t).toFixed(1)}\n🤕 = مصدوم (خودکار با ذخیره‌ی سالم جایگزین می‌شود)`
  );
}
const statusText = (t) =>
  `${t.flag} ${t.name}\n💰 سکه: ${fmt(t.coins)}\n👨‍🏫 مربی: سطح ${t.coach}\n🛠 کادر فنی: سطح ${t.staff}\n🏟 استادیوم: سطح ${t.stadium}\n` +
  `🧠 چیدمان: ${t.formation || "4-3-3"} | سبک: ${STYLE_FA[t.style || "balanced"]}\n` +
  `📊 بازی ${t.p} | برد ${t.w} | مساوی ${t.d} | باخت ${t.l}\n⚽ گل زده ${t.gf} | گل خورده ${t.ga} | امتیاز ${t.pts}`;
const packsText = () =>
  "🪙 پک‌های سکه (پرداخت با تومان)\n\n" +
  PACKS.map((p) => `🪙 ${fmt(p.coins)} سکه — ${fmt(p.price)} تومان`).join("\n");
const starsText = (stars) =>
  "⭐ بازیکنان VIP\n" +
  (Object.entries(CAT)
    .map(([lbl, pos]) => {
      const l = stars.filter((s) => s.pos === pos);
      return l.length
        ? `\n${lbl}\n` +
            l
              .map((s) => `• ${s.name} | ${s.rating} | ${fmt(s.price)} تومان`)
              .join("\n")
              .join("\n")
        : "";
    })
    .join("") || "\nفعلاً بازیکنی نیست.");
const catRows = () => [
  Object.keys(CAT).slice(0, 2),
  Object.keys(CAT).slice(2),
  [L.back],
];
const starsIn = async (pos) => await Store.find({ pos }).sort({ price: 1 });

const HELP = `⚽ Global Kick
۱) با /team و رمز تیم وارد تیمتان شوید (رمز را از «کد تیم من» دوباره می‌بینید).
۲) از «تیم من» ترکیب، تاکتیک و ارتقاها را مدیریت کنید.
۳) «فروشگاه»: پک سکه و بازیکن VIP (با تومان) + بازار نقل‌وانتقال (خرید/فروش بازیکن بین تیم‌ها با گرو).
۴) هر سیزن ۲۵ روز است: ۱۵ روز لیگ، بعد حذفی (یک‌هشتم تا فینال). نتیجه و جدول داخل گروه اعلام می‌شود.
دستورها: /start  /team  /panel`;

const S = {};
// ---------- ورود/خروج ----------
S.join = async (u, t, chat) => {
  if (u.teamId) return menu(chat, u, "main", "شما قبلاً تیم دارید.");
  const team = await Team.findOne({ joinCode: t.trim().toUpperCase() });
  if (!team) return api.send(chat, "❌ کد نامعتبر است. دوباره بفرستید:");
  if (team.ownerUid && team.ownerUid !== u.uid)
    return api.send(chat, "❌ این تیم صاحب دارد.");
  team.ownerUid = u.uid;
  await team.save();
  u.teamId = team._id;
  await u.save();
  return menu(
    chat,
    u,
    "main",
    `🎉 شما سرمربی ${teamBtn(team)} هستید.\n💰 ${fmt(team.coins)} سکه`,
  );
};
S.pass = async (u, t, chat) => {
  if (t === cfg.ownerPass) u.role = "owner";
  else if (t === cfg.adminPass) u.role = "admin";
  else return api.send(chat, "❌ رمز اشتباه است.");
  await u.save();
  return menu(
    chat,
    u,
    "panel",
    u.role === "owner" ? "👑 پنل مالک" : "🛡 پنل ادمین",
  );
};
// ---------- تعویض (با دسته‌بندی پست) ----------
S.swapcat = async (u, t, chat) => {
  const pos = CAT[t];
  if (!pos) return api.send(chat, "یکی از دسته‌ها را انتخاب کنید.");
  const team = await myTeam(u),
    bench = team.players.filter((p) => p.slot === null && p.pos === pos);
  if (!bench.length) return api.send(chat, "در این پست ذخیره ندارید.");
  return ask(
    chat,
    u,
    "swap1",
    `کدام ${POS_FA[pos]} ذخیره وارد زمین شود؟`,
    [...bench.map((p, i) => [pl(p, i)]), [L.back]],
    { pos },
  );
};
S.swap1 = async (u, t, chat) => {
  const team = await myTeam(u),
    pos = u.ctx.pos,
    bench = team.players.filter((p) => p.slot === null && p.pos === pos);
  const p = bench[parseInt(t) - 1];
  if (!p) return api.send(chat, "از دکمه‌ها انتخاب کنید.");
  const same = team.players.filter((x) => x.slot !== null && x.pos === pos);
  return ask(
    chat,
    u,
    "swap2",
    `کدام بازیکن اصلی جای ${p.name} بیرون برود؟`,
    [...same.map((x, i) => [pl(x, i)]), [L.back]],
    { pos, bench: String(p._id) },
  );
};
S.swap2 = async (u, t, chat) => {
  const team = await myTeam(u),
    bp = team.players.id(u.ctx.bench);
  const same = team.players.filter((x) => x.slot !== null && x.pos === bp.pos),
    out = same[parseInt(t) - 1];
  if (!out) return api.send(chat, "از دکمه‌ها انتخاب کنید.");
  bp.slot = out.slot;
  out.slot = null;
  await team.save();
  return menu(
    chat,
    u,
    "team",
    `✅ ${bp.name} جایگزین ${out.name} شد.\n\n${lineupText(team)}`,
  );
};
S.tac = async (u, t, chat) => {
  const team = await myTeam(u);
  if (STYLE_BTN[t]) {
    team.style = STYLE_BTN[t];
    await team.save();
    return api.send(chat, `✅ سبک بازی: ${STYLE_FA[team.style]}`);
  }
  const f = t.replace("📐 ", "");
  if (game.FORMS[f]) {
    if (!game.applyFormation(team, f))
      return api.send(chat, "❌ برای این چیدمان بازیکن کافی ندارید.");
    await team.save();
    return api.send(chat, `✅ چیدمان ${f} اعمال شد.\n\n${lineupText(team)}`);
  }
  return api.send(chat, "از دکمه‌ها انتخاب کنید.");
};
S.upg = async (u, t, chat) => {
  const team = await myTeam(u),
    p = team.players[parseInt(t) - 1];
  if (!p) return api.send(chat, "از دکمه‌ها انتخاب کنید.");
  if (p.rating >= MAXR) return api.send(chat, "این بازیکن به سقف رسیده.");
  const c = (p.rating - 50) * 30;
  if (team.coins < c)
    return api.send(
      chat,
      `❌ سکه کافی نیست. هزینه: ${fmt(c)} | موجودی: ${fmt(team.coins)}`,
    );
  team.coins -= c;
  p.rating += 1;
  await team.save();
  return ask(
    chat,
    u,
    "upg",
    `✅ ${p.name} به ${p.rating} رسید. (−${fmt(c)} | باقی: ${fmt(team.coins)})`,
    [...team.players.map((x, i) => [pl(x, i)]), [L.back]],
  );
};
// ---------- فروشگاه ----------
S.packs = async (u, t, chat) => {
  const pk = PACKS.find(
    (p) => t.includes(fmt(p.coins)) && t.includes(fmt(p.price)),
  );
  if (!pk) return api.send(chat, "از دکمه‌ها انتخاب کنید.");
  const team = await myTeam(u),
    no = (await Order.countDocuments()) + 1;
  await Order.create({
    no,
    kind: "coins",
    uid: u.uid,
    teamId: team._id,
    teamName: team.name,
    coins: pk.coins,
    price: pk.price,
  });
  for (const o of await User.find({ role: "owner" }))
    api.send(o.uid, `🧾 سفارش #${no}: ${team.name} - ${fmt(pk.coins)} سکه`);
  return menu(
    chat,
    u,
    "shop",
    `🧾 سفارش #${no} ثبت شد.\n🪙 ${fmt(pk.coins)} سکه | 💵 ${fmt(pk.price)} تومان\n\n${cfg.payInfo}\nپس از پرداخت، رسید و شماره سفارش را به ${cfg.support} بفرستید.`,
  );
};
S.starcat = async (u, t, chat) => {
  const pos = CAT[t];
  if (!pos) return api.send(chat, "یکی از دسته‌ها را انتخاب کنید.");
  const stars = await starsIn(pos);
  if (!stars.length) return api.send(chat, "در این دسته بازیکنی نیست.");
  return ask(
    chat,
    u,
    "buyStar",
    `${t}\n\n` +
      stars
        .map(
          (s, i) => `${i + 1}) ${s.name} | ${s.rating} | ${fmt(s.price)} تومان`,
        )
        .join("\n") +
      "\n\nبرای خرید انتخاب کنید (سفارش ثبت و پس از پرداخت اعمال می‌شود):",
    [
      ...stars.map((s, i) => [`${i + 1}) ${s.name} - ${fmt(s.price)} تومان`]),
      [L.back],
    ],
    { pos },
  );
};
S.buyStar = async (u, t, chat) => {
  const team = await myTeam(u),
    s = (await starsIn(u.ctx.pos))[parseInt(t) - 1];
  if (!s) return api.send(chat, "از دکمه‌ها انتخاب کنید.");
  if (team.players.some((p) => p.premium && p.name === s.name))
    return api.send(chat, "این بازیکن را قبلاً دارید.");
  const no = (await Order.countDocuments()) + 1;
  await Order.create({
    no,
    kind: "player",
    uid: u.uid,
    teamId: team._id,
    teamName: team.name,
    price: s.price,
    starName: s.name,
    starPos: s.pos,
    starRating: s.rating,
  });
  for (const o of await User.find({ role: "owner" }))
    api.send(
      o.uid,
      `🧾 سفارش VIP #${no}: ${team.name} - ${s.name} (${fmt(s.price)} تومان)`,
    );
  return menu(
    chat,
    u,
    "shop",
    `🧾 سفارش #${no} ثبت شد.\n⭐ ${s.name} | 💵 ${fmt(s.price)} تومان\n\n${cfg.payInfo}\nپس از پرداخت، رسید و شماره سفارش را به ${cfg.support} بفرستید.`,
  );
};
// ---------- بازار نقل‌وانتقال ----------
S.sell1 = async (u, t, chat) => {
  const team = await myTeam(u),
    p = team.players.filter((x) => x.slot === null)[parseInt(t) - 1];
  if (!p) return api.send(chat, "از دکمه‌ها انتخاب کنید.");
  return ask(
    chat,
    u,
    "sell2",
    `قیمت فروش ${p.name} را (به سکه، حداقل ${MIN_SELL}) بنویسید.\n🔒 گرو: ۱۰٪ قیمت (حداقل ۲۰۰ سکه) از موجودی شما کسر و پس از فروش یا لغو برگردانده می‌شود.\n💸 کارمزد فروش: ۵٪`,
    [[L.back]],
    { pid: String(p._id) },
  );
};
S.sell2 = async (u, t, chat) => {
  const price = parseInt(en(t).replace(/[,٬]/g, ""));
  if (isNaN(price) || price < MIN_SELL)
    return api.send(chat, `عدد معتبر (حداقل ${MIN_SELL}) بنویسید.`);
  const team = await myTeam(u),
    p = team.players.id(u.ctx.pid);
  if (!p || p.slot !== null)
    return menu(chat, u, "market", "بازیکن در دسترس نیست.");
  const d = dep(price);
  if (team.coins < d)
    return api.send(
      chat,
      `❌ برای گرو ${fmt(d)} سکه لازم است. موجودی: ${fmt(team.coins)}`,
    );
  const snap = {
    name: p.name,
    pos: p.pos,
    rating: p.rating,
    premium: p.premium,
  };
  team.coins -= d;
  team.players.pull(p._id);
  await team.save();
  const no = (await Listing.countDocuments()) + 1;
  await Listing.create({
    no,
    sellerTeam: team._id,
    sellerUid: u.uid,
    sellerName: team.name,
    player: snap,
    price,
    deposit: d,
  });
  return menu(
    chat,
    u,
    "market",
    `✅ آگهی #${no} ثبت شد: ${snap.name} - ${fmt(price)} سکه\n🔒 گرو ${fmt(d)} سکه نگه داشته شد.`,
  );
};
S.mbuy = async (u, t, chat) => {
  const l = (
    await Listing.find({ status: "active", sellerUid: { $ne: u.uid } })
      .sort({ price: 1 })
      .limit(30)
  )[parseInt(t) - 1];
  if (!l) return api.send(chat, "از دکمه‌ها انتخاب کنید.");
  const buyer = await myTeam(u);
  if (buyer.coins < l.price)
    return api.send(
      chat,
      `❌ سکه کافی نیست. قیمت: ${fmt(l.price)} | موجودی: ${fmt(buyer.coins)}`,
    );
  if (
    !(await Listing.findOneAndUpdate(
      { _id: l._id, status: "active" },
      { status: "sold" },
    ))
  )
    return api.send(chat, "این آگهی دیگر فعال نیست.");
  buyer.coins -= l.price;
  buyer.players.push({ ...l.player, slot: null });
  await buyer.save();
  const seller = await Team.findById(l.sellerTeam),
    fee = Math.round(l.price * FEE),
    gain = l.price - fee + l.deposit;
  seller.coins += gain;
  await seller.save();
  api.send(
    l.sellerUid,
    `💸 ${l.player.name} فروخته شد!\n+${fmt(l.price - fee)} سکه (کارمزد ${fmt(fee)}) + برگشت گرو ${fmt(l.deposit)}`,
  );
  return menu(
    chat,
    u,
    "market",
    `✅ ${l.player.name} به ذخیره‌های شما اضافه شد.`,
  );
};
S.mcancel = async (u, t, chat) => {
  const m = t.match(/#(\d+)/),
    l =
      m &&
      (await Listing.findOneAndUpdate(
        { no: +m[1], sellerUid: u.uid, status: "active" },
        { status: "cancelled" },
      ));
  if (!l) return api.send(chat, "از دکمه‌ها انتخاب کنید.");
  const team = await myTeam(u);
  team.players.push({ ...l.player, slot: null });
  team.coins += l.deposit;
  await team.save();
  return menu(
    chat,
    u,
    "market",
    `✅ آگهی لغو شد. بازیکن و گرو (${fmt(l.deposit)} سکه) برگشت.`,
  );
};
// ---------- پنل ----------
S.pCode = async (u, t, chat) => {
  const team = await findTeam(t);
  if (!team) return api.send(chat, "از دکمه‌ها انتخاب کنید.");
  if (team.ownerUid) return api.send(chat, "این تیم صاحب دارد.");
  team.joinCode = code6();
  await team.save();
  return menu(chat, u, "panel", `✅ رمز ${teamBtn(team)}:\n${team.joinCode}`);
};
S.pFree = async (u, t, chat) => {
  const team = await findTeam(t);
  if (!team) return api.send(chat, "از دکمه‌ها انتخاب کنید.");
  if (team.ownerUid)
    await User.updateOne({ uid: team.ownerUid }, { teamId: null });
  team.ownerUid = null;
  team.joinCode = null;
  await team.save();
  return menu(chat, u, "panel", `✅ ${team.name} آزاد شد (رمز قبلی باطل شد).`);
};
S.pCoins1 = async (u, t, chat) => {
  const team = await findTeam(t);
  if (!team) return api.send(chat, "از دکمه‌ها انتخاب کنید.");
  return ask(
    chat,
    u,
    "pCoins2",
    `تعداد سکه برای ${team.name} (منفی = کسر):`,
    [PACKS.slice(0, 3).map((p) => String(p.coins)), [L.back]],
    { team: team.key },
  );
};
S.pCoins2 = async (u, t, chat) => {
  const n = parseInt(en(t).replace(/,/g, ""));
  if (isNaN(n)) return api.send(chat, "عدد وارد کنید.");
  const team = await Team.findOne({ key: u.ctx.team });
  team.coins = Math.max(0, team.coins + n);
  await team.save();
  if (team.ownerUid)
    api.send(
      team.ownerUid,
      `🪙 مدیریت ${fmt(n)} سکه اضافه کرد. موجودی: ${fmt(team.coins)}`,
    );
  return menu(chat, u, "panel", `✅ موجودی ${team.name}: ${fmt(team.coins)}`);
};
S.pStar1 = async (u, t, chat) => {
  const team = await findTeam(t);
  if (!team) return api.send(chat, "از دکمه‌ها انتخاب کنید.");
  return ask(
    chat,
    u,
    "pStarCat",
    `پست بازیکن ویژه برای ${team.name}؟`,
    catRows(),
    { team: team.key },
  );
};
S.pStarCat = async (u, t, chat) => {
  const pos = CAT[t];
  if (!pos) return api.send(chat, "یکی از دسته‌ها را انتخاب کنید.");
  const stars = await starsIn(pos);
  if (!stars.length) return api.send(chat, "در این دسته بازیکنی نیست.");
  return ask(
    chat,
    u,
    "pStar2",
    "کدام بازیکن؟",
    [...stars.map((s, i) => [`${i + 1}) ${s.name} | ${s.rating}`]), [L.back]],
    { team: u.ctx.team, pos },
  );
};
S.pStar2 = async (u, t, chat) => {
  const s = (await starsIn(u.ctx.pos))[parseInt(t) - 1];
  if (!s) return api.send(chat, "از دکمه‌ها انتخاب کنید.");
  return ask(
    chat,
    u,
    "pStarPhoto",
    "📸 عکس بازیکن را بفرستید (همان عکس اصلی، بدون ویرایش، در کانال/گروه منتشر می‌شود) یا «بدون عکس».",
    [[SKIP], [L.back]],
    { team: u.ctx.team, star: String(s._id) },
  );
};
S.pStarPhoto = async (u, t, chat, m) => {
  const ph = await readPhoto(t, m);
  if (!ph) return api.send(chat, "یک عکس بفرستید یا «بدون عکس» را بزنید.");
  const s = await Store.findById(u.ctx.star),
    team = await Team.findOne({ key: u.ctx.team });
  team.players.push({
    name: s.name,
    pos: s.pos,
    rating: s.rating,
    premium: true,
    slot: null,
  });
  await team.save();
  if (team.ownerUid)
    api.send(
      team.ownerUid,
      `⭐ بازیکن ویژه ${s.name} از طرف مدیریت به تیم شما اضافه شد!`,
    );
  const r = await announce(
    `🔥 انتقال ویژه!\n⭐ ${s.name} (${POS_FA[s.pos]} - ${s.rating}) به ${teamBtn(team)} پیوست.`,
    ph.id,
  );
  return menu(chat, u, "panel", `✅ ${s.name} به ${team.name} اضافه شد.\n${r}`);
};
S.ps1 = async (u, t, chat) => {
  const pos = CAT[t];
  if (!pos) return api.send(chat, "یکی از دسته‌ها را انتخاب کنید.");
  return ask(
    chat,
    u,
    "ps2",
    `✍️ مرحله ۲/۴ — نام بازیکن (${t}) را بنویسید:`,
    [[L.back]],
    { pos },
  );
};
S.ps2 = async (u, t, chat) => {
  if (t.length < 2 || t.length > 40)
    return api.send(chat, "نام معتبر بنویسید.");
  return ask(
    chat,
    u,
    "ps3",
    "⭐ مرحله ۳/۴ — امتیاز بازیکن (۶۰ تا ۹۹):",
    [[L.back]],
    { ...u.ctx, name: t },
  );
};
S.ps3 = async (u, t, chat) => {
  const r = parseInt(en(t));
  if (isNaN(r) || r < 60 || r > 99)
    return api.send(chat, "عددی بین ۶۰ تا ۹۹ بنویسید.");
  return ask(
    chat,
    u,
    "ps4",
    "💵 مرحله ۴/۴ — قیمت واقعی به «تومان» (مثلاً 450000):",
    [[L.back]],
    { ...u.ctx, rating: r },
  );
};
S.ps4 = async (u, t, chat) => {
  const p = parseInt(en(t).replace(/[,٬]/g, ""));
  if (isNaN(p) || p < 1000)
    return api.send(chat, "قیمت معتبر به تومان بنویسید.");
  return ask(
    chat,
    u,
    "pStorePhoto",
    "📸 عکس بازیکن را بفرستید (عکس اصلی، بدون ویرایش، منتشر می‌شود) یا «بدون عکس».",
    [[SKIP], [L.back]],
    { ...u.ctx, price: p },
  );
};
S.pStorePhoto = async (u, t, chat, m) => {
  const ph = await readPhoto(t, m);
  if (!ph) return api.send(chat, "یک عکس بفرستید یا «بدون عکس» را بزنید.");
  const c = u.ctx;
  await Store.create({
    name: c.name,
    pos: c.pos,
    rating: c.rating,
    price: c.price,
    photo: ph.id,
  });
  const r = await announce(
    `⭐ بازیکن ویژه جدید در فروشگاه Global Kick!\n👤 ${c.name} | ${POS_FA[c.pos]} | ${c.rating}\n💵 قیمت: ${fmt(c.price)} تومان`,
    ph.id,
  );
  return menu(chat, u, "panel", `✅ به فروشگاه اضافه شد.\n${r}`);
};
S.pOrder = async (u, t, chat) => {
  const m = t.match(/#(\d+)/),
    o = m && (await Order.findOne({ no: +m[1], status: "pending" }));
  if (!o) return api.send(chat, "از دکمه‌ها انتخاب کنید.");
  const ok = t.startsWith("✅");
  o.status = ok ? "done" : "rejected";
  await o.save();
  if (!ok) {
    api.send(o.uid, `❌ سفارش #${o.no} رد شد.`);
    return menu(chat, u, "panel", "❌ رد شد.");
  }
  const team = await Team.findById(o.teamId);
  if (o.kind === "player") {
    team.players.push({
      name: o.starName,
      pos: o.starPos,
      rating: o.starRating,
      premium: true,
      slot: null,
    });
    api.send(
      o.uid,
      `✅ سفارش #${o.no} تایید شد. ⭐ ${o.starName} به ذخیره‌های شما اضافه شد.`,
    );
  } else {
    team.coins += o.coins;
    api.send(
      o.uid,
      `✅ سفارش #${o.no} تایید شد. ${fmt(o.coins)} سکه اضافه شد.`,
    );
  }
  await team.save();
  return menu(chat, u, "panel", "✅ تایید و اعمال شد.");
};
S.pCast = async (u, t, chat) => {
  const ch = await getChannel();
  if (!ch)
    return menu(
      chat,
      u,
      "panel",
      "⚠️ کانال ثبت نشده. «ثبت کانال» یا CHANNEL_ID.",
    );
  await api.send(ch, `📢 ${t}`);
  return menu(chat, u, "panel", "✅ در کانال منتشر شد.");
};
S.pChan = async (u, t, chat) => {
  await setSetting("channel", t.trim());
  await api.send(t.trim(), "✅ ربات Global Kick به این کانال متصل شد.");
  return menu(
    chat,
    u,
    "panel",
    "✅ کانال ثبت شد و پیام تست ارسال شد. (ربات باید ادمین کانال باشد)",
  );
};
S.pSched = async (u, t, chat) => {
  const m = en(t).match(/(\d{1,2}):(\d{2})/);
  if (!m || +m[1] > 23 || +m[2] > 59)
    return api.send(chat, "قالب اشتباه. مثال: 16:00");
  await setSetting("schedule", { start: `${m[1].padStart(2, "0")}:${m[2]}` });
  await game.assignTimes();
  const times = await game.slotTimes();
  await game.broadcast(
    `⏰ زمان‌بندی مسابقات Global Kick\nهر روز نوبت‌های بازی: ${times.join(" | ")}\n(هر ${cfg.gapH} ساعت یک نوبت)`,
  );
  return menu(
    chat,
    u,
    "panel",
    `✅ ثبت شد. نوبت‌های روزانه: ${times.join(" | ")}\nحالا «شروع سیزن» را بزنید (اگر قبلاً شروع شده، برنامه خودکار به‌روز شد).`,
  );
};
S.pSeason = async (u, t, chat) => {
  if (t !== CONFIRM) return api.send(chat, "برای شروع، دکمه تایید را بزنید.");
  const s = await getSetting("season"),
    sd = await game.startSeason(s?.no || 1);
  return menu(
    chat,
    u,
    "panel",
    sd
      ? `✅ سیزن شروع شد. روز اول: ${sd}\nبرنامه در کانال/گروه اعلام شد.`
      : "⚠️ ابتدا «زمان‌بندی مسابقات» را تنظیم کنید.",
  );
};

async function route(u, t, chat, m) {
  if (t === "/start")
    return menu(
      chat,
      u,
      "main",
      "⚽ به Global Kick خوش آمدید!\nورود به تیم: /team",
    );
  if (t === "/team") return ask(chat, u, "join", "رمز تیم را بفرستید:");
  if (t === "/panel")
    return isStaff(u)
      ? menu(
          chat,
          u,
          "panel",
          u.role === "owner" ? "👑 پنل مالک" : "🛡 پنل ادمین",
        )
      : ask(chat, u, "pass", "🔐 رمز پنل را وارد کنید:");
  if (t === L.back) return menu(chat, u, "main");
  if (t === L.pExit)
    return logout(
      u,
      chat,
      "🚪 از پنل خارج شدید. برای شروع دوباره /start بزنید.",
    );
  if (MENU_TEXTS.has(t)) {
    u.state = null;
    await u.save();
  } else if (u.state && S[u.state]) return S[u.state](u, t, chat, m);

  const staff = isStaff(u),
    owner = u.role === "owner",
    team = await myTeam(u);
  const needTeam = () =>
    api.send(chat, "⚠️ هنوز تیم ندارید. با /team و رمز تیم وارد شوید.");
  switch (t) {
    case L.help:
      return api.send(chat, HELP);
    case L.table:
      return game.sendTable(chat, "🏆 جدول رده‌بندی");
    case L.fixtures:
      return api.send(chat, await game.upcomingText());
    case L.myTeam:
      return team ? menu(chat, u, "team", statusText(team)) : needTeam();
    case L.status:
      return team ? api.send(chat, statusText(team)) : needTeam();
    case L.lineup:
      return team ? api.send(chat, lineupText(team)) : needTeam();
    case L.myCode:
      return team
        ? api.send(
            chat,
            `🔑 رمز تیم شما:\n${team.joinCode || "—"}\n(برای ورود دوباره: /team)`,
          )
        : needTeam();
    case L.leave: {
      if (!team) return needTeam();
      const c = team.joinCode;
      team.ownerUid = null;
      await team.save();
      return logout(
        Object.assign(u, { teamId: null, role: staff ? u.role : "user" }),
        chat,
        `🚪 از تیم ${team.name} خارج شدید.\nبرای ورود دوباره /team و رمز: ${c}`,
      );
    }
    case L.swap:
      if (!team) return needTeam();
      return ask(chat, u, "swapcat", "کدام پست؟", [
        Object.keys(CAT).slice(0, 2),
        Object.keys(CAT).slice(2),
        [L.back],
      ]);
    case L.tactic:
      if (!team) return needTeam();
      return ask(
        chat,
        u,
        "tac",
        `🧠 تاکتیک: ${team.formation || "4-3-3"} | ${STYLE_FA[team.style || "balanced"]}\n\n📐 چیدمان: بهترین بازیکنان هر پست خودکار انتخاب می‌شوند.\n⚔️ هجومی = گل بیشتر/دفاع ضعیف‌تر | 🛡 دفاعی = برعکس.`,
        [...chunk(FORM_BTN, 3), Object.keys(STYLE_BTN), [L.back]],
      );
    case L.upPlayer:
      if (!team) return needTeam();
      return ask(
        chat,
        u,
        "upg",
        `کدام بازیکن +۱ شود؟ (هزینه = (امتیاز−۵۰)×۳۰)\n💰 ${fmt(team.coins)} سکه`,
        [...team.players.map((p, i) => [pl(p, i)]), [L.back]],
      );
    case L.upCoach:
    case L.upStaff:
    case L.upStadium: {
      if (!team) return needTeam();
      const f =
        t === L.upCoach ? "coach" : t === L.upStaff ? "staff" : "stadium";
      if (team[f] >= MAXLV) return api.send(chat, "به سقف سطح رسیده.");
      const c = team[f] * 600;
      if (team.coins < c)
        return api.send(
          chat,
          `❌ سکه کافی نیست. هزینه: ${fmt(c)} | موجودی: ${fmt(team.coins)}`,
        );
      team.coins -= c;
      team[f] += 1;
      await team.save();
      return api.send(
        chat,
        `✅ سطح ${team[f]} (−${fmt(c)} | باقی: ${fmt(team.coins)})`,
      );
    }
    case L.shop:
      return team ? menu(chat, u, "shop", "🛒 فروشگاه") : needTeam();
    case L.packs:
      if (!team) return needTeam();
      return ask(chat, u, "packs", packsText(), [
        ...PACKS.map((p) => [`🪙 ${fmt(p.coins)} سکه — ${fmt(p.price)} تومان`]),
        [L.back],
      ]);
    case L.stars: {
      if (!team) return needTeam();
      return ask(
        chat,
        u,
        "starcat",
        starsText(await Store.find()) + "\n\nپست مورد نظر را انتخاب کنید:",
        catRows(),
      );
    }
    case L.market:
      return team
        ? menu(
            chat,
            u,
            "market",
            "🔁 بازار نقل‌وانتقال\nفروش بازیکن نیازمند گرو (۱۰٪ قیمت) است که پس از فروش/لغو برمی‌گردد. کارمزد ۵٪.",
          )
        : needTeam();
    case L.mSell: {
      if (!team) return needTeam();
      const bench = team.players.filter((p) => p.slot === null);
      if (!bench.length)
        return api.send(
          chat,
          "ذخیره‌ای برای فروش ندارید (بازیکن داخل زمین قابل فروش نیست).",
        );
      return ask(
        chat,
        u,
        "sell1",
        `کدام ذخیره را بفروشید؟\n💰 موجودی: ${fmt(team.coins)}`,
        [...bench.map((p, i) => [pl(p, i)]), [L.back]],
      );
    }
    case L.mBuy: {
      if (!team) return needTeam();
      const ls = await Listing.find({
        status: "active",
        sellerUid: { $ne: u.uid },
      })
        .sort({ price: 1 })
        .limit(30);
      if (!ls.length) return api.send(chat, "فعلاً آگهی‌ای نیست.");
      const row = (l, i) =>
        `${i + 1}) ${l.player.premium ? "⭐" : ""}${l.player.name} | ${POS_FA[l.player.pos]} | ${l.player.rating} | ${fmt(l.price)} سکه`;
      return ask(
        chat,
        u,
        "mbuy",
        `🛍 آگهی‌ها (موجودی شما: ${fmt(team.coins)})`,
        [...ls.map((l, i) => [row(l, i)]), [L.back]],
      );
    }
    case L.mMine: {
      if (!team) return needTeam();
      const ls = await Listing.find({ sellerUid: u.uid, status: "active" });
      if (!ls.length) return api.send(chat, "آگهی فعالی ندارید.");
      return ask(
        chat,
        u,
        "mcancel",
        ls
          .map(
            (l) =>
              `#${l.no} ${l.player.name} - ${fmt(l.price)} سکه (گرو ${fmt(l.deposit)})`,
          )
          .join("\n") + "\n\nبرای لغو انتخاب کنید:",
        [...ls.map((l) => [`❌ لغو #${l.no}`]), [L.back]],
      );
    }
  }
  if (staff) {
    const all = await Team.find().sort({ name: 1 });
    switch (t) {
      case L.pSeason:
        return ask(
          chat,
          u,
          "pSeason",
          "⚠️ با شروع سیزن، جدول ریست و برنامه ۲۵ روزه ساخته می‌شود (۱۵ روز لیگ + حذفی). تایید می‌کنید؟",
          [[CONFIRM], [L.back]],
        );
      case L.pSched: {
        const sc = await getSetting("schedule"),
          times = await game.slotTimes();
        return ask(
          chat,
          u,
          "pSched",
          `⏰ شروع فعلی: ${sc?.start || "تنظیم نشده"}${times.length ? " (" + times.join(" | ") + ")" : ""}\n\nساعت پیش‌فرض ۱۴:۰۰ است و بازی‌ها تا ۲۲:۰۰ ادامه دارند. فقط اگر می‌خواهید عوض شود، ساعت شروع را بنویسید (مثلاً 14:00). ${cfg.slots} نوبت در روز و فاصله هر نوبت ${cfg.gapH} ساعت است؛ بازی‌های هر روز بین نوبت‌ها پخش می‌شوند.`,
        );
      }
      case L.pRun:
        return api.send(chat, await game.runNow());
      case L.pCode:
        return ask(
          chat,
          u,
          "pCode",
          "تیم بدون صاحب را انتخاب کنید:",
          teamRows(all.filter((x) => !x.ownerUid)),
        );
      case L.pFree:
        return ask(
          chat,
          u,
          "pFree",
          "کدام تیم آزاد شود؟",
          teamRows(all.filter((x) => x.ownerUid)),
        );
      case L.pTeams:
        return api.send(
          chat,
          "📋 تیم‌ها:\n" +
            all
              .map(
                (x) =>
                  `${teamBtn(x)} — ${x.ownerUid ? "👤 صاحب‌دار" : "⚪ آزاد"} | 💰${fmt(x.coins)}`,
              )
              .join("\n"),
        );
      case L.pCodes:
        return api.send(
          chat,
          "🔑 رمز تیم‌ها:\n" +
            all
              .map(
                (x) =>
                  `${teamBtn(x)}: ${x.joinCode || "—"}${x.ownerUid ? " 👤" : ""}`,
              )
              .join("\n"),
        );
      case L.pStars:
        return api.send(chat, starsText(await Store.find().sort({ price: 1 })));
    }
  }
  if (owner) {
    const all = await Team.find().sort({ name: 1 });
    switch (t) {
      case L.pCoins:
        return ask(chat, u, "pCoins1", "تیم را انتخاب کنید:", teamRows(all));
      case L.pStar:
        return ask(chat, u, "pStar1", "تیم را انتخاب کنید:", teamRows(all));
      case L.pStore:
        return ask(
          chat,
          u,
          "ps1",
          "🆕 ساخت بازیکن ویژه\n\n📍 مرحله ۱/۴ — پست بازیکن:",
          catRows(),
        );
      case L.pChan:
        return ask(
          chat,
          u,
          "pChan",
          "شناسه (chat_id) کانال را بفرستید. ربات باید ادمین کانال باشد.",
        );
      case L.pCast:
        return ask(
          chat,
          u,
          "pCast",
          "متن پیام برای «کانال» را بفرستید (به کاربران ربات ارسال نمی‌شود):",
        );
      case L.pOrders: {
        const os = await Order.find({ status: "pending" });
        if (!os.length) return api.send(chat, "سفارشی در انتظار نیست.");
        return ask(
          chat,
          u,
          "pOrder",
          os
            .map(
              (o) =>
                `#${o.no} ${o.teamName}: ${o.kind === "player" ? "⭐ " + o.starName : fmt(o.coins) + " سکه"} / ${fmt(o.price)} تومان`,
            )
            .join("\n"),
          [...os.map((o) => [`✅ تایید #${o.no}`, `❌ رد #${o.no}`]), [L.back]],
        );
      }
    }
  }
  return api.send(
    chat,
    "از دکمه‌های منو استفاده کنید یا /start بزنید.",
    MENUS.main,
  );
}

async function handle(upd) {
  const m = upd.new_message;
  if (!m || upd.type !== "NewMessage") return;
  const chat = upd.chat_id,
    text = (m.text || "").trim();
  if (!text && !m.file) return;
  const uid = m.sender_id || chat;
  const u = (await User.findOne({ uid })) || (await User.create({ uid }));
  if (chat.startsWith("g")) {
    if (text === "/setgroup" && isStaff(u)) {
      await setSetting("group", chat);
      return api.send(chat, "✅ این گروه برای اعلام نتایج ثبت شد.");
    }
    if (text === "/table" || text === "جدول")
      return game.sendTable(chat, "🏆 جدول رده‌بندی");
    return;
  }
  return route(u, text, chat, m);
}
module.exports = { handle };
