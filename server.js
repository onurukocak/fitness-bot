/**
 * Onur Fitness Bot — Telegram Webhook + OpenFoodFacts + Supabase
 * Deploy: Render.com (free tier)
 */

const express = require('express');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

// ── ENV ──────────────────────────────────────────────────────────
const BOT_TOKEN   = process.env.BOT_TOKEN   || '8566167507:AAFuXsuyrVbx20lm0gPZVbvdlHBPew7Dc5k';
const CHAT_ID     = process.env.CHAT_ID     || '7979693959';
const SUPABASE_URL= process.env.SUPABASE_URL;
const SUPABASE_KEY= process.env.SUPABASE_KEY;
const TG_API      = `https://api.telegram.org/bot${BOT_TOKEN}`;

const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// ── HELPERS ──────────────────────────────────────────────────────
const today = () => new Date().toISOString().split('T')[0];

async function sendMsg(chatId, text, extra = {}) {
  await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', ...extra })
  });
}

async function dbInsert(table, data) {
  if (!supabase) return false;
  const { error } = await supabase.from(table).upsert(data);
  return !error;
}

async function dbGetToday(table) {
  if (!supabase) return null;
  const { data } = await supabase.from(table)
    .select('*').eq('date', today()).order('created_at', { ascending: false }).limit(1);
  return data?.[0] || null;
}

// ── FOOD SEARCH (OpenFoodFacts) ───────────────────────────────────
async function searchFood(query) {
  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=3&fields=product_name,nutriments`;
    const res = await fetch(url);
    const data = await res.json();
    const products = (data.products || []).filter(p => p.nutriments?.['energy-kcal_100g']);
    return products.slice(0, 3).map(p => ({
      name: p.product_name || query,
      kcal100: Math.round(p.nutriments['energy-kcal_100g'] || 0),
      protein100: Math.round(p.nutriments['proteins_100g'] || 0),
      carb100: Math.round(p.nutriments['carbohydrates_100g'] || 0),
      fat100: Math.round(p.nutriments['fat_100g'] || 0),
    }));
  } catch { return []; }
}

// ── PARSE FOOD MESSAGE ────────────────────────────────────────────
// "2 yumurta ve 1 dilim ekmek yedim" → [{item:"yumurta",qty:2,unit:"adet"}, ...]
function parseFoodText(text) {
  const cleaned = text.replace(/yedim|içtim|aldım|atladım/gi, '').trim();
  const parts = cleaned.split(/\s+ve\s+|\s*,\s*/i);
  return parts.map(part => {
    const m = part.trim().match(/^(\d+[\.,]?\d*)\s*(gr?|gram|kg|ml|litre|dilim|kase|bardak|adet|tane|porsiyon)?\s*(.+)?$/i);
    if (m) {
      return { qty: parseFloat(m[1].replace(',', '.')), unit: m[2] || 'adet', food: (m[3] || '').trim() };
    }
    // Sayı yoksa, 1 porsiyon kabul et
    return { qty: 1, unit: 'porsiyon', food: part.trim() };
  }).filter(f => f.food.length > 0);
}

// Gram'a çevir (yaklaşık)
function toGrams(qty, unit, defaultPortion = 100) {
  const u = (unit || '').toLowerCase();
  if (['gr', 'gram', 'g'].includes(u)) return qty;
  if (u === 'kg') return qty * 1000;
  if (u === 'ml') return qty;
  if (u === 'litre') return qty * 1000;
  if (u === 'dilim') return qty * 30;
  if (u === 'bardak') return qty * 240;
  if (u === 'kase') return qty * 200;
  if (u === 'porsiyon') return qty * defaultPortion;
  return qty * defaultPortion; // adet / tane
}

// ── COMMAND HANDLERS ─────────────────────────────────────────────

async function handleKilo(chatId, args) {
  const val = parseFloat(args[0]);
  if (isNaN(val) || val < 30 || val > 300) {
    return sendMsg(chatId, '⚠️ Geçersiz kilo. Örnek: `/kilo 105.2`');
  }
  await dbInsert('weight_log', { date: today(), weight: val });
  sendMsg(chatId, `✅ *${val} kg* kaydedildi (${today()})`);
}

async function handleAntrenman(chatId, args) {
  const gun = (args[0] || '').toUpperCase();
  const validDays = ['A', 'B', 'C', 'D', 'REST'];
  if (!validDays.includes(gun)) {
    return sendMsg(chatId, '⚠️ Gün: A, B, C, D veya REST\nÖrnek: `/antrenman A`');
  }
  await dbInsert('workout_log', { date: today(), day: gun, notes: args.slice(1).join(' ') });
  const emoji = gun === 'REST' ? '😴' : '💪';
  sendMsg(chatId, `${emoji} *${gun} günü* kaydedildi!`);
}

async function handleWatch(chatId, args) {
  // /watch hrv:65 rhr:52 uyku:7.5 adim:9200 cal:420
  const data = { date: today() };
  args.forEach(a => {
    const [k, v] = a.split(':');
    if (k && v) {
      const map = { hrv:'hrv', rhr:'rhr', uyku:'sleep', adim:'steps', cal:'active_cal', vo2:'vo2' };
      if (map[k]) data[map[k]] = parseFloat(v);
    }
  });
  await dbInsert('watch_log', data);
  sendMsg(chatId, `⌚ Apple Watch verileri kaydedildi!\n${JSON.stringify(data, null, 2)}`);
}

async function handleYemek(chatId, text) {
  const items = parseFoodText(text);
  if (!items.length) return sendMsg(chatId, '⚠️ Yemek anlaşılamadı. Örnek: "2 yumurta ve 1 dilim ekmek yedim"');

  await sendMsg(chatId, '🔍 Besin değerleri aranıyor...');

  let totalKcal = 0, totalProtein = 0, totalCarb = 0, totalFat = 0;
  let report = '*📊 Besin Analizi*\n\n';
  const pendingLog = [];

  for (const item of items) {
    const results = await searchFood(item.food);
    if (!results.length) {
      report += `❓ *${item.food}* — bulunamadı\n`;
      continue;
    }
    const r = results[0];
    const grams = toGrams(item.qty, item.unit, 100);
    const factor = grams / 100;
    const kcal    = Math.round(r.kcal100 * factor);
    const protein = Math.round(r.protein100 * factor);
    const carb    = Math.round(r.carb100 * factor);
    const fat     = Math.round(r.fat100 * factor);

    totalKcal    += kcal;
    totalProtein += protein;
    totalCarb    += carb;
    totalFat     += fat;

    report += `• *${item.qty} ${item.unit} ${item.food}* (~${grams}g)\n`;
    report += `  🔥 ${kcal} kcal | 💪 ${protein}g P | 🍞 ${carb}g K | 🧈 ${fat}g Y\n\n`;

    pendingLog.push({ name: r.name, qty: item.qty, unit: item.unit, grams, kcal, protein, carb, fat });
  }

  report += `─────────────────\n`;
  report += `*TOPLAM: ${totalKcal} kcal*\n`;
  report += `💪 Protein: ${totalProtein}g | 🍞 Karb: ${totalCarb}g | 🧈 Yağ: ${totalFat}g\n\n`;
  report += `Hedef: 3250 kcal | Kalan: ${3250 - totalKcal} kcal`;

  // Supabase'e kaydet
  const existing = await dbGetToday('macro_log');
  const newMacro = {
    date: today(),
    kcal: (existing?.kcal || 0) + totalKcal,
    protein: (existing?.protein || 0) + totalProtein,
    carb: (existing?.carb || 0) + totalCarb,
    fat: (existing?.fat || 0) + totalFat,
    foods: JSON.stringify([...(JSON.parse(existing?.foods || '[]')), ...pendingLog])
  };
  await dbInsert('macro_log', newMacro);

  sendMsg(chatId, report);
}

async function handleRapor(chatId) {
  const [w, m, wo, wt] = await Promise.all([
    dbGetToday('weight_log'),
    dbGetToday('macro_log'),
    dbGetToday('workout_log'),
    dbGetToday('watch_log'),
  ]);

  let msg = `*📋 Günlük Rapor — ${today()}*\n\n`;
  msg += w  ? `⚖️ Kilo: *${w.weight} kg*\n` : '⚖️ Kilo: —\n';
  msg += wo ? `💪 Antrenman: *${wo.day} günü*\n` : '💪 Antrenman: —\n';
  msg += m  ? `🔥 Kalori: *${m.kcal}* / 3250 kcal\n` : '🔥 Kalori: —\n';
  msg += m  ? `  Protein: ${m.protein}g / 233g | Karb: ${m.carb}g | Yağ: ${m.fat}g\n` : '';
  msg += wt ? `❤️ HRV: ${wt.hrv||'—'} | DKH: ${wt.rhr||'—'} | Uyku: ${wt.sleep||'—'}s\n` : '';
  msg += wt ? `👟 Adım: ${wt.steps||'—'} | Aktif: ${wt.active_cal||'—'} kcal\n` : '';

  sendMsg(chatId, msg);
}

async function handleHelp(chatId) {
  sendMsg(chatId, `*🏋️ Onur Fitness Bot — Komutlar*\n
📝 *Yemek logla:*
"2 yumurta ve 1 dilim ekmek yedim"
"150gr tavuk göğsü ve 1 kase pirinç yedim"

⚖️ */kilo 105.2* — kilo kaydet
💪 */antrenman A* — antrenman günü kaydet (A/B/C/D/REST)
⌚ */watch hrv:65 rhr:52 uyku:7.5 adim:9200 cal:420*
📋 */rapor* — günlük özet
❓ */yardim* — bu menü`);
}

// ── WEBHOOK ──────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const msg = req.body?.message;
    if (!msg) return;
    const chatId = msg.chat.id;
    const text   = (msg.text || '').trim();

    if (text.startsWith('/kilo')) {
      await handleKilo(chatId, text.split(' ').slice(1));
    } else if (text.startsWith('/antrenman')) {
      await handleAntrenman(chatId, text.split(' ').slice(1));
    } else if (text.startsWith('/watch')) {
      await handleWatch(chatId, text.split(' ').slice(1));
    } else if (text.startsWith('/rapor')) {
      await handleRapor(chatId);
    } else if (text.startsWith('/yardim') || text.startsWith('/start') || text.startsWith('/help')) {
      await handleHelp(chatId);
    } else if (/yedim|içtim/i.test(text)) {
      await handleYemek(chatId, text);
    } else {
      await sendMsg(chatId, '❓ Anlamadım. /yardim yaz.');
    }
  } catch (e) {
    console.error('Webhook error:', e);
  }
});

// ── DATA API (dashboard için) ────────────────────────────────────
app.get('/api/data', async (req, res) => {
  if (!supabase) return res.json({ error: 'Supabase bağlı değil' });
  const [weight, macros, workouts, watch] = await Promise.all([
    supabase.from('weight_log').select('*').order('date', { ascending: false }).limit(30),
    supabase.from('macro_log').select('*').order('date', { ascending: false }).limit(30),
    supabase.from('workout_log').select('*').order('date', { ascending: false }).limit(30),
    supabase.from('watch_log').select('*').order('date', { ascending: false }).limit(30),
  ]);
  res.json({
    weight:   weight.data || [],
    macros:   macros.data || [],
    workouts: workouts.data || [],
    watch:    watch.data || [],
  });
});

app.get('/health', (_, res) => res.json({ ok: true, time: new Date().toISOString() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Fitness Bot çalışıyor — port ${PORT}`));
