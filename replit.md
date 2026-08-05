# Café POS - Replit Project

## Overview
A professional Café Point of Sale (POS) system built with React, TypeScript, Vite, Tailwind CSS, and Zustand. Fully client-side single-page application — no backend.

## Architecture
- **Frontend only**: Pure React SPA, no backend
- **State management**: Zustand (`src/store/usePOSStore.ts`) with localStorage persistence via `src/storage/db.ts`
- **Routing**: React Router v6
- **UI**: shadcn/ui components + custom Tailwind CSS dark café theme
- **Sound**: Web Audio API synthetic sounds in `src/utils/sounds.ts`

## Project Structure

```
src/
  store/
    usePOSStore.ts            ← Zustand global store (all state + actions)
  hooks/
    useOrders.ts              ← Order store selectors/actions
    useTables.ts              ← Table store selectors/actions
    use-mobile.tsx            ← Mobile detection hook
    use-toast.ts              ← Toast notification hook
  components/
    ui/                       ← shadcn/ui + Navigation, TopBar
    tables/                   ← TableCard (timer, item count, running total)
    orders/                   ← MenuItemCard, OrderPanel
    payment/                  ← QRDisplay component
    ThermalReceiptLayout.tsx  ← ONE unified thermal receipt (used by all print portals)
    ReceiptPreview.tsx        ← Admin bill preview (renders ThermalReceiptLayout in a card)
  screens/
    TableOverview.tsx         ← / (all tables)
    OrderScreen.tsx           ← /order/:tableId
    ReviewScreen.tsx          ← /review/:tableId (discount, QR confirm, pay)
    PaymentScreen.tsx         ← /payment/:tableId (reads financials from nav state)
    BillHistory.tsx           ← /history
    AdminPanel.tsx            ← /admin (PIN-protected)
  types/
    pos.ts                    ← All TypeScript types
  storage/
    db.ts                     ← localStorage helpers + seed data
  utils/
    sounds.ts                 ← Web Audio API: playClick, playSuccess, playError
    printer.ts                ← numberToWords() helper only (no Bluetooth)
    print.ts                  ← triggerPrint() — single browser print trigger used everywhere
    calcBill.ts               ← Shared bill calculation (subtotal, discount, VAT, total)
    format.ts                 ← fmt(n) + resolvePaymentLabel()
```

## Print System (Unified)
- **ONE template**: `ThermalReceiptLayout.tsx` — monospace, 80mm thermal receipt format
- **ONE trigger**: `triggerPrint('receipt')` from `src/utils/print.ts`
- **ONE print CSS rule**: `#print-receipt` in `index.css` (no invoice CSS)
- Used as `createPortal` in: PaymentScreen, ReviewScreen, BillHistory
- Used as inline preview in: ReceiptPreview (AdminPanel Company Profile tab)
- **No Bluetooth** — browser print dialog only

## Receipt Layout (Thermal Format)
```
[Centered] Cafe Name / Address / PAN
------
TAX INVOICE
------
Payment Mode | Bill No | Date | Table
SN  Particulars  Qty  Rate  Amt
------
Basic Amount / Discount / Taxable Amount / VAT (if enabled) / Total
------
In word: Rs. XXXX only
Cashier / Time
------
[Centered] Footer
```

## Payment Flow
1. Cashier adds items in OrderScreen
2. Taps Pay → `calcBill()` computes subtotal, discountAmount, vatAmount, total
3. Navigates to `/review/:tableId` (discount controls + QR payment) or `/payment/:tableId` (cash)
4. On confirm: saves Payment record, resets table, shows success screen
5. Auto-triggers `triggerPrint('receipt')` — receipt prints via browser dialog

## VAT System
- `vatEnabled` (bool), `vatRate` (default 0.13 = 13%), `vatMode` ('excluded'|'included')
- Stored in `Settings`; defaults merged in `db.getSettings()`
- `calcBill()` in `src/utils/calcBill.ts` is the single source of truth
- All Payment records store `vatAmount`, `vatRate`, `vatMode`, `vatEnabled`

## Admin Panel Tabs
- **Dashboard** — sales charts
- **Menu** — categories + menu items
- **Tables** — table management
- **Payments** — wallet config (eSewa, Khalti, Fonepay, custom)
- **Company Profile** — café name, address, PAN, footer, bill counter, VAT toggle, logo, bill preview
- **Reports** — revenue reports, CSV export
- **Inventory** — ingredients CRUD, recipes (menu item ↔ ingredients), stock levels with low stock warnings
- **Backup** — JSON export/import

## Inventory System
- Firebase is the source of truth for `alcoholProducts`, `beverageProducts`, `cigaretteProducts`, and `invMovements`.
- The Admin Inventory module uses five operational tabs: Spirits (ml), Wine (ml with bottle/glass pours), Beer (direct bottle/can units), Soft Drinks & Mixers (direct bottle/can/piece units), and Cigarettes (sticks; 20 per packet).
- Unit products use `packagingType` (`btl`, `can`, or `pcs`) and optional `sizeLabel` such as `650ml`, `330ml`, or `250ml`.
- Restocking packaged products is entered as raw units; carton/case multipliers are not used.
- `scripts/seedInventory.mjs` resets the Firebase inventory master with categorized products, zero stock, and `minStock = 0`, then clears inventory logs.
- POS mappings continue to use `alcohol`, `beverage`, and `cigarette` product types; wine is stored in the alcohol collection so bottle and glass deductions share one ml balance.

## Firebase
Real-time sync uses Firebase Realtime Database. Credentials are hardcoded in `src/firebase.js` (project: `sbamboosekuwa`, Asia-Southeast1 region). No additional secrets are required to run the app.

## Running the App
Port 5000 via `npm run dev`. Server: `host: "0.0.0.0"`, `allowedHosts: true`.

## Tech Stack
- React 18 + TypeScript
- Vite 5 + @vitejs/plugin-react-swc
- Tailwind CSS + shadcn/ui (Radix UI)
- **Zustand** (global state)
- React Router v6
- date-fns, lucide-react, recharts, qrcode.react
