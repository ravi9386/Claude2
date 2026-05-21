// LUMINO WhatsApp Webhook — Vercel Serverless Function
// Receives Twilio WhatsApp messages, updates Firebase cart, replies to user
const CATALOG = require('../catalog');

const DB = () => process.env.FIREBASE_DB_URL; // e.g. https://lumino-xxxxx-default-rtdb.firebaseio.com

/* ── Firebase REST helpers ──────────────────────────────────────── */
async function fbGet(path) {
  const r = await fetch(`${DB()}/${path}.json`);
  return r.ok ? r.json() : null;
}
async function fbSet(path, data) {
  await fetch(`${DB()}/${path}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

/* ── Phone key (strip non-digits) ──────────────────────────────── */
const phoneKey = (p) => p.replace(/\D/g, '');

/* ── Product search ─────────────────────────────────────────────── */
function findProduct(query) {
  const q = query.toLowerCase().trim();
  // Exact name match first
  let match = CATALOG.find(p => p.name.toLowerCase() === q);
  if (match) return match;
  // Contains all words
  const words = q.split(/\s+/).filter(w => w.length > 2);
  match = CATALOG.find(p => {
    const hay = `${p.name} ${p.brand} ${p.category} ${p.subcategory}`.toLowerCase();
    return words.every(w => hay.includes(w));
  });
  if (match) return match;
  // Any word match (scored)
  const scored = CATALOG.map(p => {
    const hay = `${p.name} ${p.brand} ${p.category} ${p.subcategory}`.toLowerCase();
    const score = words.filter(w => hay.includes(w)).length;
    return { p, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  return scored[0]?.p || null;
}

/* ── Detect size from message ───────────────────────────────────── */
function detectSize(msg, product) {
  const upper = msg.toUpperCase();
  if (product && product.sizes) {
    for (const s of product.sizes) {
      if (upper.includes(s.toUpperCase())) return s;
    }
  }
  for (const s of ['XXS','XS','S','M','L','XL','XXL']) {
    if (upper.includes(s)) return s;
  }
  return null;
}

/* ── Format price ───────────────────────────────────────────────── */
const fp = (n) => `£${Number(n).toFixed(2)}`;

/* ═══════════════════════════════════════════════════════════════════
   MAIN HANDLER
   ═══════════════════════════════════════════════════════════════════ */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body;
  const from  = (body.From || '').replace('whatsapp:', '');
  const msg   = (body.Body || '').trim();
  const key   = phoneKey(from);

  if (!msg || !key) return res.status(400).end();

  const reply = await processMessage(msg, key);

  res.setHeader('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(reply)}</Message></Response>`);
}

/* ═══════════════════════════════════════════════════════════════════
   MESSAGE ROUTER
   ═══════════════════════════════════════════════════════════════════ */
async function processMessage(msg, key) {
  const t = msg.toLowerCase().trim();

  // HELP / GREETING
  if (/^(hi|hello|hey|help|start|menu)$/.test(t)) {
    return `👋 Welcome to *LUMINO*!\n\nHere's what you can do:\n• *add [item]* — add to cart\n• *remove [item]* — remove from cart\n• *cart* — view your cart\n• *clear cart* — empty your cart\n• *search [item]* — find products\n• *sale* — today's deals\n\nExample: _add ribbed cropped top size M_`;
  }

  // VIEW CART
  if (/^(cart|my cart|show cart|view cart|bag)$/.test(t)) {
    return await handleViewCart(key);
  }

  // CLEAR CART
  if (/^(clear cart|empty cart|remove all|clear bag)$/.test(t)) {
    await fbSet(`carts/${key}`, []);
    return `🗑 Your cart has been cleared! Ready to start fresh?`;
  }

  // SALE
  if (/^(sale|deals|offers|discounts)$/.test(t)) {
    const items = CATALOG.filter(p => p.discount > 0).slice(0, 5);
    const list = items.map(p => `• *${p.name}* — ${fp(p.price)} _(${p.discount}% off)_`).join('\n');
    return `🏷 *Today's Sale Picks:*\n${list}\n\nTo add one: _add [name]_`;
  }

  // SEARCH
  if (/^search\b/.test(t)) {
    const query = t.replace(/^search\s*/i, '').trim();
    const results = CATALOG.filter(p => {
      const hay = `${p.name} ${p.brand} ${p.category} ${p.subcategory}`.toLowerCase();
      return hay.includes(query);
    }).slice(0, 5);
    if (!results.length) return `🔍 No results for "${query}". Try a different keyword.`;
    const list = results.map(p => `• *${p.name}* by ${p.brand} — ${fp(p.price)}`).join('\n');
    return `🔍 *Results for "${query}":*\n${list}\n\nTo add: _add [name]_`;
  }

  // REMOVE ITEM
  if (/^(remove|delete)\b/.test(t)) {
    const query = t.replace(/^(remove|delete)\s*/i, '').trim();
    return await handleRemove(key, query);
  }

  // ADD ITEM
  if (/^add\b/.test(t)) {
    const query = t.replace(/^add\s*/i, '').trim();
    return await handleAdd(key, msg, query);
  }

  // CHECKOUT LINK
  if (/checkout|pay|buy now|place order/.test(t)) {
    return `💳 Ready to checkout? Open your cart here:\nhttps://vermawisdom.com/#/cart\n\nYour saved items will be waiting! 🛍`;
  }

  return `I didn't understand that. Type *help* to see available commands.`;
}

/* ─── ADD ─────────────────────────────────────────────────────────── */
async function handleAdd(key, originalMsg, query) {
  // Strip size words to get cleaner product query
  const cleanQuery = query.replace(/\b(size|sz)\s*\w+/i, '').replace(/\b(xs|s\b|m\b|l\b|xl|xxl|xxs)\b/i, '').trim();
  const product = findProduct(cleanQuery || query);

  if (!product) {
    return `😕 I couldn't find a product matching "*${query}*".\n\nTry:\n• _add cropped top_\n• _add black boots_\n• _search dress_ to browse`;
  }

  const size = detectSize(originalMsg, product) || product.sizes[0];
  const color = product.colors[0];

  const cart = (await fbGet(`carts/${key}`)) || [];
  const existing = cart.find(i => i.productId === product.id && i.size === size);

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      productId: product.id,
      name: product.name,
      brand: product.brand,
      size,
      color,
      price: product.price,
      quantity: 1,
    });
  }

  await fbSet(`carts/${key}`, cart);

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  return `✅ Added to your cart!\n\n*${product.name}*\nSize: ${size} | Colour: ${color}\nPrice: ${fp(product.price)}\n\n🛍 Cart total: *${fp(total)}* (${cart.reduce((s,i)=>s+i.quantity,0)} items)\n\nType *cart* to review or *checkout* to buy.`;
}

/* ─── REMOVE ─────────────────────────────────────────────────────── */
async function handleRemove(key, query) {
  const cart = (await fbGet(`carts/${key}`)) || [];
  if (!cart.length) return `Your cart is already empty!`;

  const product = findProduct(query);
  const idx = product
    ? cart.findIndex(i => i.productId === product.id)
    : cart.findIndex(i => i.name.toLowerCase().includes(query.toLowerCase()));

  if (idx === -1) return `❌ I couldn't find "*${query}*" in your cart.\n\nType *cart* to see what's in your bag.`;

  const removed = cart.splice(idx, 1)[0];
  await fbSet(`carts/${key}`, cart);
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  return `🗑 Removed *${removed.name}* from your cart.\n\n${cart.length ? `Cart total: *${fp(total)}*` : `Your cart is now empty.`}`;
}

/* ─── VIEW CART ──────────────────────────────────────────────────── */
async function handleViewCart(key) {
  const cart = (await fbGet(`carts/${key}`)) || [];
  if (!cart.length) return `🛍 Your cart is empty!\n\nStart shopping:\n• _add silk wrap dress_\n• _add chelsea boots_\n• _sale_ — today's deals`;

  const lines = cart.map(i => `• *${i.name}* (${i.size}) × ${i.quantity} — ${fp(i.price * i.quantity)}`).join('\n');
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const free = total >= 50 ? '✅ FREE shipping' : `📦 Add ${fp(50 - total)} more for free shipping`;
  return `🛍 *Your LUMINO Cart:*\n\n${lines}\n\n──────────\n*Total: ${fp(total)}*\n${free}\n\nType *checkout* to buy or visit:\nhttps://vermawisdom.com/#/cart`;
}

/* ─── XML escape ─────────────────────────────────────────────────── */
function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
