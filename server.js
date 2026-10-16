// Load settings from a .env file next to server.js (KEY=value per line)
try { require('fs').readFileSync(require('path').join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(l => { const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(l); if (m && !l.trim().startsWith('#') && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') }) } catch (e) { }
const express = require('express'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const app = express(); app.set('trust proxy', 1); app.use(express.json({ limit: '3mb' }));// Serves pages from ./public, or from the same folder as server.js if the files were saved flat
const find = n => [path.join(__dirname, 'public', n), path.join(__dirname, n)].find(fs.existsSync);
app.get(['/', '/index.html', '/admin.html', '/qr.png'], (q, r, n) => { const f = find(q.path === '/' ? 'index.html' : q.path.slice(1)); f ? r.sendFile(f) : n() });
app.use(express.static(path.join(__dirname, 'public')));
const DATA = process.env.DATA_DIR || __dirname, UP = path.join(DATA, 'uploads'), DB = path.join(DATA, 'data.json'), ADMIN = process.env.ADMIN_PASSWORD || 'admin123', HOLD_MIN = 10;
let db = fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB)) : { events: [{ id: 'e1', name: 'Expo 2026', date: '2026-11-05', endDate: '2026-11-07', venue: 'Surat', price: 5000 }], bookings: [] };
db.users = db.users || {}; db.sessions = db.sessions || {};
const save = () => fs.writeFileSync(DB, JSON.stringify(db, null, 1));
// Hall layout from your sketch: [id, x%, y%]  (entry at bottom centre)
const STALLS = [['L1', 7, 90], ['L2', 7, 80], ['L3', 7, 70], ['L4', 7, 60], ['L5', 7, 50], ['L6', 7, 40], ['L7', 7, 30], ['T8', 50, 7],
['A2', 27, 80], ['A3', 27, 70], ['A4', 27, 60], ['A5', 27, 50], ['A6', 27, 40], ['C1', 50, 90], ['C7', 50, 32],
['B8', 70, 40], ['B9', 70, 50], ['B10', 70, 60], ['B11', 70, 70], ['B12', 70, 80],
['R9', 93, 30], ['R10', 93, 40], ['R11', 93, 50], ['R12', 93, 60], ['R13', 93, 70], ['R14', 93, 80], ['R15', 93, 90]].map(([id, x, y]) => ({ id, x, y }));
const IDS = new Set(STALLS.map(s => s.id));
const VENUE = 'Hotel Shiv, Ground Floor Hall';
const priceOf = (e, id) => +(e.prices && e.prices[id] > 0 ? e.prices[id] : e.price);
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const ended = e => e.endDate < today(), dayDiff = d => Math.round((new Date(d + 'T00:00Z') - new Date(today() + 'T00:00Z')) / 864e5);
const vw = b => ({ ...b, eventName: (db.events.find(e => e.id === b.eventId) || {}).name || '' });
const evStats = e => { const bs = db.bookings.filter(b => b.eventId === e.id); return { booked: bs.filter(b => b.status === 'approved').reduce((a, b) => a + b.stalls.length, 0), pending: bs.filter(b => b.status === 'submitted').length } };
const pub = e => ({ ...e, venue: VENUE, prices: e.prices || {}, poster: e.poster ? `/api/events/${e.id}/poster?v=${e.pv || 0}` : '' });
const sweep = () => { const n = Date.now(); let c = 0; db.bookings.forEach(b => { if (b.status === 'held' && b.holdUntil < n) { b.status = 'expired'; c++ } }); if (c) save() };
const taken = ev => { sweep(); const m = {}; db.bookings.filter(b => b.eventId === ev && ['held', 'submitted', 'approved'].includes(b.status)).forEach(b => b.stalls.forEach(s => m[s] = b.status === 'approved' ? 'booked' : b.status === 'held' ? 'held' : 'pending')); return m };
const PORT = process.env.PORT || 3000; let nm = null; try { nm = require('nodemailer') } catch (e) { }
const mailer = nm && process.env.SMTP_HOST && process.env.SMTP_USER && nm.createTransport({ host: process.env.SMTP_HOST, port: +(process.env.SMTP_PORT || 587), secure: +(process.env.SMTP_PORT || 587) === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
const site = () => process.env.SITE_URL || 'http://localhost:' + PORT;
const WA = (process.env.WHATSAPP_ADMINS || '').split(',').map(x => x.trim().split(':')).filter(x => x.length === 2);
async function notify(b) {
  const ev = db.events.find(e => e.id === b.eventId) || {};
  const text = `🆕 New stall booking needs approval\nEvent: ${ev.name || ''}\nName: ${b.name} (${b.phone})\nStalls: ${b.stalls.join(', ')}\nAmount: ₹${b.amount}\nUTR: ${b.utr}\nReview: ${site()}/admin.html`;
  const jobs = [];
  if (mailer && process.env.ADMIN_EMAIL) jobs.push(mailer.sendMail({ from: process.env.SMTP_USER, to: process.env.ADMIN_EMAIL, subject: `New booking: ${b.stalls.join(', ')} · ₹${b.amount}`, text, attachments: b.shot ? [{ filename: b.shot, path: path.join(UP, b.shot) }] : [] }));
  WA.forEach(([p, k]) => jobs.push(fetch(`https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(p)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(k)}`).then(r => { if (!r.ok) throw Error('WhatsApp ' + r.status) })));
  (await Promise.allSettled(jobs)).forEach(x => x.status === 'rejected' && console.log('Notification failed:', x.reason && x.reason.message))
}
function mailCustomer(b) { if (mailer && b.email) mailer.sendMail({ from: process.env.SMTP_USER, to: b.email, subject: 'Your stall booking is confirmed', text: `Hi ${b.name},\nYour booking for stalls ${b.stalls.join(', ')} is confirmed.\nReceipt: ${site()}/receipt/${b.id}` }).catch(e => console.log('Customer mail failed:', e.message)) }
const admin = (q, r, n) => q.get('x-admin') === ADMIN ? n() : r.status(401).json({ error: 'Unauthorized' });
const clean = s => String(s || '').trim().slice(0, 100);

// ---------- Login with SMS OTP ----------
const otps = new Map(), hits = new Map();
const normPhone = p => { p = String(p || '').replace(/\D/g, ''); if (p.length === 12 && p.startsWith('91')) p = p.slice(2); return /^[6-9]\d{9}$/.test(p) ? p : '' };
const limit = (k, max, ms) => { const n = Date.now(), a = (hits.get(k) || []).filter(t => n - t < ms); if (a.length >= max) return false; a.push(n); hits.set(k, a); return true };
async function sendSms(phone, otp) {
  const p = (process.env.SMS_PROVIDER || '').toLowerCase();
  if (p === 'fast2sms') {
    const r = await fetch('https://www.fast2sms.com/dev/bulkV2', { method: 'POST', headers: { authorization: process.env.FAST2SMS_KEY || '', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ variables_values: otp, route: 'otp', numbers: phone }) });
    const j = await r.json().catch(() => ({})); if (!r.ok || j.return === false) throw Error('Fast2SMS: ' + (j.message || r.status))
  }
  else if (p === 'twilio') {
    const sid = process.env.TWILIO_SID, r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(sid + ':' + process.env.TWILIO_TOKEN).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ To: '+91' + phone, From: process.env.TWILIO_FROM || '', Body: `Your Hotel Shiv stall booking OTP is ${otp}. Valid for 5 minutes.` }) });
    if (!r.ok) throw Error('Twilio: ' + r.status + ' ' + (await r.text()).slice(0, 200))
  }
  else console.log(`[TEST MODE - no SMS provider set] OTP for ${phone}: ${otp}`)
}
const auth = (q, r, n) => { const t = (q.get('authorization') || '').replace(/^Bearer /, ''), s = db.sessions[t]; if (!s || s.exp < Date.now() || !db.users[s.phone]) return r.status(401).json({ error: 'Please log in' }); q.user = db.users[s.phone]; n() };
app.post('/api/auth/send-otp', async (q, r) => {
  const phone = normPhone(q.body.phone), name = clean(q.body.name), email = clean(q.body.email);
  if (name.length < 2) return r.status(400).json({ error: 'Please enter your name' });
  if (!phone) return r.status(400).json({ error: 'Enter a valid 10-digit mobile number' });
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return r.status(400).json({ error: 'Enter a valid email, or leave it blank' });
  const o = otps.get(phone); if (o && Date.now() - o.sent < 30000) return r.status(429).json({ error: 'Please wait 30 seconds before asking for another OTP' });
  if (!limit('p' + phone, 5, 36e5) || !limit('i' + q.ip, 30, 36e5)) return r.status(429).json({ error: 'Too many OTP requests. Please try again later.' });
  const code = String(crypto.randomInt(100000, 1000000));
  try { await sendSms(phone, code) } catch (e) { console.log('SMS failed:', e.message); return r.status(502).json({ error: 'Could not send the SMS. Please try again.' }) }
  otps.set(phone, { code, name, email, exp: Date.now() + 5 * 60000, sent: Date.now(), tries: 0 }); r.json({ ok: true })
});
app.post('/api/auth/verify', (q, r) => {
  const phone = normPhone(q.body.phone), o = otps.get(phone);
  if (!o || o.exp < Date.now()) return r.status(400).json({ error: 'OTP expired. Please request a new one.' });
  if (++o.tries > 5) { otps.delete(phone); return r.status(429).json({ error: 'Too many wrong attempts. Please request a new OTP.' }) }
  if (String(q.body.otp || '').trim() !== o.code) return r.status(400).json({ error: 'Incorrect OTP' });
  otps.delete(phone); const old = db.users[phone] || {};
  const u = db.users[phone] = { ...old, phone, name: o.name, email: o.email || old.email || '', lastLogin: Date.now() };
  Object.keys(db.sessions).forEach(k => { if (db.sessions[k].exp < Date.now()) delete db.sessions[k] });
  const token = crypto.randomBytes(24).toString('hex'); db.sessions[token] = { phone, exp: Date.now() + 30 * 864e5 }; save(); r.json({ token, user: u })
});
app.get('/api/me', auth, (q, r) => r.json(q.user));
app.get('/api/my/bookings', auth, (q, r) => { sweep(); r.json(db.bookings.filter(b => b.phone === q.user.phone && !['expired', 'held'].includes(b.status)).reverse().map(vw)) });
app.get('/api/layout', (q, r) => r.json(STALLS));
app.get('/api/events', auth, (q, r) => r.json(db.events.filter(e => !ended(e)).sort((a, b) => a.date.localeCompare(b.date)).map(pub)));
app.get('/api/events/:id/poster', (q, r) => { const e = db.events.find(e => e.id === q.params.id), m = e && /^data:(image\/[a-z]+);base64,(.+)$/.exec(e.poster || ''); if (!m) return r.sendStatus(404); r.set({ 'Content-Type': m[1], 'Cache-Control': 'public,max-age=31536000' }); r.send(Buffer.from(m[2], 'base64')) });
app.get('/api/events/:id/stalls', auth, (q, r) => { const e = db.events.find(e => e.id === q.params.id); if (!e) return r.status(404).json({ error: 'Not found' }); r.json({ status: taken(e.id), price: e.price, prices: e.prices || {} }) });
app.post('/api/bookings', auth, (q, r) => {
  const { eventId, stalls } = q.body, { name, phone, email } = q.user, ev = db.events.find(e => e.id === eventId);
  if (ev && ended(ev)) return r.status(410).json({ error: 'Bookings for this event are closed' });
  if (!ev || !Array.isArray(stalls) || !stalls.length || stalls.length > 10 || !stalls.every(s => IDS.has(s)) || !clean(name) || !/^\d{10}$/.test(clean(phone))) return r.status(400).json({ error: 'Invalid details (name and 10-digit phone required)' });
  const t = taken(eventId), bad = stalls.filter(s => t[s]);
  if (bad.length) return r.status(409).json({ error: 'Just taken by someone else: ' + bad.join(', ') });
  const b = { id: crypto.randomBytes(6).toString('hex'), eventId, stalls: [...new Set(stalls)], name: clean(name), phone: clean(phone), email: clean(email), amount: [...new Set(stalls)].reduce((a, s) => a + priceOf(ev, s), 0), status: 'held', createdAt: Date.now(), holdUntil: Date.now() + HOLD_MIN * 60000 };
  db.bookings.push(b); save(); r.json(vw(b));
});
app.get('/api/bookings/:id', auth, (q, r) => { sweep(); const b = db.bookings.find(b => b.id === q.params.id); b && b.phone === q.user.phone ? r.json(vw(b)) : r.status(404).json({ error: 'Not found' }) });
app.post('/api/bookings/:id/pay', auth, (q, r) => {
  sweep(); const b = db.bookings.find(b => b.id === q.params.id);
  if (!b) return r.status(404).json({ error: 'Not found' });
  if (b.phone !== q.user.phone) return r.status(404).json({ error: 'Not found' });
  if (b.status !== 'held') return r.status(410).json({ error: 'Hold expired. Please select stalls again.' });
  const u = String(q.body.utr || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{8,30}$/.test(u)) return r.status(400).json({ error: 'Enter a valid UTR / transaction ID (letters and numbers, at least 8 characters)' });
  if (db.bookings.some(x => x.id !== b.id && x.utr === u)) return r.status(409).json({ error: 'This transaction ID has already been used for another booking' });
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(q.body.screenshot || '');
  if (!m || m[2].length > 3e6) return r.status(400).json({ error: 'Please upload the payment screenshot (an image)' });
  const buf = Buffer.from(m[2], 'base64');
  if (!((buf[0] === 0xFF && buf[1] === 0xD8) || (buf[0] === 0x89 && buf[1] === 0x50) || buf.slice(0, 4).toString() === 'RIFF')) return r.status(400).json({ error: 'That file is not a valid image' });
  fs.mkdirSync(UP, { recursive: true }); const fn = b.id + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]); fs.writeFileSync(path.join(UP, fn), buf);
  b.utr = u; b.shot = fn; b.status = 'submitted'; b.paidAt = Date.now(); save(); notify(b).catch(e => console.log('Notify error:', e.message)); r.json(vw(b));
});
app.get('/api/admin/bookings', admin, (q, r) => { sweep(); r.json({ bookings: [...db.bookings].reverse(), events: db.events.map(e => ({ ...pub(e), ended: ended(e), startsIn: dayDiff(e.date), endsIn: dayDiff(e.endDate), ...evStats(e) })), venue: VENUE }) });
app.get('/api/admin/bookings/:id/screenshot', admin, (q, r) => { const b = db.bookings.find(b => b.id === q.params.id); if (!b || !b.shot) return r.sendStatus(404); r.sendFile(path.join(UP, b.shot)) });
['approve', 'reject'].forEach(a => app.post('/api/admin/bookings/:id/' + a, admin, (q, r) => {
  const b = db.bookings.find(b => b.id === q.params.id); if (!b || b.status !== 'submitted') return r.status(400).json({ error: 'Not awaiting approval' });
  b.status = a === 'approve' ? 'approved' : 'rejected'; b.decidedAt = Date.now(); if (a === 'approve') b.receiptNo = 'RC-' + String(db.bookings.filter(x => x.receiptNo).length + 1).padStart(4, '0');
  save(); if (a === 'approve') mailCustomer(b); r.json(b);
}));
const readEv = b => { const o = { time: clean(b.time), about: String(b.about || '').slice(0, 2000) }; if (typeof b.poster === 'string' && (b.poster === '' || (/^data:image\/(jpeg|png|webp);base64,/.test(b.poster) && b.poster.length < 2e6))) { o.poster = b.poster; o.pv = Date.now() } const prices = {}; Object.entries(b.prices || {}).forEach(([k, v]) => { if (IDS.has(k) && +v > 0) prices[k] = Math.round(+v) }); return { ...o, name: clean(b.name), date: b.date, endDate: b.endDate || b.date, price: Math.round(+b.price), prices } };
const okEv = e => e.name && e.date && e.price > 0;
app.post('/api/admin/events', admin, (q, r) => { const e = readEv(q.body); if (!okEv(e)) return r.status(400).json({ error: 'Name, date and a price above 0 are required' }); db.events.push({ id: 'e' + Date.now(), ...e }); save(); r.json(db.events.map(pub)) });
app.put('/api/admin/events/:id', admin, (q, r) => { const i = db.events.findIndex(e => e.id === q.params.id), e = readEv(q.body); if (i < 0 || !okEv(e)) return r.status(400).json({ error: 'Invalid event details' }); { const o = db.events[i]; db.events[i] = { ...o, ...e }; if (o.date !== e.date || o.time !== e.time) { delete db.events[i].r24; delete db.events[i].r12 } } save(); r.json(db.events.map(pub)) });
app.delete('/api/admin/events/:id', admin, (q, r) => { if (db.bookings.some(b => b.eventId === q.params.id && ['held', 'submitted', 'approved'].includes(b.status))) return r.status(400).json({ error: 'This event has active bookings' }); db.events = db.events.filter(e => e.id !== q.params.id); save(); r.json(db.events.map(pub)) });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
app.get('/receipt/:id', (q, r) => {
  const b = db.bookings.find(b => b.id === q.params.id && b.status === 'approved'); if (!b) return r.status(404).send('Receipt not available (booking not approved).');
  const e = db.events.find(e => e.id === b.eventId) || {};
  r.send(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Receipt ${b.receiptNo}</title><style>body{font:15px system-ui;max-width:520px;margin:24px auto;padding:20px;border:2px solid #222;border-radius:10px}h1{margin:0 0 4px}td{padding:6px 0;vertical-align:top}td:first-child{color:#666;width:40%}.ok{color:#0a7a3b;font-weight:700}button{margin-top:16px;padding:10px 18px}@media print{button{display:none}}</style>
<h1>Stall Booking Receipt</h1><div class=ok>✔ CONFIRMED — ${esc(b.receiptNo)}</div><hr><table>
<tr><td>Event</td><td>${esc(e.name)}</td></tr><tr><td>Dates</td><td>${esc(e.date)} to ${esc(e.endDate)}</td></tr><tr><td>Venue</td><td>${esc(VENUE)}</td></tr>
<tr><td>Stalls</td><td><b>${b.stalls.map(esc).join(', ')}</b></td></tr><tr><td>Name</td><td>${esc(b.name)}</td></tr><tr><td>Phone</td><td>${esc(b.phone)}</td></tr>
<tr><td>Amount paid</td><td>₹${b.amount}</td></tr><tr><td>UTR</td><td>${esc(b.utr)}</td></tr><tr><td>Approved on</td><td>${new Date(b.decidedAt).toLocaleString('en-IN')}</td></tr><tr><td>Booking ID</td><td>${b.id}</td></tr></table>
<button onclick=print()>Print / Save as PDF</button>`)
});
async function alertAll(subject, text) {
  const jobs = []; if (mailer && process.env.ADMIN_EMAIL) jobs.push(mailer.sendMail({ from: process.env.SMTP_USER, to: process.env.ADMIN_EMAIL, subject, text }));
  WA.forEach(([p, k]) => jobs.push(fetch(`https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(p)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(k)}`).then(r => { if (!r.ok) throw Error('WhatsApp ' + r.status) })));
  (await Promise.allSettled(jobs)).forEach(x => x.status === 'rejected' && console.log('Notification failed:', x.reason && x.reason.message))
}
// Reminders by email 24h and 12h before the event starts (flashcard style). Start time = event date + the "Time" field (default 9:00 AM).
function startAt(e) {
  let h = 9, m = 0; const t = /(\d{1,2})(?::(\d{2}))?\s*([ap]m)?/i.exec(e.time || ''); if (t) { h = +t[1]; m = +(t[2] || 0); const a = (t[3] || '').toLowerCase(); if (a === 'pm' && h < 12) h += 12; if (a === 'am' && h === 12) h = 0 }
  return new Date(`${e.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`).getTime()
}
function flash(e, when, line, btn, url) {
  const f = d => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }), d = new Date(e.date + 'T00:00:00'), mo = d.toLocaleString('en', { month: 'short' }).toUpperCase();
  return `<div style="background:#eef4fd;padding:24px 12px;font-family:Arial,Helvetica,sans-serif"><table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 6px 24px rgba(9,21,64,.18)">
<tr><td style="background:#1b2cc1;background-image:linear-gradient(135deg,#091540,#1b2cc1);padding:26px 24px;color:#ffffff"><div style="font-size:12px;letter-spacing:2px;color:#abd2fa;font-weight:700">⏰ EVENT REMINDER</div><div style="font-size:30px;font-weight:800;margin-top:8px;line-height:1.15">${when} is<br>${esc(e.name)}!</div></td></tr>
<tr><td style="padding:22px 24px"><table cellpadding="0" cellspacing="0" width="100%"><tr><td width="80" valign="top"><div style="background:#abd2fa;border-radius:14px;text-align:center;padding:10px 0;color:#091540;width:70px"><div style="font-size:12px;font-weight:800">${mo}</div><div style="font-size:30px;font-weight:800;line-height:1">${d.getDate()}</div></div></td>
<td valign="top" style="color:#091540;font-size:15px;line-height:1.6"><b>${f(e.date)}${e.endDate !== e.date ? ' – ' + f(e.endDate) : ''}</b>${e.time ? '<br>🕗 ' + esc(e.time) : ''}<br>📍 ${esc(VENUE)}</td></tr></table>
<div style="margin-top:18px;background:#eef4fd;border-radius:12px;padding:12px 14px;color:#091540;font-weight:700">${esc(line)}</div>
<div style="text-align:center;margin-top:20px"><a href="${url}" style="background:#1b2cc1;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:12px;display:inline-block">${btn}</a></div></td></tr></table></div>`
}
async function sendReminders(e) {
  const st = evStats(e), dd = dayDiff(e.date), when = dd <= 0 ? 'Today' : dd === 1 ? 'Tomorrow' : 'In ' + dd + ' days', from = process.env.SMTP_USER, jobs = [];
  if (process.env.ADMIN_EMAIL) jobs.push(mailer.sendMail({ from, to: process.env.ADMIN_EMAIL, subject: `⏰ ${when} is ${e.name}`, text: `${when} is ${e.name} (${e.date}). ${st.booked} stalls booked, ${st.pending} awaiting approval. ${site()}/admin.html`, html: flash(e, when, `${st.booked} stalls booked · ${st.pending} awaiting your approval`, 'Open admin', site() + '/admin.html') }));
  const by = {}; db.bookings.filter(b => b.eventId === e.id && b.status === 'approved' && b.email).forEach(b => { (by[b.email] = by[b.email] || { s: [] }).s.push(...b.stalls) });
  Object.entries(by).forEach(([to, v]) => jobs.push(mailer.sendMail({ from, to, subject: `${when} is ${e.name}`, text: `${when} is ${e.name} (${e.date}) at ${VENUE}. Your stalls: ${v.s.join(', ')}`, html: flash(e, when, 'Your stalls: ' + v.s.join(', '), 'View event', site()) })));
  (await Promise.allSettled(jobs)).forEach(x => x.status === 'rejected' && console.log('Reminder email failed:', x.reason && x.reason.message))
}
function checkReminders() {
  if (!mailer) return; const now = Date.now(); db.events.forEach(e => {
    if (ended(e)) return; const t = startAt(e); if (now >= t) return; const d12 = now >= t - 12 * 36e5, d24 = now >= t - 24 * 36e5;
    if (d12 && !e.r12) { e.r12 = e.r24 = 1 } else if (d24 && !d12 && !e.r24) { e.r24 = 1 } else return; save(); sendReminders(e).catch(x => console.log('Reminder error:', x.message))
  })
}
app.listen(PORT, () => console.log('Running on http://localhost:' + PORT + '\nAdmin alerts → email: ' + (mailer && process.env.ADMIN_EMAIL ? 'ON' : 'off') + ' | WhatsApp: ' + (WA.length ? 'ON' : 'off')));
setTimeout(checkReminders, 5000); setInterval(checkReminders, 6e5);
