const cfg = require('./config');
const db = require('./db');
const api = require('./rubika');
const { handle } = require('./bot');
const { tick } = require('./game');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seen = new Set();

async function poll() {
  let offset = await db.getSetting('offset');
  const startedAt = Math.floor(Date.now() / 1000);
  while (true) {
    try {
      const r = await api.call('getUpdates', { offset_id: offset || undefined, limit: 50 });
      for (const up of r?.data?.updates || []) {
        const m = up.new_message; if (!m) continue;
        const key = `${up.chat_id}:${m.message_id}`;
        if (seen.has(key)) continue; seen.add(key); if (seen.size > 5000) seen.clear();
        if (!offset && Number(m.time) < startedAt - 120) continue;
        try { await handle(up); } catch (e) { console.error('handler error:', e); }
      }
      const next = r?.data?.next_offset_id;
      if (next && next !== offset) { offset = next; await db.setSetting('offset', offset); }
    } catch (e) { console.error('poll error:', e.message); await sleep(3000); }
    await sleep(800);
  }
}

(async () => {
  await db.connect();
  const me = await api.call('getMe');
  console.log('🤖 Bot:', me?.data?.bot?.bot_title || me?.status);
  setInterval(() => tick().catch((e) => console.error('tick error:', e)), 30000);
  poll();
})();
