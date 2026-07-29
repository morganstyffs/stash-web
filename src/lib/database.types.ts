/**
 * Hand-authored types mirroring supabase/migrations/0001_init.sql.
 * Keep in sync with the schema (or regenerate later with
 * `supabase gen types typescript`). Every row carries user_id, enforced by RLS.
 */

export type TransactionType = 'income' | 'expense'
export type CategoryKind = 'income' | 'expense'
export type WalletType = 'cash' | 'bank' | 'promptpay'
export type ItemCondition = 'new' | 'used_good' | 'flawed'
export type StockStatus = 'in_stock' | 'partial' | 'sold'

// NB: these MUST be `type` aliases (not `interface`s). Only object-literal type
// aliases are assignable to `Record<string, unknown>`, which is what the
// Supabase/PostgREST `GenericTable` constraint requires — an interface would
// silently fail that constraint and collapse insert/update typings to `never`.
type Timestamps = {
  created_at: string
  updated_at: string
}

export type Wallet = Timestamps & {
  id: string
  user_id: string
  name: string
  type: WalletType
}

export type Category = Timestamps & {
  id: string
  user_id: string
  name: string
  kind: CategoryKind
  is_stock_category: boolean
  icon: string | null
  color: string | null
  sort_order: number
}

export type Transaction = Timestamps & {
  id: string
  user_id: string
  type: TransactionType
  amount: number
  category_id: string | null
  wallet_id: string | null
  date: string
  note: string | null
  is_stock_purchase: boolean
  stock_item_id: string | null
}

export type StockItem = Timestamps & {
  id: string
  user_id: string
  name: string
  category: string | null
  brand: string | null
  size: string | null
  color: string | null
  condition: ItemCondition | null
  cost_per_unit: number
  qty_total: number
  qty_remaining: number
  target_price: number | null
  sku: string | null
  status: StockStatus
  needs_details: boolean
  photos: string[]
  source_transaction_id: string | null
}

export type StockSale = Timestamps & {
  id: string
  user_id: string
  stock_item_id: string
  sale_transaction_id: string | null
  qty_sold: number
  sale_price: number
  profit: number
}

export type Favorite = Timestamps & {
  id: string
  user_id: string
  label: string
  amount: number | null
  type: TransactionType
  category_id: string | null
}

export type Budget = Timestamps & {
  id: string
  user_id: string
  category_id: string
  month: string
  amount: number
}

export type StockSkuConfig = Timestamps & {
  user_id: string
  prefix: string
  use_brand_code: boolean
  brand_len: number
  seq_digits: number
  separator: string
  next_seq: number
}

export type Recurring = Timestamps & {
  id: string
  user_id: string
  label: string
  type: TransactionType
  amount: number
  category_id: string | null
  wallet_id: string | null
  schedule: string
  next_run: string | null
  active: boolean
}

/** Named args for the stock_intake_create RPC (mirrors 0004_stock_intake_rpc.sql). */
export type StockIntakeArgs = {
  p_name: string
  p_cost_per_unit: number
  p_qty: number
  p_category?: string | null
  p_category_id?: string | null
  p_wallet_id?: string | null
  p_brand?: string | null
  p_size?: string | null
  p_color?: string | null
  p_condition?: ItemCondition | null
  p_target_price?: number | null
  p_photos?: string[]
  p_needs_details?: boolean
  p_note?: string | null
  /** optional manual brand code override (client sends this once the SKU settings screen ships) */
  p_brand_code?: string | null
}

export type StockIntakeResult = {
  transaction_id: string
  stock_item_id: string
  sku: string
}

type Row<T> = T
type Insert<T> = Partial<T>
type Update<T> = Partial<T>

type TableShape<T> = {
  Row: Row<T>
  Insert: Insert<T>
  Update: Update<T>
  Relationships: []
}

export interface Database {
  public: {
    Tables: {
      wallets: TableShape<Wallet>
      categories: TableShape<Category>
      transactions: TableShape<Transaction>
      budgets: TableShape<Budget>
      stock_items: TableShape<StockItem>
      stock_sales: TableShape<StockSale>
      stock_sku_config: TableShape<StockSkuConfig>
      favorites: TableShape<Favorite>
      recurring: TableShape<Recurring>
    }
    Views: Record<string, never>
    Functions: {
      stock_intake_create: {
        Args: StockIntakeArgs
        Returns: StockIntakeResult[]
      }
      stock_item_delete: {
        Args: { p_item_id: string }
        Returns: undefined
      }
      recurring_run_due: {
        Args: Record<string, never>
        Returns: number
      }
      stock_sku_preview: {
        Args: { p_brand?: string | null; p_brand_code?: string | null }
        Returns: string
      }
    }
    Enums: {
      transaction_type: TransactionType
      category_kind: CategoryKind
      wallet_type: WalletType
      item_condition: ItemCondition
      stock_status: StockStatus
    }
    CompositeTypes: Record<string, never>
  }
}
