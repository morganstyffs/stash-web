/**
 * App-facing type aliases over the generated schema in `database.types.ts`.
 *
 * `database.types.ts` is produced by `supabase gen types typescript` and MUST
 * NOT be hand-edited — every regen overwrites it. Anything we author (friendly
 * row/enum aliases, RPC arg/result shapes, helper types) lives HERE and derives
 * from the generated `Database`, so a schema regen never clobbers our code and
 * a schema drift shows up as a compile error instead of a silent mismatch
 * (see PROJECT_AUDIT F-12 / F-20).
 */
import type { Database, Tables, Enums } from '@/lib/database.types'

// ── Enums ──────────────────────────────────────────────────────────────────
export type TransactionType = Enums<'transaction_type'>
export type CategoryKind = Enums<'category_kind'>
export type WalletType = Enums<'wallet_type'>
export type ItemCondition = Enums<'item_condition'>
export type StockStatus = Enums<'stock_status'>

// ── Table rows ─────────────────────────────────────────────────────────────
export type Wallet = Tables<'wallets'>
/** `system_key` resolves app-managed categories at runtime (e.g. 'stock_cogs'). */
export type Category = Tables<'categories'>
export type Transaction = Tables<'transactions'>
export type StockItem = Tables<'stock_items'>
export type StockSale = Tables<'stock_sales'>
export type Favorite = Tables<'favorites'>
export type Budget = Tables<'budgets'>
export type StockSkuConfig = Tables<'stock_sku_config'>
export type Recurring = Tables<'recurring'>
export type Profile = Tables<'profiles'>
export type FriendConnection = Tables<'friend_connections'>
export type Debt = Tables<'debts'>
export type DebtEvent = Tables<'debt_events'>

// ── RPC arg / result shapes ────────────────────────────────────────────────
type Fns = Database['public']['Functions']

/** Named args for `stock_intake_create` (0004). Optional args omit → SQL DEFAULT. */
export type StockIntakeArgs = Fns['stock_intake_create']['Args']
export type StockIntakeResult = Fns['stock_intake_create']['Returns'][number]

/** Named args for `stock_sale_create` (0012). Optional args omit → SQL DEFAULT. */
export type StockSaleArgs = Fns['stock_sale_create']['Args']
export type StockSaleResult = Fns['stock_sale_create']['Returns'][number]

/** Named args for `debt_create` (0015). Optional args omit → SQL DEFAULT. */
export type DebtCreateArgs = Fns['debt_create']['Args']
export type DebtSettleResult = Fns['debt_settle']['Returns'][number]
export type FriendDebtsSummary = Fns['friend_debts_summary']['Returns'][number]

/** One wallet's balance + its components, straight from `wallet_balances()`
 *  (0028). The RPC returns opening_balance / income_total / expense_total /
 *  transfer_in / transfer_out alongside the net `balance`, so the UI can show
 *  where the number came from without re-deriving it (which would drift). */
export type WalletBalance = Fns['wallet_balances']['Returns'][number]
