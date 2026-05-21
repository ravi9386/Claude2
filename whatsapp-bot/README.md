# LUMINO WhatsApp Bot

Send WhatsApp messages → items appear live in your Lumino cart at vermawisdom.com.

## Setup (15 minutes)

### 1 — Firebase (free)
1. Go to https://console.firebase.google.com → **Create project** → name it `lumino`
2. Go to **Realtime Database** → Create database → Start in **test mode**
3. Copy the database URL (e.g. `https://lumino-xxxxx-default-rtdb.firebaseio.com`)

### 2 — Deploy to Vercel (free)
```bash
cd whatsapp-bot
npx vercel
# Follow prompts — add env var:
# FIREBASE_DB_URL = <your firebase url from step 1>
```
Your webhook URL will be: `https://your-project.vercel.app/webhook`

### 3 — Twilio WhatsApp Sandbox (free, 5 min)
1. Sign up at https://twilio.com
2. Go to **Messaging → Try it out → Send a WhatsApp message**
3. Follow instructions to join the sandbox (send a join code to their number)
4. In **Sandbox Settings**, set:
   - **When a message comes in:** `https://your-project.vercel.app/webhook`
   - Method: `HTTP POST`

### 4 — Connect Lumino site to Firebase
On https://vermawisdom.com, click **🔗 Connect WhatsApp** (bottom of page),
enter your phone number (e.g. `+447911123456`).

Your WhatsApp messages now update your Lumino cart in real time!

## Commands
| Message | Action |
|---|---|
| `hi` / `help` | Show menu |
| `add ribbed cropped top` | Add item to cart |
| `add silk dress size M` | Add with size |
| `remove boots` | Remove from cart |
| `cart` | View cart + total |
| `clear cart` | Empty cart |
| `search dress` | Search products |
| `sale` | Today's deals |
| `checkout` | Get checkout link |

## Example conversation
```
You:    add ribbed cropped top size S
LUMINO: ✅ Added to your cart!
        Ribbed Cropped Top
        Size: S | Colour: Ecru
        Price: £49.99
        🛍 Cart total: £49.99 (1 item)

You:    add chelsea boots
LUMINO: ✅ Added to your cart!
        Chelsea Ankle Boots
        Size: 36 | Colour: Black
        Price: £199.99
        🛍 Cart total: £249.98 (2 items)

You:    cart
LUMINO: 🛍 Your LUMINO Cart:
        • Ribbed Cropped Top (S) × 1 — £49.99
        • Chelsea Ankle Boots (36) × 1 — £199.99
        ──────────
        Total: £249.98
        ✅ FREE shipping
        
        Type checkout to buy or visit:
        https://vermawisdom.com/#/cart
```
