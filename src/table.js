const sharp = require('sharp');
const { Team } = require('./db');

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const FONT = "Vazirmatn, Tahoma, 'DejaVu Sans', Arial, sans-serif";
// خروجی کم‌حجم: PNG با پالت رنگی محدود (چند ده کیلوبایت)
const small = (svg, w) => sharp(Buffer.from(svg)).resize(w).png({ palette: true, colors: 16, compressionLevel: 9 }).toBuffer();

async function sortedTeams() {
  const teams = await Team.find();
  return teams.sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
}

async function tableImage(title = 'جدول رده‌بندی Global Kick') {
  const teams = await sortedTeams();
  const W = 900, RH = 32, top = 110, H = top + (teams.length + 1) * RH + 30;
  const cols = [['PTS', 150], ['GD', 215], ['GA', 275], ['GF', 335], ['L', 395], ['D', 450], ['W', 505], ['P', 560]];
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="${FONT}">
<rect width="100%" height="100%" fill="#0b1f14"/><rect width="${W}" height="80" fill="#14532d"/>
<text x="${W / 2}" y="50" font-size="30" font-weight="bold" fill="#fff" text-anchor="middle">${esc(title)}</text>
<rect x="20" y="${top - 24}" width="${W - 40}" height="${RH}" fill="#166534"/>
<text x="860" y="${top - 2}" font-size="16" fill="#fff" text-anchor="middle">#</text>
<text x="820" y="${top - 2}" font-size="16" fill="#fff" text-anchor="end">تیم</text>`;
  cols.forEach(([n, x]) => (s += `<text x="${x}" y="${top - 2}" font-size="16" fill="#fff" text-anchor="middle">${n}</text>`));
  teams.forEach((t, i) => {
    const y = top + (i + 1) * RH - 2, gd = t.gf - t.ga;
    s += `<rect x="20" y="${y - 22}" width="${W - 40}" height="${RH}" fill="${i % 2 ? '#10281a' : '#0e2217'}"/>`;
    if (i < 16) s += `<rect x="${W - 24}" y="${y - 22}" width="4" height="${RH}" fill="${i < 4 ? '#22c55e' : '#3b82f6'}"/>`;
    const vals = [t.pts, gd > 0 ? '+' + gd : gd, t.ga, t.gf, t.l, t.d, t.w, t.p];
    s += `<text x="860" y="${y}" font-size="16" fill="#cbd5e1" text-anchor="middle">${i + 1}</text><text x="820" y="${y}" font-size="17" fill="#fff" text-anchor="end">${esc(t.name)}</text>`;
    cols.forEach(([, x], k) => (s += `<text x="${x}" y="${y}" font-size="16" font-weight="${k ? 'normal' : 'bold'}" fill="${k ? '#e2e8f0' : '#facc15'}" text-anchor="middle">${vals[k]}</text>`));
  });
  return small(s + '</svg>', 720);
}

const cnt = (arr) => { const m = {}; arr.forEach((x) => (m[x] = (m[x] || 0) + 1)); return Object.entries(m).map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)); };

// کارت نتیجه‌ی همین بازی
async function resultImage({ title, home, away, hg, ag, hs, as, note }) {
  const a = cnt(hs).slice(0, 6), b = cnt(as).slice(0, 6), H = 200 + Math.max(a.length, b.length) * 28;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${H}" font-family="${FONT}">
<rect width="720" height="${H}" fill="#0b1f14"/><rect width="720" height="60" fill="#14532d"/>
<text x="360" y="39" font-size="22" font-weight="bold" fill="#fff" text-anchor="middle">${esc(title)}</text>
<text x="170" y="125" font-size="26" fill="#fff" text-anchor="middle">${esc(home)}</text>
<text x="550" y="125" font-size="26" fill="#fff" text-anchor="middle">${esc(away)}</text>
<text x="360" y="130" font-size="64" font-weight="bold" fill="#facc15" text-anchor="middle">${hg} - ${ag}</text>`;
  if (note) s += `<text x="360" y="168" font-size="18" fill="#86efac" text-anchor="middle">${esc(note)}</text>`;
  a.forEach((n, i) => (s += `<text x="170" y="${205 + i * 28}" font-size="19" fill="#cbd5e1" text-anchor="middle">⚽ ${esc(n)}</text>`));
  b.forEach((n, i) => (s += `<text x="550" y="${205 + i * 28}" font-size="19" fill="#cbd5e1" text-anchor="middle">⚽ ${esc(n)}</text>`));
  return small(s + '</svg>', 720);
}

module.exports = { tableImage, resultImage, sortedTeams };
