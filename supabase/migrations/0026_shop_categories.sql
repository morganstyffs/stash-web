-- ============================================================================
-- Stash — 0026_shop_categories
--
-- ถังที่ 2 ของบัญชีร้าน: "ค่าดำเนินร้าน" (ค่าส่ง · บรรจุภัณฑ์ · ค่าธรรมเนียมขาย ·
-- การตลาด · และค่าส่งที่เก็บจากลูกค้าฝั่งรายรับ) — เป็นก้อนรายเดือน ห้ามเกลี่ยลง
-- รายชิ้น · ใบนี้แค่ "ทำให้ระบบรู้ว่ารายการไหนอยู่ในถังที่ 2" · หน้าสรุปกำไรสุทธิ
-- อยู่ PR-T2
--
-- ── ทำไมต้องมีทั้งป้าย (บนหมวด) และธง (บนตัวรายการ) ─────────────────────────
-- ธงเดิมทุกตัว (is_stock_purchase / is_stock_cogs / is_debt_settlement) ถูกเขียน
-- ลง "ตัวรายการ" ตอนบันทึกแล้วอยู่นิ่ง → predicate ใน lib/ledger.ts เป็น pure
-- ไม่ต้อง join หมวด · ถ้าปล่อยให้ "ค่าดำเนินร้าน" อยู่บนหมวดอย่างเดียว ทุกจุดที่
-- คิดเงินต้อง resolve หมวดเองทุกครั้ง จุดไหนลืม = ตัวเลขผิดเงียบ ๆ (รูปแบบบั๊กที่
-- โปรเจกต์นี้เจอซ้ำ) · ทางออก: ผู้ใช้ติดป้ายที่หมวด → DB คัดลอกลงตัวรายการให้
-- อัตโนมัติ → ตัวคำนวณอ่านจากตัวรายการเหมือนธงอื่นทุกตัว
--   ป้าย (ผู้ใช้กด)     : categories.is_shop_category   — ผู้ใช้ ผ่านหน้าตั้งค่า
--   ธง (ตัวคำนวณอ่าน)  : transactions.is_shop_operating — DB trigger เท่านั้น
-- ชื่อสองตัวต่างกันโดยตั้งใจ อ่านโค้ดแล้วรู้ทันทีว่าพูดถึงอันไหน
--
-- ── ทำไมเปลี่ยนป้ายแล้วตัวเลขเดือนเก่าขยับ (ยอมรับโดยตั้งใจ) ─────────────────
-- SECTION 4 ไล่อัปเดต transactions.is_shop_operating ของรายการเก่าให้ตรงป้าย
-- ปัจจุบันเสมอ → กติกาทุกเดือนคิดด้วยกฎเดียวกัน ไม่มี snapshot ต่อแถวเหมือน
-- cost_at_sale · หน้าจอ (CategoriesManager) เตือนผู้ใช้เรื่องนี้ไว้แล้ว
--
-- ── ทำไม trigger ใหม่ไม่ชนกับ guard เดิมบน transactions ────────────────────
-- guard เดิม (stock_sale_txn_guard / debt_settlement_txn_guard) เป็น BEFORE
-- UPDATE OR DELETE · ตัวใหม่ set_txn_shop_operating เป็น BEFORE INSERT OR UPDATE
-- แตะแค่ NEW.is_shop_operating ซึ่งไม่ใช่ฟิลด์ที่ guard หวง (guard เช็ค amount/
-- type/date/stock_item_id/is_stock_cogs เท่านั้น) · และหมวดที่ติดป้ายร้านได้ต้อง
-- ไม่ใช่ system/stock (CHECK ข้างล่าง) → ตัวรายการในหมวดร้านจึงไม่เคยเป็นแถวที่
-- ถูกล็อก → SECTION 4 update ไม่มีทางไปสะกิด guard ให้ raise
--
-- ── VERIFICATION (รันหลัง apply ใน begin;…rollback; แทน <user_id>) ──────────
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<user_id>","role":"authenticated"}';
--   -- (ก) ติดป้ายให้หมวดหนึ่ง แล้วรายการเก่าของหมวดนั้นต้องเปลี่ยนตาม
--   update public.categories set is_shop_category = true
--    where user_id = '<user_id>' and name = 'เดินทาง';
--   select count(*) filter (where is_shop_operating) as flagged, count(*) as total
--     from public.transactions
--    where user_id = '<user_id>'
--      and category_id = (select id from public.categories
--                          where user_id = '<user_id>' and name = 'เดินทาง');
--   -- PASS: flagged = total
--   -- (ข) ถอดป้ายแล้วต้องกลับเป็น false ทั้งหมด
--   update public.categories set is_shop_category = false
--    where user_id = '<user_id>' and name = 'เดินทาง';
--   -- flagged กลับเป็น 0
--   -- (ค) ติดป้ายให้หมวดระบบต้องไม่ผ่าน (PASS: ERROR 23514)
--   update public.categories set is_shop_category = true
--    where user_id = '<user_id>' and system_key = 'stock_cogs';
--   rollback;
-- ============================================================================
begin;


-- ===========================================================================
-- SECTION 1 — คอลัมน์ใหม่
--   is_shop_category   : ป้ายบนหมวด (ผู้ใช้ติด/ถอด)
--   is_shop_operating  : ธงบนตัวรายการ (derived — เขียนโดย trigger เท่านั้น)
-- ทั้งคู่ not null default false → ปลอดภัยกับแถวเดิม (เริ่มที่ false ทั้งหมด)
-- ===========================================================================
alter table public.categories
  add column if not exists is_shop_category boolean not null default false;

alter table public.transactions
  add column if not exists is_shop_operating boolean not null default false;


-- ===========================================================================
-- SECTION 2 — CHECK: กันการติดป้ายผิดตั้งแต่ต้นทาง
-- หมวดระบบ (stock_cogs / stock_sale_income / debt_repayment_*) คือถังที่ 1 หรือ
-- ยอดค้าง ไม่ใช่ค่าดำเนินร้าน · หมวดซื้อของเข้าสต็อกก็ไม่ใช่ (เป็นการเปลี่ยนเงิน
-- เป็นของ) — ทั้งสองกลุ่มติดป้ายร้านไม่ได้
-- ===========================================================================
alter table public.categories
  drop constraint if exists categories_shop_flag_check;
alter table public.categories
  add constraint categories_shop_flag_check
  check (not (is_shop_category and (is_system or is_stock_category)));


-- ===========================================================================
-- SECTION 3 — Trigger 1: คัดลอกป้ายลงตัวรายการ
-- BEFORE INSERT OR UPDATE บน transactions · เขียน NEW.is_shop_operating จาก
-- is_shop_category ของหมวดแถวนั้น · category_id เป็น null → false · บังคับเสมอ
-- ไม่ว่า client ส่งค่าอะไรมา (ธงนี้ derive ล้วน client เขียนเองไม่ได้)
-- SECURITY DEFINER + search_path='' — อ่าน categories ของ user เดียวกันได้เสมอ
-- ===========================================================================
create or replace function public.set_txn_shop_operating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop boolean;
begin
  if new.category_id is not null then
    select c.is_shop_category
      into v_shop
      from public.categories c
     where c.id = new.category_id;
  end if;
  -- not found หรือไม่มีหมวด → false เสมอ
  new.is_shop_operating := coalesce(v_shop, false);
  return new;
end;
$$;

drop trigger if exists set_txn_shop_operating on public.transactions;
create trigger set_txn_shop_operating
  before insert or update on public.transactions
  for each row execute function public.set_txn_shop_operating();


-- ===========================================================================
-- SECTION 4 — Trigger 2: ติด/ถอดป้ายแล้วไล่อัปเดตรายการเก่า
-- AFTER UPDATE OF is_shop_category บน categories · ยิงเฉพาะตอนป้ายเปลี่ยนจริง
-- (when-clause) · นี่คือสิ่งที่ทำให้ตัวเลขเดือนเก่าขยับตาม — ตั้งใจ
-- SECURITY DEFINER + search_path='' · UPDATE นี้จะยิง set_txn_shop_operating
-- (SECTION 3) ต่อทุกแถว → ได้ค่าเดียวกัน (idempotent) และไม่สะกิด guard เพราะ
-- หมวดร้านไม่มีแถวที่ถูกล็อก (ดูหัวไฟล์)
-- ===========================================================================
create or replace function public.sync_shop_operating_on_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.transactions t
     set is_shop_operating = new.is_shop_category
   where t.category_id = new.id
     and t.user_id = new.user_id
     and t.is_shop_operating is distinct from new.is_shop_category;
  return null;
end;
$$;

drop trigger if exists sync_shop_operating_on_category on public.categories;
create trigger sync_shop_operating_on_category
  after update of is_shop_category on public.categories
  for each row
  when (old.is_shop_category is distinct from new.is_shop_category)
  execute function public.sync_shop_operating_on_category();


-- ===========================================================================
-- SECTION 5 — Backfill: sync ค่าปัจจุบันหนึ่งรอบ
-- ตอนนี้ยังไม่มีหมวดไหนติดป้าย → ผลคือ false ทั้งหมด (เท่ากับ default) แต่เขียน
-- ไว้ให้ถูกต้อง/idempotent · แถว category_id null default false อยู่แล้ว
-- ===========================================================================
update public.transactions t
   set is_shop_operating = coalesce(c.is_shop_category, false)
  from public.categories c
 where t.category_id = c.id
   and t.is_shop_operating is distinct from coalesce(c.is_shop_category, false);


-- ===========================================================================
-- SECTION 6 — seed_defaults_internal: reproduced ทั้งดุ้นจาก 0017 SECTION 2
-- (convention 3 — 0017 เป็นเวอร์ชันล่าสุด) · เปลี่ยนเฉพาะ:
--   • เพิ่มคอลัมน์ is_shop_category ในทั้งสอง insert (แถวเดิมทั้ง 13 = false)
--   • เพิ่มหมวดร้าน 5 ตัว (is_shop_category=true, is_system=false → ลบ/แก้ได้)
-- Signature เดิม (uuid) → create or replace แทนที่ในที่ · seed ใช้กับ user ใหม่
-- เท่านั้น (ไม่แตะ user เดิม — เจ้าของเติมเองผ่าน SQL ใน PR description)
-- color_index วน 1–6 ต่อจากลำดับเดิม · sort_order ต่อท้ายกลุ่มของ kind นั้น
-- ===========================================================================
create or replace function public.seed_defaults_internal(uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_name  text;
begin
  if exists (select 1 from public.categories where user_id = uid) then
    return;
  end if;

  insert into public.wallets (user_id, name, type) values
    (uid, 'เงินสด',   'cash'),
    (uid, 'ธนาคาร',    'bank'),
    (uid, 'พร้อมเพย์', 'promptpay');

  insert into public.categories
    (user_id, name, kind, is_stock_category, is_shop_category, is_system, system_key, icon, color_index, sort_order) values
    (uid, 'อาหาร',            'expense', false, false, false, null,                     'coffee',        1,  10),
    (uid, 'เดินทาง',          'expense', false, false, false, null,                     'motorbike',     2,  20),
    (uid, 'ช้อปปิ้ง',          'expense', false, false, false, null,                     'shopping-bag',  3,  30),
    (uid, 'บิล/ค่าบ้าน',      'expense', false, false, false, null,                     'bolt',          4,  40),
    (uid, 'บันเทิง',          'expense', false, false, false, null,                     'device-tv',     5,  50),
    (uid, 'เสื้อเข้าร้าน',      'expense', true,  false, false, null,                     'shirt',         6,  60),
    (uid, 'รองเท้าเข้าร้าน',    'expense', true,  false, false, null,                     'shoe',          1,  70),
    (uid, 'ต้นทุนขายสต็อก',    'expense', false, false, true,  'stock_cogs',             'receipt-2',     2,  80),
    (uid, 'จ่ายคืนเพื่อน',      'expense', false, false, true,  'debt_repayment_expense', 'arrow-up-right',3,  90),
    -- หมวดร้าน (ถังที่ 2 — ค่าดำเนินร้าน)
    (uid, 'ค่าส่ง',            'expense', false, true,  false, null,                     'bus',           4, 100),
    (uid, 'บรรจุภัณฑ์',        'expense', false, true,  false, null,                     'box',           5, 110),
    (uid, 'ค่าธรรมเนียมขาย',   'expense', false, true,  false, null,                     'tag',           6, 120),
    (uid, 'การตลาด',          'expense', false, true,  false, null,                     'device-tv',     1, 130);

  insert into public.categories
    (user_id, name, kind, is_stock_category, is_shop_category, is_system, system_key, icon, color_index, sort_order) values
    (uid, 'เงินเดือน',          'income', false, false, false, null,                     'cash',            4, 10),
    (uid, 'ฟรีแลนซ์',           'income', false, false, false, null,                     'briefcase',       5, 20),
    (uid, 'ขายสต็อก',           'income', false, false, true,  'stock_sale_income',      'box',             6, 30),
    (uid, 'ได้รับคืนจากเพื่อน',   'income', false, false, true,  'debt_repayment_income',  'arrow-down-left', 1, 40),
    -- หมวดร้าน ฝั่งรายรับ (ค่าส่งที่เก็บจากลูกค้า)
    (uid, 'ค่าส่งที่เก็บจากลูกค้า', 'income', false, true,  false, null,                    'cash',            2, 50);

  insert into public.stock_sku_config (user_id) values (uid)
  on conflict (user_id) do nothing;

  select email into v_email from auth.users where id = uid;
  v_name := coalesce(nullif(split_part(coalesce(v_email, ''), '@', 1), ''), 'ผู้ใช้');
  insert into public.profiles (user_id, display_name, friend_code)
  values (uid, v_name, public.generate_friend_code())
  on conflict (user_id) do nothing;
end;
$$;


-- ===========================================================================
-- SECTION 7 — bookkeeping  (โครงเดียวกับท้ายไฟล์ 0025)
-- ===========================================================================
insert into public.schema_migrations (version) values ('0026')
on conflict do nothing;

notify pgrst, 'reload schema';

commit;
