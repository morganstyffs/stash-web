-- ============================================================================
-- Stash — reset_test_data.sql   (ชุดข้อมูลทดสอบ · ใบ TESTDATA)
--
-- ล้างข้อมูล "ที่ผู้ใช้สร้าง" ของ 2 บัญชีที่ระบุ ให้ว่างพอสำหรับรัน seed ใหม่
-- โดย **ไม่แตะ** โครงบัญชี (auth.users / profiles / wallets / categories /
-- stock_sku_config) — ตารางพวกนั้นสร้างครั้งเดียวตอนสมัคร กู้ไม่ได้ถ้าลบ
-- (ไม่มี insert policy / มาจาก trigger) จึงแค่ "รีเซ็ตค่า" ไม่ใช่ "ลบแถว"
--
-- 🔴 ไฟล์นี้ไม่ใช่ migration — อยู่ใน supabase/seeds/ ไม่ใช่ supabase/migrations/
--    ห้าม insert แถวลง schema_migrations · ห้ามนับเป็นเลข migration
--
-- ── ทำไมรันในฐานะ owner (ไม่ impersonate) ────────────────────────────────────
--   debts / stock_sales / friend_connections / debt_events **ไม่มี delete policy**
--   → บทบาท authenticated ลบไม่ได้เลย (RLS บล็อก) · ต้องเป็น owner ที่ BYPASS RLS
--   ต่างจาก seed/verify ที่ต้อง impersonate เพื่อพิสูจน์ว่า RLS ยอมให้ "เขียน/อ่าน"
--   ได้จริง — การลบเป็นงานดูแลระบบ ไม่ใช่สิ่งที่แอปทำผ่าน RLS จึงใช้ owner ถูกต้อง
--
-- ── ทำไมลำดับการลบเป็นแบบนี้ (พิสูจน์จากไฟล์ migration จริง ไม่เดา) ─────────────
--   • transactions มี trigger กันลบ 2 ตัว:
--       - stock_sale_txn_guard (0012): บล็อก DELETE ถ้ามีแถวใน stock_sales อ้าง
--         transaction นั้น (sale_transaction_id หรือ cogs_transaction_id)
--       - debt_settlement_txn_guard (0015): บล็อก DELETE ถ้ามีแถวใน debts อ้าง
--         transaction นั้น (settlement_transaction_id)
--     ทั้งคู่เช็ค "การมีอยู่ของแถวอ้างอิง" ไม่ใช่ flag → ลบ stock_sales กับ debts
--     "ก่อน" แล้ว trigger ก็ปล่อยผ่านเอง · ไม่ต้อง disable trigger (การปิด trigger
--     ในฐานข้อมูลจริงคือการเปลี่ยนพฤติกรรมที่อาจลืมเปิดกลับ — ห้ามทำ)
--   • cross-FK ระหว่าง transactions.stock_item_id ↔ stock_items.source_transaction_id
--     เป็น ON DELETE SET NULL ทั้งคู่ (0001) → ไม่มี circular restrict ลบสลับกันได้
--   • stock_sales.stock_item_id เป็น ON DELETE RESTRICT (0001) → ต้องลบ stock_sales
--     ก่อน stock_items
--   • debt_events.debt_id เป็น ON DELETE CASCADE (0015) → ลบ debts แล้ว debt_events
--     หายเอง ไม่ต้องลบแยก
--   • categories มี system_category_no_delete (0012) กันลบหมวดระบบ → เราไม่ลบหมวดเลย
--
-- ── PRE-FLIGHT (รันดูก่อน แล้วค่อยรันบล็อกล่าง) ──────────────────────────────
--   -- 1) ยืนยันตัวตน 2 บัญชี (ก๊อป uid ไปกรอกในบล็อก DO ด้านล่าง):
--   --    select id, email from auth.users order by created_at;
--   -- 2) นับแถวปัจจุบันของ 2 บัญชี (คาดว่าจะลดเหลือ 0 หลัง reset):
--   --    select 'transactions' t, count(*) from public.transactions
--   --      where user_id in ('<ME>','<FRIEND>')
--   --    union all select 'stock_items', count(*) from public.stock_items
--   --      where user_id in ('<ME>','<FRIEND>')
--   --    union all select 'debts', count(*) from public.debts
--   --      where created_by in ('<ME>','<FRIEND>');
--   -- 3) เลข migration ล่าสุด (ไฟล์นี้ต้องไม่ทำให้มันขยับ):
--   --    select max(version) from public.schema_migrations;   -- คาด 0030
--
-- ⚠️⚠️ รอบแรกให้จบบล็อกด้วย  rollback;  เพื่อดูผล (แถว "หลังลบ" ต้องเป็น 0)
--      พอใจแล้วค่อยเปลี่ยนบรรทัดสุดท้ายเป็น  commit;  แล้วรันซ้ำ ⚠️⚠️
-- ============================================================================

begin;

do $$
declare
  -- ⬇️⬇️ กรอก uid 2 บัญชีเอง (จาก PRE-FLIGHT ข้อ 1) — ห้ามใช้ limit 1 เลือกให้
  --      เพราะ DB มีหลายบัญชี การเดาอาจล้างบัญชีผิดตัว
  v_me     uuid := '00000000-0000-0000-0000-000000000000';   -- ← uid ตัวเอง
  v_friend uuid := '11111111-1111-1111-1111-111111111111';   -- ← uid เพื่อน (คู่หนี้ shared)
  v_uids   uuid[];
begin
  -- ── ตรวจ uid: "มีอยู่จริงใน auth.users" ไม่ใช่ "เทียบกับค่าตัวอย่าง" ──────────
  --   🔴 เคยเกิดจริง: กรอก uid ด้วย find-replace ทั้งไฟล์ → ค่าตัวอย่างในเงื่อนไข
  --      (00000000-… / 11111111-…) ถูกแทนไปด้วย กลายเป็น `if v_me = v_me` ซึ่งจริง
  --      เสมอ → raise ทุกครั้งทั้งที่กรอกถูก เสียเวลาไล่หาสาเหตุ · วิธี not exists นี้
  --      ทน find-replace และยังจับ uid ที่พิมพ์ผิด/ไม่มีบัญชีได้ด้วย (ของเดิมจับไม่ได้)
  --      ⛔ ห้ามแก้กลับไปเทียบกับค่าตัวอย่าง · reset ลบข้อมูลจริง uid ผิด = ล้างผิดบัญชี
  if not exists (select 1 from auth.users where id = v_me) then
    raise exception 'ไม่พบ v_me (%) ใน auth.users — กรอก uid แล้วหรือยัง / uid ผิดหรือเปล่า', v_me;
  end if;
  if not exists (select 1 from auth.users where id = v_friend) then
    raise exception 'ไม่พบ v_friend (%) ใน auth.users — กรอก uid แล้วหรือยัง / uid ผิดหรือเปล่า', v_friend;
  end if;
  if v_me = v_friend then
    raise exception 'v_me กับ v_friend ต้องเป็นคนละบัญชี';
  end if;
  v_uids := array[v_me, v_friend];

  -- ── ลำดับการลบ (ตามเหตุผลหัวไฟล์) ────────────────────────────────────────
  -- 1) การโอนระหว่างกระเป๋า — FK → wallets เป็น restrict แต่เราลบ "transfers"
  --    ไม่ได้ลบ wallets จึงผ่าน
  delete from public.wallet_transfers where user_id = any(v_uids);

  -- 2) หนี้ — ลบก่อน transactions เพื่อปลด debt_settlement_txn_guard
  --    (debts ไม่มีคอลัมน์ user_id → กรองด้วย created_by/creditor_id/debtor_id)
  --    debt_events หายเองผ่าน ON DELETE CASCADE
  delete from public.debts
    where created_by = any(v_uids)
       or creditor_id = any(v_uids)
       or debtor_id = any(v_uids);

  -- 3) การขายสต็อก — ลบก่อน stock_items (FK restrict) และก่อน transactions
  --    (ปลด stock_sale_txn_guard)
  delete from public.stock_sales where user_id = any(v_uids);

  -- 4) สินค้าในคลัง — ตอนนี้ไม่มี stock_sales อ้างแล้ว · transactions.stock_item_id
  --    จะถูก SET NULL อัตโนมัติ
  delete from public.stock_items where user_id = any(v_uids);

  -- 5) transactions — guard ทั้งสองปล่อยผ่านแล้ว (ไม่มี stock_sales/debts อ้าง)
  delete from public.transactions where user_id = any(v_uids);

  -- 6) งบ/รายการประจำ/รายการโปรด
  delete from public.budgets   where user_id = any(v_uids);
  delete from public.recurring where user_id = any(v_uids);
  delete from public.favorites where user_id = any(v_uids);

  -- 7) ความเป็นเพื่อน (เพื่อให้ seed สร้าง connection ใหม่แบบ accepted ได้สะอาด)
  delete from public.friend_connections
    where requester_id = any(v_uids) or addressee_id = any(v_uids);

  -- ── รีเซ็ต "ค่า" ของตารางที่ห้ามลบแถว (ไม่ใช่ลบ) ─────────────────────────
  -- opening_balance กลับเป็น 0 · next_seq กลับเป็น 0 (SKU เริ่มใหม่)
  update public.wallets set opening_balance = 0 where user_id = any(v_uids);
  update public.stock_sku_config set next_seq = 0 where user_id = any(v_uids);

  -- เก็บ uid ไว้ให้ SELECT ตรวจผลข้างล่างใช้ต่อ → เจ้าของกรอก uid "ที่เดียว" (ในนี้)
  drop table if exists _cfg;
  create temp table _cfg as select v_me as me, v_friend as friend;

  raise notice 'reset เสร็จสำหรับ % บัญชี', array_length(v_uids, 1);
end $$;

-- ── ตรวจผล: ทุกตารางของ 2 บัญชีต้องเหลือ 0 แถว (แสดงเป็น result set) ──────────
-- อ่าน uid จาก _cfg (ไม่ต้องกรอกซ้ำ)
select 'transactions'     as table_name, count(*) as remaining from public.transactions where user_id in (select me from _cfg) or user_id in (select friend from _cfg)
union all select 'stock_items',      count(*) from public.stock_items      where user_id in (select me from _cfg) or user_id in (select friend from _cfg)
union all select 'stock_sales',      count(*) from public.stock_sales      where user_id in (select me from _cfg) or user_id in (select friend from _cfg)
union all select 'wallet_transfers', count(*) from public.wallet_transfers where user_id in (select me from _cfg) or user_id in (select friend from _cfg)
union all select 'budgets',          count(*) from public.budgets          where user_id in (select me from _cfg) or user_id in (select friend from _cfg)
union all select 'recurring',        count(*) from public.recurring        where user_id in (select me from _cfg) or user_id in (select friend from _cfg)
union all select 'debts (by created_by)', count(*) from public.debts       where created_by in (select me from _cfg) or created_by in (select friend from _cfg)
order by table_name;

-- ⚠️ รอบแรก: rollback;  (ดูผลก่อน)   ·   พอใจแล้วเปลี่ยนเป็น commit; รันซ้ำ
rollback;
