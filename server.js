/**
 * Onur Fitness Bot — Telegram + Türkçe Gıda DB + CalorieNinjas + Supabase
 */

const express = require('express');
const fetch   = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

// ── CONFIG ────────────────────────────────────────────────────────
const BOT_TOKEN      = process.env.BOT_TOKEN      || '8566167507:AAFuXsuyrVbx20lm0gPZVbvdlHBPew7Dc5k';
const SUPABASE_URL   = process.env.SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_KEY;
const CALORIE_NINJAS = process.env.CALORIE_NINJAS || ''; // https://calorieninjas.com/api — ücretsiz kayıt
const TG             = `https://api.telegram.org/bot${BOT_TOKEN}`;
const KCAL_HEDEF     = 3250;
const PROTEIN_HEDEF  = 233;

const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// ── TÜRKÇE GIDA VERİTABANI (100g başına) ─────────────────────────
// Kaynak: USDA / FatSecret / TÜİK ortalamaları
const TR_DB = {
  // Protein kaynakları
  'yumurta':           { kcal:155, p:13,  c:1.1, f:11  },
  'tavuk göğsü':       { kcal:165, p:31,  c:0,   f:3.6 },
  'tavuk':             { kcal:165, p:31,  c:0,   f:3.6 },
  'tavuk but':         { kcal:209, p:26,  c:0,   f:11  },
  'kıyma':             { kcal:250, p:26,  c:0,   f:17  },
  'biftek':            { kcal:271, p:26,  c:0,   f:18  },
  'et':                { kcal:250, p:26,  c:0,   f:17  },
  'somon':             { kcal:208, p:20,  c:0,   f:13  },
  'ton balığı':        { kcal:116, p:26,  c:0,   f:1   },
  'ton':               { kcal:116, p:26,  c:0,   f:1   },
  'levrek':            { kcal:97,  p:19,  c:0,   f:2   },
  'çipura':            { kcal:96,  p:18,  c:0,   f:2.5 },
  'hindi göğsü':       { kcal:135, p:29,  c:0,   f:1   },
  'köfte':             { kcal:250, p:22,  c:5,   f:16  },
  'döner':             { kcal:215, p:18,  c:2,   f:15  },
  'sucuk':             { kcal:450, p:21,  c:2,   f:40  },
  'pastırma':          { kcal:248, p:36,  c:1,   f:11  },
  'whey protein':      { kcal:360, p:70,  c:10,  f:5   },
  'protein tozu':      { kcal:360, p:70,  c:10,  f:5   },

  // Süt ürünleri
  'süt':               { kcal:61,  p:3.2, c:4.8, f:3.3 },
  'yoğurt':            { kcal:61,  p:3.5, c:4.7, f:3.3 },
  'yunan yoğurdu':     { kcal:97,  p:9,   c:3.6, f:5   },
  'beyaz peynir':      { kcal:264, p:17,  c:1,   f:21  },
  'kaşar peyniri':     { kcal:389, p:25,  c:1,   f:32  },
  'kaşar':             { kcal:389, p:25,  c:1,   f:32  },
  'lor peyniri':       { kcal:98,  p:11,  c:4,   f:4   },
  'labne':             { kcal:195, p:9,   c:4,   f:16  },
  'kefir':             { kcal:52,  p:3.3, c:4.5, f:1   },
  'cottage cheese':    { kcal:98,  p:11,  c:3.4, f:4.3 },

  // Karbonhidrat kaynakları
  'ekmek':             { kcal:265, p:9,   c:51,  f:3   },
  'tam buğday ekmeği': { kcal:247, p:13,  c:41,  f:4   },
  'kepek ekmeği':      { kcal:247, p:13,  c:41,  f:4   },
  'pide':              { kcal:271, p:8.5, c:53,  f:2.5 },
  'simit':             { kcal:310, p:10,  c:61,  f:3   },
  'yulaf':             { kcal:389, p:17,  c:66,  f:7   },
  'yulaf ezmesi':      { kcal:389, p:17,  c:66,  f:7   },
  'pirinç':            { kcal:130, p:2.7, c:28,  f:0.3 },
  'pilav':             { kcal:130, p:2.7, c:28,  f:0.3 },
  'bulgur':            { kcal:83,  p:3,   c:19,  f:0.2 },
  'makarna':           { kcal:131, p:5,   c:25,  f:1.1 },
  'erişte':            { kcal:138, p:5,   c:27,  f:1.4 },
  'patates':           { kcal:77,  p:2,   c:17,  f:0.1 },
  'tatlı patates':     { kcal:86,  p:1.6, c:20,  f:0.1 },
  'mısır':             { kcal:86,  p:3.2, c:19,  f:1.2 },
  'granola':           { kcal:471, p:10,  c:64,  f:20  },

  // Bakliyat
  'mercimek':          { kcal:116, p:9,   c:20,  f:0.4 },
  'kırmızı mercimek':  { kcal:116, p:9,   c:20,  f:0.4 },
  'nohut':             { kcal:164, p:9,   c:27,  f:2.6 },
  'fasulye':           { kcal:127, p:8.7, c:23,  f:0.5 },
  'barbunya':          { kcal:127, p:8.7, c:23,  f:0.5 },
  'kuru fasulye':      { kcal:127, p:8.7, c:23,  f:0.5 },
  'bezelye':           { kcal:81,  p:5.4, c:14,  f:0.4 },
  'edamame':           { kcal:121, p:11,  c:9,   f:5.2 },

  // Sebzeler
  'brokoli':           { kcal:34,  p:2.8, c:7,   f:0.4 },
  'ıspanak':           { kcal:23,  p:2.9, c:3.6, f:0.4 },
  'havuç':             { kcal:41,  p:0.9, c:10,  f:0.2 },
  'domates':           { kcal:18,  p:0.9, c:3.9, f:0.2 },
  'salatalık':         { kcal:15,  p:0.6, c:3.6, f:0.1 },
  'biber':             { kcal:20,  p:0.9, c:4.6, f:0.2 },
  'dolmalık biber':    { kcal:20,  p:0.9, c:4.6, f:0.2 },
  'soğan':             { kcal:40,  p:1.1, c:9,   f:0.1 },
  'sarımsak':          { kcal:149, p:6.4, c:33,  f:0.5 },
  'kabak':             { kcal:17,  p:1.2, c:3.6, f:0.3 },
  'patlıcan':          { kcal:25,  p:1,   c:6,   f:0.2 },
  'mantar':            { kcal:22,  p:3.1, c:3.3, f:0.3 },
  'marul':             { kcal:15,  p:1.4, c:2.9, f:0.2 },
  'roka':              { kcal:25,  p:2.6, c:3.7, f:0.7 },
  'kereviz':           { kcal:16,  p:0.7, c:3,   f:0.2 },
  'lahana':            { kcal:25,  p:1.3, c:6,   f:0.1 },
  'karnabahar':        { kcal:25,  p:1.9, c:5,   f:0.3 },
  'semizotu':          { kcal:20,  p:1.6, c:3.4, f:0.4 },

  // Meyveler
  'muz':               { kcal:89,  p:1.1, c:23,  f:0.3 },
  'elma':              { kcal:52,  p:0.3, c:14,  f:0.2 },
  'portakal':          { kcal:47,  p:0.9, c:12,  f:0.1 },
  'mandalina':         { kcal:53,  p:0.8, c:13,  f:0.3 },
  'çilek':             { kcal:32,  p:0.7, c:7.7, f:0.3 },
  'yaban mersini':     { kcal:57,  p:0.7, c:14,  f:0.3 },
  'karpuz':            { kcal:30,  p:0.6, c:7.6, f:0.2 },
  'kavun':             { kcal:34,  p:0.8, c:8.2, f:0.2 },
  'üzüm':              { kcal:67,  p:0.6, c:17,  f:0.4 },
  'armut':             { kcal:57,  p:0.4, c:15,  f:0.1 },
  'kiraz':             { kcal:50,  p:1,   c:12,  f:0.3 },
  'kayısı':            { kcal:48,  p:1.4, c:11,  f:0.4 },
  'şeftali':           { kcal:39,  p:0.9, c:10,  f:0.3 },
  'incir':             { kcal:74,  p:0.8, c:19,  f:0.3 },
  'avokado':           { kcal:160, p:2,   c:9,   f:15  },

  // Kuruyemiş & Yağlar
  'badem':             { kcal:579, p:21,  c:22,  f:50  },
  'ceviz':             { kcal:654, p:15,  c:14,  f:65  },
  'fındık':            { kcal:628, p:15,  c:17,  f:61  },
  'yer fıstığı':       { kcal:567, p:26,  c:16,  f:49  },
  'fıstık ezmesi':     { kcal:588, p:25,  c:20,  f:50  },
  'chia tohumu':       { kcal:486, p:17,  c:42,  f:31  },
  'keten tohumu':      { kcal:534, p:18,  c:29,  f:42  },
  'zeytinyağı':        { kcal:884, p:0,   c:0,   f:100 },
  'tereyağı':          { kcal:717, p:0.9, c:0.1, f:81  },
  'zeytin':            { kcal:115, p:0.8, c:6,   f:11  },
  'siyah zeytin':      { kcal:115, p:0.8, c:6,   f:11  },
  'yeşil zeytin':      { kcal:145, p:1,   c:4,   f:15  },

  // Türk yemekleri
  'menemen':           { kcal:120, p:7,   c:4,   f:8   },
  'mercimek çorbası':  { kcal:70,  p:4,   c:10,  f:1.5 },
  'ezogelin çorbası':  { kcal:73,  p:4,   c:12,  f:1.2 },
  'tarhana çorbası':   { kcal:80,  p:3,   c:14,  f:1.5 },
  'çorba':             { kcal:55,  p:2.5, c:9,   f:1   },
  'cacık':             { kcal:45,  p:2.5, c:3,   f:2.5 },
  'hummus':            { kcal:177, p:8,   c:20,  f:9   },
  'ayran':             { kcal:36,  p:2.5, c:3,   f:1.5 },
  'muhallebi':         { kcal:147, p:3.5, c:26,  f:3.3 },

  // İçecekler
  'kahve':             { kcal:2,   p:0.3, c:0,   f:0   },
  'türk kahvesi':      { kcal:2,   p:0.3, c:0,   f:0   },
  'çay':               { kcal:1,   p:0,   c:0.2, f:0   },
  'portakal suyu':     { kcal:45,  p:0.7, c:10,  f:0.2 },
  'meyve suyu':        { kcal:46,  p:0.5, c:11,  f:0.1 },
};

// Eş anlamlılar / kısaltmalar
const ALIASES = {
  'yumurta': ['yumurta', 'egg'],
  'tavuk': ['tavuk göğsü', 'tavuk'],
  'balık': ['levrek'],
  'süt': ['süt'],
  'ekmek': ['ekmek'],
  'peynir': ['beyaz peynir'],
  'ton': ['ton balığı'],
  'protein': ['whey protein'],
  'yoğurt': ['yoğurt'],
};

// ── UTILS ─────────────────────────────────────────────────────────
const today = () => new Date().toISOString().split('T')[0];
const bar   = (val, max, len = 12) => {
  const filled = Math.min(Math.round((val / max) * len), len);
  return '`' + '█'.repeat(filled) + '░'.repeat(len - filled) + '`';
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
  if (error) console.error(`DB [${table}]:`, error.message);
}

async function dbToday(table) {
  if (!supabase) return null;
  const { data } = await supabase.from(table)
    .select('*').eq('date', today()).order('created_at', { ascending: false }).limit(1);
  return data?.[0] || null;
}

// ── GIDA ARAMA ────────────────────────────────────────────────────

// 1. Yerleşik Türkçe veritabanı
function lookupLocal(query) {
  const q = query.toLowerCase().trim();
  // Tam eşleşme
  if (TR_DB[q]) return { ...TR_DB[q], name: q, source: 'local' };
  // Kısmi eşleşme (başında geçiyor mu)
  for (const [key, val] of Object.entries(TR_DB)) {
    if (key.includes(q) || q.includes(key)) return { ...val, name: key, source: 'local' };
  }
  // Alias
  for (const [alias, targets] of Object.entries(ALIASES)) {
    if (q.includes(alias)) {
      const t = targets[0];
      if (TR_DB[t]) return { ...TR_DB[t], name: t, source: 'local' };
    }
  }
  return null;
}

// 2. CalorieNinjas API (ücretsiz, İngilizce ve Türkçe çalışır)
async function lookupCalorieNinjas(query) {
  if (!CALORIE_NINJAS) return null;
  try {
    const res  = await fetch(`https://api.calorieninjas.com/v1/nutrition?query=${encodeURIComponent(query)}`, {
      headers: { 'X-Api-Key': CALORIE_NINJAS }
    });
    const data = await res.json();
    const item = data?.items?.[0];
    if (!item) return null;
    return {
      name:   item.name,
      kcal:   Math.round(item.calories),
      p:      Math.round(item.protein_g),
      c:      Math.round(item.carbohydrates_total_g),
      f:      Math.round(item.fat_total_g),
      source: 'calorieninjas'
    };
  } catch { return null; }
}

// 3. OpenFoodFacts (son çare)
async function lookupOpenFoodFacts(query) {
  try {
    const url  = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5&fields=product_name,nutriments`;
    const res  = await fetch(url);
    const data = await res.json();
    const item = (data.products || []).find(p => p.nutriments?.['energy-kcal_100g']);
    if (!item) return null;
    return {
      name:   item.product_name || query,
      kcal:   Math.round(item.nutriments['energy-kcal_100g']  || 0),
      p:      Math.round(item.nutriments['proteins_100g']      || 0),
      c:      Math.round(item.nutriments['carbohydrates_100g'] || 0),
      f:      Math.round(item.nutriments['fat_100g']           || 0),
      source: 'openfoodfacts'
    };
  } catch { return null; }
}

async function findFood(query) {
  return lookupLocal(query)
    || await lookupCalorieNinjas(query)
    || await lookupOpenFoodFacts(query)
    || null;
}

// ── PARSE & GRAM ──────────────────────────────────────────────────
function parseFood(text) {
  const clean = text.replace(/yedim|içtim|aldım|atladım/gi, '').trim();
  return clean.split(/\s+ve\s+|\s*,\s*/i)
    .map(part => {
      part = part.trim();
      const m = part.match(/^(\d+[\.,]?\d*)\s*(gr?|gram|kg|ml|litre|l|dilim|kase|bardak|adet|tane|porsiyon|çay kaşığı|yemek kaşığı|fincan|paket|kutu)?\s*(.+)?$/i);
      if (m) {
        return {
          qty:  parseFloat(m[1].replace(',','.')),
          unit: (m[2] || 'adet').toLowerCase(),
          food: (m[3] || '').trim()
        };
      }
      return { qty: 1, unit: 'porsiyon', food: part };
    })
    .filter(f => f.food.length > 0);
}

function toGrams(qty, unit, food) {
  const u = (unit || '').toLowerCase();
  if (['gr','g','gram'].includes(u))   return qty;
  if (u === 'kg')                       return qty * 1000;
  if (['ml','l','litre'].includes(u))   return u === 'l' ? qty * 1000 : qty;
  if (u === 'dilim')                    return qty * 30;
  if (u === 'bardak')                   return qty * 240;
  if (u === 'kase')                     return qty * 200;
  if (u === 'çay kaşığı')               return qty * 5;
  if (u === 'yemek kaşığı')             return qty * 15;
  if (u === 'fincan')                   return qty * 120;
  if (u === 'paket' || u === 'kutu')    return qty * 100;
  // adet / tane → yumurta özel
  if (['adet','tane'].includes(u) && /yumurta/i.test(food)) return qty * 60;
  return qty * 100; // porsiyon / varsayılan
}

// ── KOMUTLAR ──────────────────────────────────────────────────────
async function handleKilo(chatId, args) {
  const val = parseFloat(args[0]);
  if (isNaN(val) || val < 30 || val > 300)
    return send(chatId, '⚠️ Geçersiz değer.\nÖrnek: `/kilo 105.2`');
  await dbUpsert('weight_log', { date: today(), weight: val });
  send(chatId, `✅ *${val} kg* kaydedildi.`);
}

async function handleAntrenman(chatId, args) {
  const gun = (args[0] || '').toUpperCase();
  if (!['A','B','C','D','REST'].includes(gun))
    return send(chatId, '⚠️ Geçersiz gün.\nÖrnek: `/antrenman A` veya `/antrenman REST`');
  await dbUpsert('workout_log', { date: today(), day: gun, notes: args.slice(1).join(' ') });
  const label = gun === 'REST' ? '😴 Dinlenme günü' : `💪 ${gun} antrenmanı`;
  send(chatId, `✅ *${label}* kaydedildi.`);
}

async function handleWatch(chatId, args) {
  const MAP  = { hrv:'hrv', rhr:'rhr', uyku:'sleep', adim:'steps', cal:'active_cal', vo2:'vo2' };
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
  if (data.steps)      msg += `Adım: *${Number(data.steps).toLocaleString('tr-TR')}*\n`;
  if (data.active_cal) msg += `Aktif kalori: *${data.active_cal}* kcal\n`;
  if (data.vo2)        msg += `VO₂ max: *${data.vo2}*\n`;
  send(chatId, msg);
}

async function handleYemek(chatId, text) {
  const items = parseFood(text);
  if (!items.length)
    return send(chatId, '⚠️ Anlaşılamadı.\nÖrnek: "2 yumurta ve 150gr tavuk yedim"');

  await send(chatId, '🔍 Hesaplanıyor...');

  let totalKcal = 0, totalP = 0, totalC = 0, totalF = 0;
  let lines = '';
  const log = [];

  for (const item of items) {
    if (!item.food) continue;
    const r = await findFood(item.food);
    if (!r) {
      lines += `❓ *${item.food}* — bulunamadı\n`;
      continue;
    }
    const g    = toGrams(item.qty, item.unit, item.food);
    const fac  = g / 100;
    const kcal = Math.round(r.kcal * fac);
    const prot = Math.round(r.p   * fac);
    const carb = Math.round(r.c   * fac);
    const fat  = Math.round(r.f   * fac);
    totalKcal += kcal; totalP += prot; totalC += carb; totalF += fat;
    lines += `▸ *${item.qty} ${item.unit} ${item.food}* (${g}g)\n`;
    lines += `  ${kcal} kcal · ${prot}g P · ${carb}g K · ${fat}g Y\n`;
    log.push({ name: r.name, qty: item.qty, unit: item.unit, grams: g, kcal, protein: prot, carb, fat });
  }

  // Günlük toplamlara ekle
  const ex   = await dbToday('macro_log');
  const nKcal = (ex?.kcal    || 0) + totalKcal;
  const nP    = (ex?.protein || 0) + totalP;
  const nC    = (ex?.carb    || 0) + totalC;
  const nF    = (ex?.fat     || 0) + totalF;
  await dbUpsert('macro_log', {
    date: today(), kcal: nKcal, protein: nP, carb: nC, fat: nF,
    foods: JSON.stringify([...(JSON.parse(ex?.foods || '[]')), ...log])
  });

  const kalan = KCAL_HEDEF - nKcal;
  const prog  = bar(nKcal, KCAL_HEDEF);

  let msg = `*🍽 Yemek kaydedildi*\n\n`;
  msg += lines;
  msg += `\nBu öğün: *${totalKcal} kcal* · ${totalP}g P · ${totalC}g K · ${totalF}g Y\n`;
  msg += `\n*Gün toplamı*\n`;
  msg += `${prog} ${nKcal}/${KCAL_HEDEF} kcal\n`;
  msg += `P: ${nP}g/${PROTEIN_HEDEF}g · K: ${nC}g · Y: ${nF}g\n`;
  msg += kalan > 0 ? `Kalan: *${kalan} kcal*` : `🎯 *Kalori hedefine ulaşıldı!*`;
  send(chatId, msg);
}

async function handleRapor(chatId) {
  const [w, m, wo, wt] = await Promise.all([
    dbToday('weight_log'), dbToday('macro_log'),
    dbToday('workout_log'), dbToday('watch_log'),
  ]);

  const kcal  = m?.kcal || 0;
  const kalan = KCAL_HEDEF - kcal;
  const prog  = bar(kcal, KCAL_HEDEF);

  let msg = `*📋 Günlük Özet — ${today()}*\n\n`;
  msg += `⚖️  Kilo: ${w  ? `*${w.weight} kg*` : '—'}\n`;
  msg += `💪  Antrenman: ${wo ? `*${wo.day} günü*` : '—'}\n\n`;
  msg += `*Kalori*\n${prog} ${kcal}/${KCAL_HEDEF}\n`;
  if (m) {
    msg += `P: ${m.protein}g/${PROTEIN_HEDEF}g · K: ${m.carb}g · Y: ${m.fat}g\n`;
    msg += kalan > 0 ? `Kalan: ${kalan} kcal\n` : `🎯 Hedefe ulaşıldı!\n`;
  } else {
    msg += `Henüz yemek girilmedi\n`;
  }
  if (wt) {
    msg += `\n*Apple Watch*\n`;
    if (wt.hrv)        msg += `HRV: *${wt.hrv}* ms · DKH: *${wt.rhr || '—'}* bpm\n`;
    if (wt.sleep)      msg += `Uyku: *${wt.sleep}* saat\n`;
    if (wt.steps)      msg += `Adım: *${Number(wt.steps).toLocaleString('tr-TR')}* · Aktif: *${wt.active_cal || '—'}* kcal\n`;
    if (wt.vo2)        msg += `VO₂ max: *${wt.vo2}*\n`;
  }
  send(chatId, msg);
}

async function handleHelp(chatId) {
  send(chatId, `*🏋️ Fitness Bot*

*Yemek logla:*
"2 yumurta yedim"
"150gr tavuk ve 1 kase pirinç yedim"
"1 muz ve 30gr badem yedim"

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

    if      (text.startsWith('/kilo'))      await handleKilo(chatId, text.split(' ').slice(1));
    else if (text.startsWith('/antrenman')) await handleAntrenman(chatId, text.split(' ').slice(1));
    else if (text.startsWith('/watch'))     await handleWatch(chatId, text.split(' ').slice(1));
    else if (text.startsWith('/rapor'))     await handleRapor(chatId);
    else if (/\/yardim|\/start|\/help/i.test(text)) await handleHelp(chatId);
    else if (/yedim|içtim/i.test(text))    await handleYemek(chatId, text);
    else await send(chatId, '❓ Anlamadım.\n/yardim — komutları gör');
  } catch (e) {
    console.error('Webhook error:', e);
  }
});

// ── API ───────────────────────────────────────────────────────────
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
