const cfg = require('./config');
const BASE = `https://botapi.rubika.ir/v3/${cfg.token}`;

async function call(method, data = {}) {
  const r = await fetch(`${BASE}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const j = await r.json().catch(() => ({}));
  if (j.status && j.status !== 'OK') console.error(`[rubika] ${method}:`, JSON.stringify(j));
  return j;
}
const kb = (rows) => ({
  rows: rows.map((r) => ({ buttons: r.map((t) => ({ id: t, type: 'Simple', button_text: t })) })),
  resize_keyboard: true, on_time_keyboard: false,
});
// ---------- متن غنی: مونو (قابل کپی)، نقل‌قول، برجسته ----------
// استفاده: api.send(chat, ['رمز: ', api.mono(code), '\n', api.quote('متن جدا')])
const seg = (t) => (s) => ({ t, s: String(s) });
const mono = seg('Mono'), quote = seg('Quote'), bold = seg('Bold'), pre = seg('Pre');
const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function render(content) {
  const segs = (Array.isArray(content) ? content.flat() : [content]).map((x) => (typeof x === 'object' && x ? x : { t: null, s: String(x) }));
  const mode = cfg.richMode, len = (x) => (cfg.metaIndex === 'utf16' ? x.length : [...x].length);
  if (mode === 'plain' || !segs.some((x) => x.t)) return { text: segs.map((x) => x.s).join('').slice(0, 4000) };
  if (mode === 'html') {
    const tag = { Mono: 'code', Quote: 'blockquote', Bold: 'b', Pre: 'pre' };
    return { text: segs.map((x) => (x.t ? `<${tag[x.t]}>${esc(x.s)}</${tag[x.t]}>` : esc(x.s))).join(''), parse_mode: 'HTML' };
  }
  if (mode === 'markdown') {
    const md = { Mono: (v) => '`' + v + '`', Bold: (v) => '**' + v + '**', Pre: (v) => '```' + v + '```', Quote: (v) => v.split('\n').map((l) => '> ' + l).join('\n') };
    return { text: segs.map((x) => (x.t ? md[x.t](x.s) : x.s)).join(''), parse_mode: 'Markdown' };
  }
  let text = ''; const parts = [];
  for (const x of segs) { if (x.t && x.s) parts.push({ type: x.t, from_index: len(text), length: len(x.s) }); text += x.s; }
  return { text, metadata: { meta_data_parts: parts } };
}

async function send(chat_id, content, rows) {
  const body = { chat_id, ...render(content) };
  if (rows) { body.chat_keypad = kb(rows); body.chat_keypad_type = 'New'; }
  return call('sendMessage', body).catch((e) => console.error('send error', e.message));
}
async function sendImage(chat_id, buffer, caption = '') {
  const r = await call('requestSendFile', { type: 'Image' });
  const url = r?.data?.upload_url; if (!url) return;
  const jpg = buffer[0] === 0xff && buffer[1] === 0xd8; // فرمت اصلی عکس حفظ می‌شود
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: jpg ? 'image/jpeg' : 'image/png' }), jpg ? 'image.jpg' : 'image.png');
  const up = await (await fetch(url, { method: 'POST', body: fd })).json().catch(() => ({}));
  const file_id = up?.data?.file_id;
  if (!file_id) return console.error('[rubika] upload failed', JSON.stringify(up));
  return call('sendFile', { chat_id, file_id, text: caption });
}
// ارسال فایل با file_id موجود (همان عکس اصلی، بدون ادیت و بدون آپلود مجدد)
async function sendFileId(chat_id, file_id, text = '') {
  const r = await call('sendFile', { chat_id, file_id, text });
  return r?.status === 'OK';
}
async function download(file_id) {
  const r = await call('getFile', { file_id });
  const url = r?.data?.download_url; if (!url) return null;
  return Buffer.from(await (await fetch(url)).arrayBuffer());
}
module.exports = { mono, quote, bold, pre, render, call, send, sendImage, sendFileId, download };
