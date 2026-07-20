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

interface Timestamps {
  created_at: string
  updated_at: string
}

export interface Wallet extends Timestamps {
  id: string
  user_id: string
  name: string
  type: WalletType
  balance: number
}

export interface Category extends Timestamps {
  id: string
  user_id: string
  name: string
  kind: CategoryKind
  is_stock_category: boolean
  icon: string | null
  color: string | null
  sort_order: number
}

export interface Transaction extends Timestamps {
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

export interface StockItem extends Timestamps {
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

export interface StockSale extends Timestamps {
  id: string
  user_id: string
  stock_item_id: string
  sale_transaction_id: string | null
  qty_sold: number
  sale_price: number
  profit: number
}

export interface Favorite extends Timestamps {
  id: string
  user_id: string
  label: string
  amount: number | null
  type: TransactionType
  category_id: string | null
}

export interface Recurring extends Timestamps {
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

type Row<T> = T
type Insert<T> = Partial<T>
type Update<T> = Partial<T>

interface TableShape<T> {
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
      stock_items: TableShape<StockItem>
      stock_sales: TableShape<StockSale>
      favorites: TableShape<Favorite>
      recurring: TableShape<Recurring>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
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
