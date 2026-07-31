import { lockedRowInfo } from '@/lib/ledger'

/**
 * ฟิลด์ที่ต้องมีเพื่อคืนแถวกลับได้เหมือนเดิม — โครงสร้างล้วน ไม่ผูกกับ EditableTx
 * (lib/ เดินทางเดียว ห้าม import จาก hooks/ · §3). id + created_at ต้องเป็นชุดเดิม:
 * id เดิม → กดเลิกทำซ้ำจะชน PK แทนที่จะได้แถวซ้ำเงียบ ๆ · created_at เดิม → แถว
 * กลับไปอยู่ตำแหน่งเดิมใน "รายการล่าสุด" ไม่เด้งขึ้นบนสุด.
 */
export interface RestorableTx {
  id: string
  type: 'income' | 'expense'
  amount: number
  category_id: string | null
  wallet_id: string | null
  date: string
  note: string | null
  created_at: string
  is_stock_purchase: boolean
  is_stock_cogs: boolean
  is_debt_settlement: boolean
  stock_item_id: string | null
}

/** payload สำหรับ insert คืนแถว — subset ที่จำเป็น ปล่อย flag/stock_item_id ให้ default. */
export interface RestoreInsert {
  id: string
  user_id: string
  type: 'income' | 'expense'
  amount: number
  category_id: string | null
  wallet_id: string | null
  date: string
  note: string | null
  created_at: string
}

/**
 * สร้าง payload สำหรับ insert คืนแถวที่เพิ่งถูกลบ.
 *
 * โยน error ถ้า snapshot เป็นแถวที่ล็อก (ซื้อเข้าสต็อก / ขายสต็อก / เคลียร์ยอดค้าง) —
 * แถวพวกนั้นผูกกับ stock_sales/debts การ insert กลับตรง ๆ จะได้ transaction กำพร้า
 * ที่ไม่ผูกกับอะไร = เงินผิดที่ไม่มีอะไรจับได้ ต้องย้อนผ่าน RPC ของมันเอง (§5).
 * guard นี้อยู่ที่ชั้นข้อมูล ไม่พึ่งว่า UI ไม่เรียก · ใช้ lockedRowInfo() ที่เดียว
 * ที่ตัดสินว่าแถวไหนล็อก (convention 10) ไม่เขียนเงื่อนไข flag ซ้ำเอง.
 *
 * ไม่ใส่ flag ทั้งสามและ stock_item_id ลง payload: guard รับประกันแล้วว่าทั้งหมด
 * เป็น false/null ปล่อยให้ default ของ DB จัดการ (ใส่ไปมีแต่จะเปิดช่องให้พลาด).
 */
export function buildRestoreInsert(snap: RestorableTx, userId: string): RestoreInsert {
  if (lockedRowInfo(snap) !== null) {
    throw new Error('แถวนี้ย้อนไม่ได้ตรงนี้ — ต้องย้อนผ่านหน้าคลังหรือหน้ายอดค้าง')
  }
  return {
    id: snap.id,
    user_id: userId,
    type: snap.type,
    amount: snap.amount,
    category_id: snap.category_id,
    wallet_id: snap.wallet_id,
    date: snap.date,
    note: snap.note,
    created_at: snap.created_at,
  }
}
