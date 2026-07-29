export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      budgets: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          id: string
          month: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          category_id: string
          created_at?: string
          id?: string
          month: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          id?: string
          month?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_stock_category: boolean
          is_system: boolean
          kind: Database["public"]["Enums"]["category_kind"]
          name: string
          sort_order: number
          system_key: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_stock_category?: boolean
          is_system?: boolean
          kind?: Database["public"]["Enums"]["category_kind"]
          name: string
          sort_order?: number
          system_key?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_stock_category?: boolean
          is_system?: boolean
          kind?: Database["public"]["Enums"]["category_kind"]
          name?: string
          sort_order?: number
          system_key?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          amount: number | null
          category_id: string | null
          created_at: string
          id: string
          label: string
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          category_id?: string | null
          created_at?: string
          id?: string
          label: string
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount?: number | null
          category_id?: string | null
          created_at?: string
          id?: string
          label?: string
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring: {
        Row: {
          active: boolean
          amount: number
          category_id: string | null
          created_at: string
          id: string
          label: string
          next_run: string | null
          schedule: string
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string
          wallet_id: string | null
        }
        Insert: {
          active?: boolean
          amount?: number
          category_id?: string | null
          created_at?: string
          id?: string
          label: string
          next_run?: string | null
          schedule: string
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string
          wallet_id?: string | null
        }
        Update: {
          active?: boolean
          amount?: number
          category_id?: string | null
          created_at?: string
          id?: string
          label?: string
          next_run?: string | null
          schedule?: string
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_migrations: {
        Row: {
          applied_at: string
          version: string
        }
        Insert: {
          applied_at?: string
          version: string
        }
        Update: {
          applied_at?: string
          version?: string
        }
        Relationships: []
      }
      stock_items: {
        Row: {
          brand: string | null
          category: string | null
          color: string | null
          condition: Database["public"]["Enums"]["item_condition"] | null
          cost_per_unit: number
          created_at: string
          id: string
          name: string
          needs_details: boolean
          photos: string[]
          qty_remaining: number
          qty_total: number
          size: string | null
          sku: string
          source_transaction_id: string | null
          status: Database["public"]["Enums"]["stock_status"]
          target_price: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          category?: string | null
          color?: string | null
          condition?: Database["public"]["Enums"]["item_condition"] | null
          cost_per_unit?: number
          created_at?: string
          id?: string
          name: string
          needs_details?: boolean
          photos?: string[]
          qty_remaining?: number
          qty_total?: number
          size?: string | null
          sku: string
          source_transaction_id?: string | null
          status?: Database["public"]["Enums"]["stock_status"]
          target_price?: number | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          brand?: string | null
          category?: string | null
          color?: string | null
          condition?: Database["public"]["Enums"]["item_condition"] | null
          cost_per_unit?: number
          created_at?: string
          id?: string
          name?: string
          needs_details?: boolean
          photos?: string[]
          qty_remaining?: number
          qty_total?: number
          size?: string | null
          sku?: string
          source_transaction_id?: string | null
          status?: Database["public"]["Enums"]["stock_status"]
          target_price?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_source_transaction_fk"
            columns: ["source_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_sales: {
        Row: {
          cogs_transaction_id: string | null
          cost_at_sale: number
          created_at: string
          id: string
          profit: number
          qty_sold: number
          sale_price: number
          sale_transaction_id: string | null
          sold_on: string
          stock_item_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cogs_transaction_id?: string | null
          cost_at_sale: number
          created_at?: string
          id?: string
          profit?: number
          qty_sold?: number
          sale_price?: number
          sale_transaction_id?: string | null
          sold_on: string
          stock_item_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          cogs_transaction_id?: string | null
          cost_at_sale?: number
          created_at?: string
          id?: string
          profit?: number
          qty_sold?: number
          sale_price?: number
          sale_transaction_id?: string | null
          sold_on?: string
          stock_item_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_sales_cogs_transaction_id_fkey"
            columns: ["cogs_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_sales_sale_transaction_id_fkey"
            columns: ["sale_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_sales_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_sku_config: {
        Row: {
          brand_len: number
          created_at: string
          next_seq: number
          prefix: string
          separator: string
          seq_digits: number
          updated_at: string
          use_brand_code: boolean
          user_id: string
        }
        Insert: {
          brand_len?: number
          created_at?: string
          next_seq?: number
          prefix?: string
          separator?: string
          seq_digits?: number
          updated_at?: string
          use_brand_code?: boolean
          user_id?: string
        }
        Update: {
          brand_len?: number
          created_at?: string
          next_seq?: number
          prefix?: string
          separator?: string
          seq_digits?: number
          updated_at?: string
          use_brand_code?: boolean
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          date: string
          id: string
          is_stock_cogs: boolean
          is_stock_purchase: boolean
          note: string | null
          stock_item_id: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string
          wallet_id: string | null
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          date?: string
          id?: string
          is_stock_cogs?: boolean
          is_stock_purchase?: boolean
          note?: string | null
          stock_item_id?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string
          wallet_id?: string | null
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          date?: string
          id?: string
          is_stock_cogs?: boolean
          is_stock_purchase?: boolean
          note?: string | null
          stock_item_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          created_at: string
          id: string
          name: string
          type: Database["public"]["Enums"]["wallet_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          type?: Database["public"]["Enums"]["wallet_type"]
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          type?: Database["public"]["Enums"]["wallet_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      recurring_next_date: {
        Args: { p_from: string; p_schedule: string }
        Returns: string
      }
      recurring_run_due: { Args: never; Returns: number }
      seed_defaults: { Args: { uid: string }; Returns: undefined }
      seed_defaults_internal: { Args: { uid: string }; Returns: undefined }
      stock_intake_create: {
        Args: {
          p_brand?: string
          p_brand_code?: string
          p_category?: string
          p_category_id?: string
          p_color?: string
          p_condition?: Database["public"]["Enums"]["item_condition"]
          p_cost_per_unit: number
          p_name: string
          p_needs_details?: boolean
          p_note?: string
          p_photos?: string[]
          p_qty: number
          p_size?: string
          p_target_price?: number
          p_wallet_id?: string
        }
        Returns: {
          sku: string
          stock_item_id: string
          transaction_id: string
        }[]
      }
      stock_item_delete: { Args: { p_item_id: string }; Returns: undefined }
      stock_sale_create: {
        Args: {
          p_cogs_category_id?: string
          p_income_category_id?: string
          p_item_id: string
          p_note?: string
          p_qty: number
          p_sale_date?: string
          p_sale_price: number
          p_wallet_id?: string
        }
        Returns: {
          cogs_transaction_id: string
          income_transaction_id: string
          profit: number
          qty_remaining: number
          sale_id: string
          status: Database["public"]["Enums"]["stock_status"]
        }[]
      }
      stock_sale_reverse: {
        Args: { p_sale_id: string }
        Returns: {
          item_id: string
          qty_remaining: number
          status: Database["public"]["Enums"]["stock_status"]
        }[]
      }
      stock_sales_summary: {
        Args: { p_from: string; p_to: string }
        Returns: {
          cogs: number
          profit: number
          qty_sold: number
          revenue: number
          sale_count: number
        }[]
      }
      stock_sku_build: {
        Args: {
          p_brand: string
          p_brand_code: string
          p_brand_len: number
          p_digits: number
          p_prefix: string
          p_sep: string
          p_seq: number
          p_use_brand: boolean
        }
        Returns: string
      }
      stock_sku_preview: {
        Args: { p_brand?: string; p_brand_code?: string }
        Returns: string
      }
    }
    Enums: {
      category_kind: "income" | "expense"
      item_condition: "new" | "used_good" | "flawed"
      stock_status: "in_stock" | "partial" | "sold"
      transaction_type: "income" | "expense"
      wallet_type: "cash" | "bank" | "promptpay"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      category_kind: ["income", "expense"],
      item_condition: ["new", "used_good", "flawed"],
      stock_status: ["in_stock", "partial", "sold"],
      transaction_type: ["income", "expense"],
      wallet_type: ["cash", "bank", "promptpay"],
    },
  },
} as const
