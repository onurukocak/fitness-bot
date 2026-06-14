/**
 * Onur Fitness Bot — Telegram + OpenFoodFacts + Supabase
 * Deploy: Render.com
 */

const express = require('express');
const fetch   = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

// ── CONFIG ────────────────────────────────────────────────────────
const BOT_TOKEN    = process.env.BOT_TOKEN    || '8566167507:AAFuXsuyrVbx20lm0gPZVbvdlHBPew7Dc5k';
const CHAT_ID      = process.env.CHAT_ID      || '7979693959';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TG           = `https://api.telegram.org/bot${BOT_TOKEN}`;
const KCAL_HEDEF   = 3250;
const PROTEIN_HEDEF = 233;

const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// ── UTILS ─────────────────────────────────────────────────────────
const today = () => new Date().toISOString().split('T')[0];
const bar   = (val, max, len = 10) => {
  const filled = Math.min(Math.round((val / max) * len), len);
  return '█'.repeat(filled) + '░'.repeat(len - filled);
};

async function send(chatId, text) {
  await fetch(`${TG}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  });
}

async function dbUpsert(table, data) {
  if (!supabase) return;
  const { error } = await supabase.from(table).upsert(data);
  if (error) console.error(`DB error [${table}]:`, error.message);
}

async function dbToday(table) {
  if (!supabase) return null;
  const { data } = await supabase.from(table)
    .select('*').eq('date', today()).order('created_at', { ascending: false }).limit(1);
  return data?.[0] || null;
}

// ── FOOD ──────────────────────────────────────────────────────────
async function searchFood(query) {
  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5&fields=product_name,nutriments`;
    const res  = await fetch(url);
    const data = await res.json();
    return (data.products || [])
      .filter(p => p.nutriments?.['energy-kcal_100g'])
      .slice(0, 1)
      .map(p => ({
        name:     p.product_name || query,
        kcal:     Math.round(p.nutriments['energy-kcal_100g']    || 0),
        protein:  Math.round(p.nutriments['proteins_100g']        || 0),
        carb:     Math.round(p.nutriments['carbohydrates_100g']   || 0),
        fat:      Math.round(p.nutriments['fat_100g']             || 0),
      }));
  } catch { return []; }
}

// "2 yumurta ve 150gr tavuk yedim" → [{qty, unit, food}, ...]
function parseFood(text) {
  const clean = text.replace(/yedim|içtim|aldım|atladım/gi, '').trim();
  return clean.split(/\s+ve\s+|\s*,\s*/i)
    .map(part => {
      const m = part.trim().match(/^(\d+[\.,]?\d*)\s*(gr?|gram|kg|ml|litre|dilim|kase|bardak|adet|tane|porsiyon)?\s*(.+)?$/i);
      if (m) return { qty: parseFloat(m[1].replace(',','.')), unit: m[2]||'adet', food: (m[3]||'').trim() };
      return { qty: 1, unit: 'porsiyon', food: part.trim() };
    })
    .filter(f => f.food.length > 0);
}

function toGrams(qty, unit) {
  const u = (unit||'').toLowerCase();
  if (['gr','gram','g'].includes(u)) return qty;
  if (u==='kg')      return qty * 1000;
  if (u==='ml')      return qty;
  if (u==='litre')   return qty * 1000;
  if (u==='dilim')   return qty * 30;
  if (u==='bardak')  return qty * 240;
  if (u==='kase')    return qty * 200;
  return qty * 100; // porsiyon / adet / tane
}

// ── HANDLERS ──────────────────────────────────────────────────────
async function handleKilo(chatId, args) {
  const val = parseFloat(args[0]);
  if (isNaN(val) || val < 30 || val > 300)
    return send(chatId, '⚠️ Geçersiz değer.\nÖrnek: `/kilo 105.2`');
  await dbUpsert('weight_log', { date: today(), weight: val });
  send(chatId, `✅ *${val} kg* kaydedildi.`);
}

async function handleAntrenman(chatId, args) {
  const gun = (args[0]||'').toUpperCase();
  if (!['A','B','C','D','REST'].includes(gun))
    return send(chatId, '⚠️ Geçersiz gün.\nÖrnek: `/antrenman A` veya `/antrenman REST`');
  await dbUpsert('workout_log', { date: today(), day: gun, notes: args.slice(1).join(' ') });
  const label = gun === 'REST' ? '😴 Dinlenme günü' : `💪 ${gun} antrenmanı`;
  send(chatId, `✅ *${label}* kaydedildi.`);
}

async function handleWatch(chatId, args) {
  // /watch hrv:65 rhr:52 uyku:7.5 adim:9200 cal:420 vo2:48
  const MAP = { hrv:'hrv', rhr:'rhr', uyku:'sleep', adim:'steps', cal:'active_cal', vo2:'vo2' };
  const data = { date: today() };
  args.forEach(a => {
    const [k, v] = a.split(':');
    if (MAP[k]) data[MAP[k]] = parseFloat(v);
  });
  if (Object.keys(data).length <= 1)
    return send(chatId, '⚠️ Veri bulunamadı.\nÖrnek: `/watch hrv:65 rhr:52 uyku:7.5 adim:9200 cal:420`');
  await dbUpsert('watch_log', data);

  let msg = `⌚ *Watch verileri kaydedildi*\n\n`;
  if (data.hrv)        msg += `HRV: *${data.hrv}* ms\n`;
  if (data.rhr)        msg += `Dinlenim KAH: *${data.rhr}* bpm\n`;
  if (data.sleep)      msg += `Uyku: *${data.sleep}* saat\n`;
  if (data.steps)      msg += `Adım: *${data.steps?.toLocaleString()}*\n`;
  if (data.active_cal) msg += `Aktif kalori: *${data.active_cal}* kcal\n`;
  if (data.vo2)        msg += `VO₂ max: *${data.vo2}*\n`;
  send(chatId, msg);
}

async function handleYemek(chatId, text) {
  const items = parseFood(text);
  if (!items.length)
    return send(chatId, '⚠️ Anlaşılamadı.\nÖrnek: "2 yumurta ve 150gr tavuk yedim"');

  await send(chatId, '🔍 Hesaplanıyor...');

  let totalKcal = 0, totalProtein = 0, totalCarb = 0, totalFat = 0;
  let lines = '';
  const log = [];

  for (const item of items) {
    const [r] = await searchFood(item.food);
    if (!r) { lines += `❓ *${item.food}* bulunamadı\n`; continue; }
    const g = toGrams(item.qty, item.unit);
    const f = g / 100;
    const kcal = Math.round(r.kcal * f), protein = Math.round(r.protein * f);
    const carb = Math.round(r.carb * f), fat = Math.round(r.fat * f);
    totalKcal += kcal; totalProtein += protein; totalCarb += carb; totalFat += fat;
    lines += `▸ *${item.qty} ${item.unit} ${item.food}* (${g}g)\n`;
    lines += `  ${kcal} kcal · ${protein}g P · ${carb}g K · ${fat}g Y\n`;
    log.push({ name: r.name, qty: item.qty, unit: item.unit, grams: g, kcal, protein, carb, fat });
  }

  // Günlük kalan ile birleştir
  const existing = await dbToday('macro_log');
  const newKcal  = (existing?.kcal    || 0) + totalKcal;
  const newP     = (existing?.protein || 0) + totalProtein;
  const newC     = (existing?.carb    || 0) + totalCarb;
  const newF     = (existing?.fat     || 0) + totalFat;
  await dbUpsert('macro_log', {
    date: today(), kcal: newKcal, protein: newP, carb: newC, fat: newF,
    foods: JSON.stringify([...(JSON.parse(existing?.foods||'[]')), ...log])
  });

  const kalan = KCAL_HEDEF - newKcal;
  const prog  = bar(newKcal, KCAL_HEDEF);

  let msg = `*🍽 Yemek kaydedildi*\n\n`;
  msg += lines;
  msg += `\n`;
  msg += `Bu öğün: *${totalKcal} kcal*\n`;
  msg += `Protein: ${totalProtein}g · Karb: ${totalCarb}g · Yağ: ${totalFat}g\n`;
  msg += `\n`;
  msg += `*Günlük toplam*\n`;
  msg += `${prog} ${newKcal}/${KCAL_HEDEF} kcal\n`;
  msg += kalan > 0 ? `Kalan: *${kalan} kcal*` : `🎯 Hedefe ulaşıldı!`;
  send(chatId, msg);
}

async function handleRapor(chatId) {
  const [w, m, wo, wt] = await Promise.all([
    dbToday('weight_log'), dbToday('macro_log'),
    dbToday('workout_log'), dbToday('watch_log'),
  ]);

  const kcal = m?.kcal || 0;
  const prog  = bar(kcal, KCAL_HEDEF);
  const kalan = KCAL_HEDEF - kcal;

  let msg = `*📋 Günlük Özet — ${today()}*\n\n`;

  // Vücut & Antrenman
  msg += `⚖️  Kilo: ${w ? `*${w.weight} kg*` : '—'}\n`;
  msg += `💪  Antrenman: ${wo ? `*${wo.day} günü*` : '—'}\n\n`;

  // Kalori
  msg += `*Kalori*\n`;
  msg += `${prog} ${kcal}/${KCAL_HEDEF}\n`;
  if (m) {
    msg += `P: ${m.protein}g/${PROTEIN_HEDEF}g · K: ${m.carb}g · Y: ${m.fat}g\n`;
    msg += kalan > 0 ? `Kalan: ${kalan} kcal\n` : `🎯 Hedefe ulaşıldı!\n`;
  }

  // Watch
  if (wt) {
    msg += `\n*Apple Watch*\n`;
    if (wt.hrv)        msg += `HRV: *${wt.hrv}* ms · DKH: *${wt.rhr||'—'}* bpm\n`;
    if (wt.sleep)      msg += `Uyku: *${wt.sleep}* saat\n`;
    if (wt.steps)      msg += `Adım: *${wt.steps?.toLocaleString()}* · Aktif: *${wt.active_cal||'—'}* kcal\n`;
    if (wt.vo2)        msg += `VO₂ max: *${wt.vo2}*\n`;
  }

  send(chatId, msg);
}

async function handleHelp(chatId) {
  send(chatId, `*🏋️ Fitness Bot*

*Yemek logla:*
"2 yumurta yedim"
"150gr tavuk ve 1 kase pirinç yedim"

*Komutlar:*
/kilo 105.2 — kilo kaydet
/antrenman A — gün kaydet (A/B/C/D/REST)
/watch hrv:65 rhr:52 uyku:7.5 adim:9200 cal:420
/rapor — günlük özet
/yardim — bu menü`);
}

// ── WEBHOOK ───────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const msg    = req.body?.message;
    if (!msg) return;
    const chatId = msg.chat.id;
    const text   = (msg.text || '').trim();

    if      (text.startsWith('/kilo'))       await handleKilo(chatId, text.split(' ').slice(1));
    else if (text.startsWith('/antrenman'))  await handleAntrenman(chatId, text.split(' ').slice(1));
    else if (text.startsWith('/watch'))      await handleWatch(chatId, text.split(' ').slice(1));
    else if (text.startsWith('/rapor'))      await handleRapor(chatId);
    else if (/\/yardim|\/start|\/help/i.test(text)) await handleHelp(chatId);
    else if (/yedim|içtim/i.test(text))     await handleYemek(chatId, text);
    else await send(chatId, '❓ Anlamadım.\n/yardim — komutları gör');
  } catch (e) {
    console.error('Webhook error:', e);
  }
});

// ── API & HEALTH ──────────────────────────────────────────────────
app.get('/api/data', async (req, res) => {
  if (!supabase) return res.json({ error: 'Supabase bağlı değil' });
  const [weight, macros, workouts, watch] = await Promise.all([
    supabase.from('weight_log').select('*').order('date', { ascending: false }).limit(30),
    supabase.from('macro_log').select('*').order('date', { ascending: false }).limit(30),
    supabase.from('workout_log').select('*').order('date', { ascending: false }).limit(30),
    supabase.from('watch_log').select('*').order('date', { ascending: false }).limit(30),
  ]);
  res.json({
    weight:   weight.data   || [],
    macros:   macros.data   || [],
    workouts: workouts.data || [],
    watch:    watch.data    || [],
  });
});

app.get('/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Fitness Bot — port ${PORT}`));
