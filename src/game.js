const { Team, Fixture, getSetting, setSetting, getChannel } = require('./db');
const api = require('./rubika');
const cfg = require('./config');
const { tableImage, resultImage, sortedTeams } = require('./table');

// ---------- قوانین سیزن (۲۵ روز) ----------
// روز ۱ تا ۱۵: لیگ (هر روز یک هفته، هر تیم با حریف جدید) | روز ۱۷/۱۹/۲۱/۲۳: یک‌هشتم، یک‌چهارم، نیمه‌نهایی، فینال
// روز ۲۴ و ۲۵: استراحت | روز ۲۶ = شروع سیزن بعد
const LEAGUE_DAYS = 15, SEASON_DAYS = 25;
const KO_DAY = { R16: 17, QF: 19, SF: 21, F: 23 };
const KO_NEXT = { R16: 'QF', QF: 'SF', SF: 'F' };
const STAGE_FA = { L: 'لیگ', R16: 'یک‌هشتم نهایی', QF: 'یک‌چهارم نهایی', SF: 'نیمه‌نهایی', F: 'فینال' };
const CHAMP_COINS = 5000;

const p2 = (x) => String(x).padStart(2, '0');
const hm = (d) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const dstr = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const addDays = (str, n) => { const [y, m, d] = str.split('-').map(Number); return dstr(new Date(y, m - 1, d + n)); };
const atTime = (str, day, t) => { const [y, m, d] = str.split('-').map(Number); const [h, mi] = t.split(':').map(Number); return new Date(y, m - 1, d + day - 1, h, mi); };
const dayNum = (s, now = new Date()) => {
  const [y, m, d] = s.startDate.split('-').map(Number);
  return Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(y, m - 1, d)) / 864e5) + 1;
};

// ---------- شبیه‌ساز بازی ----------
// ترکیب موثر: بازیکن مصدوم با بهترین ذخیره‌ی سالم هم‌پست جایگزین می‌شود
function lineup(t) {
  const used = new Set();
  return t.players.filter((p) => p.slot !== null).map((p) => {
    if (!p.injury) return p;
    const sub = t.players.filter((x) => x.slot === null && !x.injury && x.pos === p.pos && !used.has(String(x._id))).sort((a, b) => b.rating - a.rating)[0];
    if (sub) { used.add(String(sub._id)); return sub; }
    return { name: p.name, pos: p.pos, rating: p.rating - 15, goals: 0 }; // بدون جایگزین: افت شدید
  });
}
function strength(t, home = false) {
  const l = lineup(t), avg = l.reduce((a, p) => a + p.rating, 0) / (l.length || 1);
  return avg + t.coach * 0.6 + t.staff * 0.4 + (home ? t.stadium * 0.3 + 1 : 0);
}
const pois = (lam) => { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; };
const lam = (a, b) => Math.min(4, Math.max(0.3, 1.4 * Math.exp((a - b) / 22)));
const FORMS = { '4-3-3': [4, 3, 3], '4-4-2': [4, 4, 2], '3-5-2': [3, 5, 2], '4-5-1': [4, 5, 1], '5-3-2': [5, 3, 2] };
const SM = { attack: [1.12, 1.1], balanced: [1, 1], defense: [0.88, 0.85] };
const sm = (t) => SM[t.style] || SM.balanced;

function applyFormation(t, f) {
  const [d, m, fw] = FORMS[f], need = { GK: 1, DEF: d, MID: m, FWD: fw }, pick = [];
  for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
    const c = t.players.filter((p) => p.pos === pos).sort((a, b) => b.rating - a.rating);
    if (c.length < need[pos]) return false;
    pick.push(...c.slice(0, need[pos]));
  }
  t.players.forEach((p) => (p.slot = null)); pick.forEach((p, i) => (p.slot = i)); t.formation = f;
  return true;
}
function scorers(t, n) {
  const w = { GK: 0, DEF: 1, MID: 3, FWD: 6 }, l = lineup(t), out = [];
  for (let i = 0; i < n; i++) {
    let r = Math.random() * l.reduce((a, p) => a + w[p.pos], 0), pick = l[0];
    for (const p of l) { r -= w[p.pos]; if (r <= 0) { pick = p; break; } }
    pick.goals += 1; out.push(pick.name);
  }
  return out;
}
// مصدومیت تصادفی: اول بازی‌های مصدومان کم می‌شود، بعد برای بازیکنان حاضر در زمین شانس مصدومیت (کادر فنی بالاتر = شانس کمتر)
function injuries(t) {
  const out = []; t.players.forEach((p) => { if (p.injury > 0) p.injury -= 1; });
  const chance = Math.max(0.02, 0.045 - t.staff * 0.002);
  for (const p of lineup(t)) {
    if (!p._id || p.injury > 0 || Math.random() >= chance) continue;
    const r = Math.random(); p.injury = r < 0.45 ? 1 : r < 0.7 ? 2 : r < 0.85 ? 3 : r < 0.95 ? 4 : 5;
    out.push(`${p.name} (${p.injury} بازی)`);
  }
  return out;
}
function apply(t, gf, ga, league) {
  if (league) {
    t.p++; t.gf += gf; t.ga += ga;
    if (gf > ga) { t.w++; t.pts += 3; } else if (gf === ga) { t.d++; t.pts += 1; } else t.l++;
  }
  t.coins += gf > ga ? 300 : gf === ga ? 100 : 50;
}
async function playMatch(h, a, league) {
  const hg = pois(lam(strength(h, true), strength(a)) * sm(h)[0] * sm(a)[1]);
  const ag = pois(lam(strength(a), strength(h, true)) * sm(a)[0] * sm(h)[1]);
  const hs = scorers(h, hg), as = scorers(a, ag);
  apply(h, hg, ag, league); apply(a, ag, hg, league);
  const ih = injuries(h), ia = injuries(a);
  await h.save(); await a.save();
  return { hg, ag, hs, as, ih, ia };
}

// ---------- برنامه و زمان‌بندی ----------
function roundRobin(ids) {
  const t = [...ids]; if (t.length % 2) t.push(null);
  const n = t.length, R = [];
  for (let r = 0; r < n - 1; r++) {
    const m = [];
    for (let i = 0; i < n / 2; i++) { const a = t[i], b = t[n - 1 - i]; if (a && b) m.push(r % 2 ? [b, a] : [a, b]); }
    R.push(m); t.splice(1, 0, t.pop());
  }
  return R;
}
async function slotTimes() {
  const sc = await getSetting('schedule');
  const out = [], st = toMin(sc?.start || '14:00'); // پیش‌فرض: ۱۴:۰۰، ۱۶:۰۰، ۱۸:۰۰، ۲۰:۰۰، ۲۲:۰۰
  for (let i = 0; i < cfg.slots; i++) { const m = st + i * cfg.gapH * 60; if (m >= 1440) break; out.push(`${p2(Math.floor(m / 60))}:${p2(m % 60)}`); }
  return out;
}
async function assignTimes() {
  const s = await getSetting('season'), times = await slotTimes();
  if (!s?.startDate || !times.length) return;
  const byDay = {};
  (await Fixture.find({ played: false }).sort({ day: 1, idx: 1 })).forEach((f) => (byDay[f.day] = byDay[f.day] || []).push(f));
  const ops = [];
  for (const [day, list] of Object.entries(byDay)) {
    const per = Math.ceil(list.length / times.length);
    list.forEach((f, i) => {
      const slot = Math.min(times.length - 1, Math.floor(i / per));
      ops.push({ updateOne: { filter: { _id: f._id }, update: { slot, at: atTime(s.startDate, +day, times[slot]) } } });
    });
  }
  if (ops.length) await Fixture.bulkWrite(ops);
}
async function nameMap() { const m = {}; (await Team.find().select('name flag')).forEach((t) => (m[t._id] = t)); return m; }
async function broadcast(text) {
  for (const c of [await getChannel(), await getSetting('group')]) if (c) await api.send(c, text);
}
async function programText(day, s) {
  const fx = await Fixture.find({ season: s.no, day }).sort({ idx: 1 });
  if (!fx.length || !fx[0].at) return null;
  const nm = await nameMap();
  return [`📅 برنامه روز ${day} از ${SEASON_DAYS} | سیزن ${s.no} | ${STAGE_FA[fx[0].stage]}\n📆 ${fx[0].at.toLocaleDateString('fa-IR')}\n\n`,
    api.quote(fx.map((f) => `⏰ ${hm(f.at)} | ${nm[f.home].flag} ${nm[f.home].name} 🆚 ${nm[f.away].name} ${nm[f.away].flag}`).join('\n'))];
}

async function createSeason(no, startDate) {
  const teams = await Team.find();
  await Fixture.deleteMany({});
  await Team.updateMany({}, { $set: { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, 'players.$[].goals': 0 } });
  const docs = [];
  roundRobin(teams.map((t) => t._id)).slice(0, LEAGUE_DAYS)
    .forEach((m, d) => m.forEach(([h, a], i) => docs.push({ season: no, stage: 'L', day: d + 1, idx: i, home: h, away: a })));
  await Fixture.insertMany(docs);
  await setSetting('season', { no, startDate, stage: 'L' });
  await setSetting('programDay', '');
  await assignTimes();
}
async function startSeason(no = 1) {
  const times = await slotTimes(); if (!times.length) return null;
  const now = new Date(), [h, m] = times[0].split(':').map(Number);
  const first = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
  const sd = dstr(now < first ? now : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  await createSeason(no, sd);
  const s = await getSetting('season'), txt = await programText(1, s);
  await setSetting('programDay', `${no}:1`);
  await broadcast([`🏁 سیزن ${no} Global Kick شروع شد! (${SEASON_DAYS} روز)\n\n`, ...(txt || [])]);
  return sd;
}

async function createKO(s, stage, pairs) {
  await Fixture.insertMany(pairs.map(([h, a], i) => ({ season: s.no, stage, day: KO_DAY[stage], idx: i, home: h, away: a })));
  await setSetting('season', { ...s, stage });
  await assignTimes();
  const nm = await nameMap();
  await broadcast([`🎯 قرعه ${STAGE_FA[stage]} (روز ${KO_DAY[stage]})\n\n`, api.quote(pairs.map(([h, a]) => `${nm[h].flag} ${nm[h].name} 🆚 ${nm[a].name} ${nm[a].flag}`).join('\n'))]);
}
async function progress(now) {
  const s = await getSetting('season'); if (!s) return;
  if (s.stage === 'rest') { if (now >= atTime(s.next, 1, '00:00')) await createSeason(s.no + 1, s.next); return; }
  if (await Fixture.countDocuments({ played: false })) return;
  if (s.stage === 'L') {
    const top = (await sortedTeams()).slice(0, 16);
    return createKO(s, 'R16', Array.from({ length: 8 }, (_, i) => [top[i]._id, top[15 - i]._id]));
  }
  const prev = await Fixture.find({ season: s.no, stage: s.stage }).sort({ idx: 1 });
  if (KO_NEXT[s.stage]) {
    const w = prev.map((f) => f.pw), pairs = [];
    for (let i = 0; i < w.length; i += 2) pairs.push([w[i], w[i + 1]]);
    return createKO(s, KO_NEXT[s.stage], pairs);
  }
  const champ = await Team.findById(prev[0].pw);
  champ.coins += CHAMP_COINS; await champ.save();
  if (champ.ownerUid) api.send(champ.ownerUid, `🏆 تبریک! قهرمان سیزن ${s.no} شدید! ${CHAMP_COINS} سکه جایزه.`);
  const next = addDays(s.startDate, SEASON_DAYS);
  await setSetting('season', { ...s, stage: 'rest', next });
  await broadcast(`🏆🏆 قهرمان سیزن ${s.no}: ${champ.flag} ${champ.name} 🏆🏆\n💰 جایزه: ${CHAMP_COINS} سکه\n\n📆 سیزن ${s.no + 1} از ${new Date(...next.split('-').map((x, i) => (i === 1 ? x - 1 : +x))).toLocaleDateString('fa-IR')} شروع می‌شود.`);
}

// ---------- اجرای بازی ----------
async function sendTable(chat, caption) { return api.sendImage(chat, await tableImage(), caption); }

async function runFixture(f, withTable) {
  const h = await Team.findById(f.home), a = await Team.findById(f.away), ko = f.stage !== 'L';
  const r = await playMatch(h, a, !ko);
  f.played = true; f.hg = r.hg; f.ag = r.ag;
  f.pw = r.hg > r.ag ? h._id : r.ag > r.hg ? a._id : null;
  if (ko && !f.pw) {
    const hw = Math.random() < 0.5 + (strength(h, true) - strength(a)) / 200;
    f.pw = hw ? h._id : a._id; f.pen = `${hw ? h.name : a.name} در پنالتی برنده شد`;
  }
  await f.save();
  const title = `سیزن ${f.season} | روز ${f.day} | ${STAGE_FA[f.stage]}`;
  let caption = `⚽ ${h.flag} ${h.name} ${r.hg} - ${r.ag} ${a.name} ${a.flag}${f.pen ? '\n' + f.pen : ''}`;
  const inj = [...r.ih.map((x) => `${h.name}: ${x}`), ...r.ia.map((x) => `${a.name}: ${x}`)];
  if (inj.length) caption += `\n🤕 مصدومیت: ${inj.join(' | ')}`;
  const group = await getSetting('group');
  if (group) {
    await api.sendImage(group, await resultImage({ title, home: h.name, away: a.name, hg: r.hg, ag: r.ag, hs: r.hs, as: r.as, note: f.pen }), caption); // عکس اول: نتیجه
    if (!ko && withTable) await sendTable(group, '🏆 جدول بعد از این بازی');                                                                       // عکس دوم: جدول
  }
  for (const t of [h, a]) if (t.ownerUid) api.send(t.ownerUid, `${caption}\n💰 سکه فعلی: ${t.coins}`);
}
async function dayEnd(season, day, stage) {
  if (await Fixture.countDocuments({ season, day, played: false })) return;
  const ch = await getChannel(); if (!ch) return;
  const nm = await nameMap();
  const fx = await Fixture.find({ season, day }).sort({ idx: 1 });
  await api.send(ch, [`📋 نتایج روز ${day} | سیزن ${season} | ${STAGE_FA[stage]}\n\n`, api.quote(fx.map((f) => `${nm[f.home].flag} ${nm[f.home].name} ${f.hg} - ${f.ag} ${nm[f.away].name} ${nm[f.away].flag}${f.pen ? ' (پنالتی)' : ''}`).join('\n'))]);
  if (stage === 'L') await sendTable(ch, '🏆 جدول پایان روز');
}
async function runList(due) {
  const days = new Map();
  for (let i = 0; i < due.length; i++) {
    const f = due[i], nextAt = due[i + 1]?.at?.getTime();
    const tbl = cfg.tableMode === 'match' || (cfg.tableMode === 'slot' && nextAt !== f.at?.getTime());
    await runFixture(f, tbl); days.set(`${f.season}:${f.day}`, f.stage);
  }
  for (const [k, st] of days) { const [se, d] = k.split(':').map(Number); await dayEnd(se, d, st); }
}

let running = false;
async function tick() {
  if (running) return; running = true;
  try {
    const now = new Date();
    await progress(now);
    const due = await Fixture.find({ played: false, at: { $lte: now } }).sort({ at: 1, idx: 1 });
    if (due.length) { await runList(due); await progress(new Date()); }
    // اعلام برنامه روز در کانال/گروه
    const s = await getSetting('season'), times = await slotTimes();
    if (s && s.stage !== 'rest' && times.length) {
      const d = dayNum(s, now), key = `${s.no}:${d}`;
      if (d >= 1 && d <= SEASON_DAYS && (await getSetting('programDay')) !== key && now.getHours() * 60 + now.getMinutes() >= Math.max(0, Math.min(480, toMin(times[0]) - 60))) {
        const txt = await programText(d, s); await setSetting('programDay', key);
        if (txt) await broadcast(txt);
      }
    }
  } finally { running = false; }
}
// اجرای فوری (دستی) تمام بازی‌های باقی‌مانده‌ی نزدیک‌ترین روز
async function runNow() {
  if (running) return 'یک اجرا در حال انجام است.';
  running = true;
  try {
    const first = await Fixture.findOne({ played: false }).sort({ day: 1 });
    if (!first) return 'بازی باقی‌مانده‌ای نیست (سیزن را شروع کنید).';
    const due = await Fixture.find({ played: false, season: first.season, day: first.day }).sort({ idx: 1 });
    await runList(due); await progress(new Date());
    return `✅ ${due.length} بازی روز ${first.day} اجرا شد.`;
  } finally { running = false; }
}
async function upcomingText() {
  const s = await getSetting('season'); if (!s) return 'هنوز سیزنی شروع نشده.';
  if (s.stage === 'rest') return `🏁 سیزن ${s.no} تمام شد. سیزن بعد: ${new Date(...s.next.split('-').map((x, i) => (i === 1 ? x - 1 : +x))).toLocaleDateString('fa-IR')}`;
  const f0 = await Fixture.findOne({ played: false }).sort({ day: 1 });
  if (!f0) return 'برنامه‌ای باقی نمانده.';
  return (await programText(f0.day, s)) || 'زمان‌بندی تنظیم نشده (پنل ← زمان‌بندی).';
}

module.exports = { strength, lineup, FORMS, applyFormation, sendTable, tick, runNow, startSeason, assignTimes, slotTimes, broadcast, upcomingText };
