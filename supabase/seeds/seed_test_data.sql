-- ============================================================================
-- Stash — seed_test_data.sql   (ชุดข้อมูลทดสอบที่รู้คำตอบล่วงหน้า · ใบ TESTDATA)
--
-- เติมข้อมูลการเงิน 4 เดือนให้บัญชีทดสอบ โดย "ทุกค่าเขียนตายตัว" (ไม่สุ่ม) เพื่อให้
-- ทุกใบปรับแต่ง AI หลังจากนี้มีฐานเทียบเดียวกัน · ค่าคาดหวังทั้งหมดอยู่ใน
-- docs/testing/expected-answers.md และพิสูจน์อัตโนมัติได้ที่ verify_test_data.sql
--
-- 🔴 ไม่ใช่ migration (อยู่ใน seeds/) · ห้าม insert ลง schema_migrations
--
-- ── ยึด anchor = วันแรกของเดือนปัจจุบันเวลาไทย (ไม่ใช่วันที่ตายตัว) ────────────
--   รันเมื่อไหร่ก็ได้โครงเดียวกัน · offset ตรงกับที่ AI ใช้ (0=เดือนนี้ -1 -2 -3)
--
-- ── ทำไมต้อง impersonate (ลอกแพทเทิร์นจากหัวไฟล์ 0030 — ไม่ประดิษฐ์วิธีที่สาม) ─
--   RPC สต็อก/โอน เป็น SECURITY INVOKER → ถ้าไม่สลับ role เป็น authenticated
--   auth.uid() จะเป็น null แล้ว RLS บล็อก · owner ที่รัน SQL Editor BYPASS RLS
--   จึงต้อง set request.jwt.claims + set role authenticated เพื่อให้ auth.uid()
--   คืน uid จริง และพิสูจน์ว่า RLS "ยอมให้เขียน" ได้จริง
--   หนี้ shared ต้อง impersonate 2 ฝั่ง (ฝั่งสร้าง = v_me · ฝั่งยืนยัน = v_friend)
--
-- ── ทำไมต้องผ่าน RPC ไม่ใช่ insert ตรง (การขาย/รับเข้า/หนี้) ───────────────────
--   stock_sale_create เขียน 2 แถว (income + COGS wallet=null) + ล็อก + qty_remaining
--   stock_intake_create เขียน expense is_stock_purchase + สร้าง stock_item + SKU
--   debt_* เป็น DEFINER คุม lifecycle/สถานะ · insert เองจะพลาด flag ที่สูตรงบใช้จริง
--
-- ── 🔴 case ขอบเดือน (case #6) ต้อง UPDATE created_at เอง ─────────────────────
--   stock_intake_create ตั้ง stock_items.created_at = now() (เวลารัน = เดือนนี้)
--   เสมอ → ของที่อยากให้เป็นเดือน -2/-3 ต้อง UPDATE created_at หลังเรียก RPC
--   และของ "ขอบเดือน" ตั้งเป็นวันแรกของเดือนนี้ 00:30 เวลาไทย (= 17:30 UTC วันก่อน)
--   เพื่อทดสอบว่า stock_intake_list นับเป็น "เดือนนี้" ตามเวลาไทย ไม่ใช่ UTC
--
-- ── PRE-FLIGHT (รันก่อน) ─────────────────────────────────────────────────────
--   -- select id, email from auth.users order by created_at;   -- เอา uid ไปกรอก
--   -- select max(version) from public.schema_migrations;       -- คาด 0030
--   -- ต้องรัน reset_test_data.sql (commit) ให้ 2 บัญชีว่างก่อน
--
-- ⚠️⚠️ รอบแรกจบด้วย rollback; (ดูผล/เช็ค error) · พอใจแล้วเปลี่ยนเป็น commit; ⚠️⚠️
-- ============================================================================

begin;

do $$
declare
  v_owner  text := current_user;            -- role เดิม (bypass RLS) — ไว้สลับกลับ
  -- ⬇️⬇️ กรอก uid 2 บัญชีเอง (ห้าม limit 1 เลือกให้ — DB มีหลายบัญชี)
  v_me     uuid := '00000000-0000-0000-0000-000000000000';   -- ← uid ตัวเอง
  v_friend uuid := '11111111-1111-1111-1111-111111111111';   -- ← uid เพื่อน

  -- anchor เดือน (เวลาไทย)
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_m0    date;   -- วันแรกเดือนนี้
  v_m1    date;   -- เดือนที่แล้ว
  v_m2    date;   -- สองเดือนก่อน
  v_m3    date;   -- สามเดือนก่อน
  v_boundary timestamptz;   -- วันแรกเดือนนี้ 00:30 +07 (ขอบเดือนเวลาไทย)

  -- กระเป๋า/หมวด ของ v_me
  v_w_cash uuid; v_w_bank uuid; v_w_pp uuid;
  v_c_salary uuid; v_c_food uuid; v_c_travel uuid; v_c_shop uuid;
  v_c_bill uuid; v_c_fun uuid; v_c_pet uuid; v_c_stock uuid;

  -- สินค้า + transaction ที่รับเข้า (ต้องเก็บ id ไว้ตั้งเดือน/ขายทีหลัง)
  v_item_a uuid; v_tx_a uuid;   -- รองเท้า A (M-2, ก้อนใหญ่, ขายกำไร)
  v_item_b uuid; v_tx_b uuid;   -- เสื้อ B   (M-2, ขายขาดทุน)
  v_item_c uuid; v_tx_c uuid;   -- กระเป๋า C (M-3, ค้าง >60 วัน)
  v_item_d uuid; v_tx_d uuid;   -- หมวก D    (M-3, ค้าง >60 วัน)
  v_item_e uuid; v_tx_e uuid;   -- รองเท้าใหม่ E (M0 ขอบเดือน, ของใหม่ ไม่ค้าง)

  -- หนี้
  v_d1 uuid; v_d2 uuid; v_d3 uuid; v_d4 uuid; v_d5 uuid;

  -- รวมชื่อกระเป๋า/หมวดที่ lookup ไม่เจอ เพื่อ raise ทีเดียว (ดู guard §1.9)
  v_missing text[] := '{}';
begin
  ------------------------------------------------------------------------------
  -- 0) PRE-FLIGHT บังคับ
  ------------------------------------------------------------------------------
  if v_me = '00000000-0000-0000-0000-000000000000'
     or v_friend = '11111111-1111-1111-1111-111111111111' then
    raise exception 'ยังไม่ได้กรอก uid จริง — แก้ v_me / v_friend ก่อนรัน';
  end if;
  if v_me = v_friend then raise exception 'v_me กับ v_friend ต้องคนละบัญชี'; end if;
  if not exists (select 1 from auth.users where id = v_me) then
    raise exception 'ไม่พบ v_me (%) ใน auth.users', v_me; end if;
  if not exists (select 1 from auth.users where id = v_friend) then
    raise exception 'ไม่พบ v_friend (%) ใน auth.users', v_friend; end if;

  -- วันนี้ต้อง >= 5: เดือนปัจจุบันต้องมีที่ว่างให้วางรายการวันที่ 1-4 ได้เสมอ
  -- โดยไม่มีรายการ "วันในอนาคต" (จะทำให้ยอด/วันเหลืออ่านยาก และ wallet_transfer
  -- ปฏิเสธวันอนาคตอยู่แล้ว) — ดู §3.2
  if extract(day from v_today)::int < 5 then
    raise exception 'ต้องรันในวันที่ >= 5 ของเดือน (วันนี้ = %) — รอสักครู่แล้วรันใหม่', v_today;
  end if;

  v_m0 := date_trunc('month', v_today)::date;
  v_m1 := (v_m0 - interval '1 month')::date;
  v_m2 := (v_m0 - interval '2 month')::date;
  v_m3 := (v_m0 - interval '3 month')::date;
  -- วันแรกของเดือนนี้ เวลา 00:30 ตามเวลาไทย (+07) → 17:30 UTC ของวันก่อนหน้า
  v_boundary := (to_char(v_m0, 'YYYY-MM-DD') || ' 00:30:00+07')::timestamptz;

  ------------------------------------------------------------------------------
  -- 1) เตรียมของที่ต้องใช้ owner (ไม่ผ่าน RLS) ก่อน impersonate
  --    - opening_balance: ตั้งค่าที่ผู้ใช้ "กรอกครั้งเดียว" (case #3 อาศัยค่านี้)
  --    - next_seq = 0: ให้ SKU เริ่มนับใหม่สะอาด
  --    - หมวด "อาหารสัตว์": หมวดชื่อใกล้ "อาหาร" (case #7 resolveCategory ต้องถามกลับ)
  --    - friend_connection accepted: หนี้ shared ต้องมีความเป็นเพื่อนที่ยอมรับแล้ว
  ------------------------------------------------------------------------------
  update public.wallets
     set opening_balance = case name
           when 'เงินสด'   then 15000
           when 'ธนาคาร'   then 20000
           when 'พร้อมเพย์' then 500
           else 0 end
   where user_id = v_me;
  update public.stock_sku_config set next_seq = 0 where user_id in (v_me, v_friend);

  insert into public.categories (user_id, name, kind, sort_order, icon)
  select v_me, 'อาหารสัตว์', 'expense'::public.category_kind, 25, 'paw'
  where not exists (
    select 1 from public.categories where user_id = v_me and name = 'อาหารสัตว์');

  -- ความเป็นเพื่อน (reset ลบให้แล้ว; สร้างใหม่แบบ accepted โดยตรงในฐานะ owner —
  -- friend_connections ไม่มี insert policy ตรง ๆ ใช้ owner สร้าง state ที่ต้องการ)
  delete from public.friend_connections
    where (requester_id = v_me and addressee_id = v_friend)
       or (requester_id = v_friend and addressee_id = v_me);
  insert into public.friend_connections (requester_id, addressee_id, status, responded_at)
  values (v_me, v_friend, 'accepted'::public.friend_status, now());

  -- lookup id (owner อ่านได้ทุกแถว) — เก็บไว้ใช้ตอน impersonate
  select id into v_w_cash from public.wallets where user_id = v_me and name = 'เงินสด';
  select id into v_w_bank from public.wallets where user_id = v_me and name = 'ธนาคาร';
  select id into v_w_pp   from public.wallets where user_id = v_me and name = 'พร้อมเพย์';
  select id into v_c_salary from public.categories where user_id = v_me and name = 'เงินเดือน';
  select id into v_c_food   from public.categories where user_id = v_me and name = 'อาหาร' and kind = 'expense';
  select id into v_c_travel from public.categories where user_id = v_me and name = 'เดินทาง';
  select id into v_c_shop   from public.categories where user_id = v_me and name = 'ช้อปปิ้ง';
  select id into v_c_bill   from public.categories where user_id = v_me and name = 'บิล/ค่าบ้าน';
  select id into v_c_fun    from public.categories where user_id = v_me and name = 'บันเทิง';
  select id into v_c_pet    from public.categories where user_id = v_me and name = 'อาหารสัตว์';
  select id into v_c_stock  from public.categories where user_id = v_me and name = 'เสื้อเข้าร้าน';

  ------------------------------------------------------------------------------
  -- 1.9) 🔴 NULL GUARD ครบทุกตัว (กระเป๋า 3 + หมวดทุกตัวที่ §2 ใช้จริง)
  --      รายงาน "ทุกชื่อที่หาไม่เจอในครั้งเดียว" ไม่หยุดที่ตัวแรก — เจ้าของแก้รวดเดียว
  --
  -- ── เคยเกิดจริง (ใบ 1b) · ห้ามลบ guard นี้ ──────────────────────────────────
  --   guard เดิมตรวจแค่ v_w_cash / v_c_food / v_c_stock → บัญชีทดสอบที่ "ไม่มีหมวด
  --   บันเทิง" ทำให้ v_c_fun เป็น null แล้วรายการ 'หนัง' 1,000 ของเดือน -1 ถูก
  --   insert ด้วย category_id = null เงียบ ๆ → AI รายงานว่า "อื่นๆ" (ถูกตามข้อมูล
  --   แต่ไม่ตรง expected-answers.md) เสียเวลาไล่หาสาเหตุนาน · verify_test_data.sql
  --   ตอนนั้นตรวจแต่ยอดรวมจึงยังผ่าน ปิดบั๊กนี้ไว้ (ดู assert ระดับหมวด + assert
  --   "ไม่มี category_id null" ที่เพิ่มคู่กันในไฟล์ verify)
  --
  -- ⛔ ห้าม self-heal (สร้าง/rename หมวดที่หายให้อัตโนมัติ) — การเงียบ ๆ ซ่อมให้คือ
  --    กลไกที่ซ่อนบั๊กนี้มาแต่แรก · ให้ล้มพร้อมรายชื่อชัด ๆ แล้วเจ้าของตัดสินใจเอง
  ------------------------------------------------------------------------------
  if v_w_cash   is null then v_missing := v_missing || 'กระเป๋า:เงินสด'::text;      end if;
  if v_w_bank   is null then v_missing := v_missing || 'กระเป๋า:ธนาคาร'::text;      end if;
  if v_w_pp     is null then v_missing := v_missing || 'กระเป๋า:พร้อมเพย์'::text;    end if;
  if v_c_salary is null then v_missing := v_missing || 'หมวด:เงินเดือน'::text;       end if;
  if v_c_food   is null then v_missing := v_missing || 'หมวด:อาหาร (expense)'::text; end if;
  if v_c_travel is null then v_missing := v_missing || 'หมวด:เดินทาง'::text;         end if;
  if v_c_shop   is null then v_missing := v_missing || 'หมวด:ช้อปปิ้ง'::text;        end if;
  if v_c_bill   is null then v_missing := v_missing || 'หมวด:บิล/ค่าบ้าน'::text;     end if;
  if v_c_fun    is null then v_missing := v_missing || 'หมวด:บันเทิง'::text;         end if;   -- ← ตัวที่เคยหลุด
  if v_c_pet    is null then v_missing := v_missing || 'หมวด:อาหารสัตว์'::text;      end if;
  if v_c_stock  is null then v_missing := v_missing || 'หมวด:เสื้อเข้าร้าน'::text;    end if;
  if array_length(v_missing, 1) is not null then
    raise exception E'บัญชี v_me (%) ขาดกระเป๋า/หมวดต่อไปนี้ %รายการ — สร้าง/rename ให้ครบเองแล้วรันใหม่ (ห้ามให้สคริปต์สร้างให้):\n  %',
      v_me, array_length(v_missing, 1), array_to_string(v_missing, E'\n  ');
  end if;

  ------------------------------------------------------------------------------
  -- 2) impersonate เป็น v_me (ตั้งแต่บรรทัดนี้ auth.uid() = v_me, RLS มีผล)
  ------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_me)::text, true);
  perform set_config('role', 'authenticated', true);

  ------------------------------------------------------------------------------
  -- 2.1) รายการเงินสด/รับเข้า (income/expense ธรรมดา) — insert ตรงถูกต้อง
  --      (ไม่มี RPC สำหรับรายการทั่วไป; user_id ปล่อย default = auth.uid())
  --      ยึดเลขกลม · ยอดรวมแต่ละเดือนจำง่าย (ดู expected-answers.md)
  ------------------------------------------------------------------------------
  -- M-3 (สปาร์ส · case #12: ข้อมูลน้อยกว่าเดือนอื่นชัด ๆ)
  insert into public.transactions (type, amount, category_id, wallet_id, date, note) values
    ('income',  15000, v_c_salary, v_w_bank, v_m3,     'เงินเดือน'),
    ('expense',  1000, v_c_food,   v_w_cash, v_m3 + 1, 'ข้าว');

  -- M-2 (มี COGS + ขายขาดทุน + ซื้อสต็อกก้อนใหญ่)
  insert into public.transactions (type, amount, category_id, wallet_id, date, note) values
    ('income',  30000, v_c_salary, v_w_bank, v_m2,     'เงินเดือน'),
    ('expense',  3000, v_c_bill,   v_w_bank, v_m2 + 1, 'ค่าบ้าน'),
    ('expense',  2000, v_c_food,   v_w_cash, v_m2 + 2, 'ข้าว'),
    ('expense',  1000, v_c_travel, v_w_pp,   v_m2 + 4, 'ค่ารถ');

  -- M-1 (เดือนที่แล้ว · สะอาด ไม่มีสต็อก · ยอดรวมกลม)
  insert into public.transactions (type, amount, category_id, wallet_id, date, note) values
    ('income',  30000, v_c_salary, v_w_bank, v_m1,     'เงินเดือน'),
    ('expense',  4000, v_c_food,   v_w_cash, v_m1 + 1, 'ข้าว'),
    ('expense',  2000, v_c_travel, v_w_pp,   v_m1 + 2, 'ค่ารถ'),
    ('expense',  3000, v_c_shop,   v_w_bank, v_m1 + 3, 'ของใช้'),
    ('expense',  1000, v_c_fun,    v_w_cash, v_m1 + 4, 'หนัง');

  -- M0 (เดือนนี้ · วันที่ 1-4 เท่านั้น · case #7 หมวดใกล้กัน · case #8 งบเกิน/เหลือ)
  insert into public.transactions (type, amount, category_id, wallet_id, date, note) values
    ('income',  30000, v_c_salary, v_w_bank, v_m0,     'เงินเดือน'),
    ('expense',  5000, v_c_food,   v_w_cash, v_m0,     'ข้าว'),        -- งบอาหารตั้ง 4,000 → เกิน
    ('expense',   500, v_c_travel, v_w_pp,   v_m0 + 1, 'ค่ารถ'),       -- งบเดินทางตั้ง 2,000 → เหลือ
    ('expense',   300, v_c_pet,    v_w_cash, v_m0 + 2, 'อาหารแมว');    -- หมวด "อาหารสัตว์" (ใกล้ "อาหาร")

  ------------------------------------------------------------------------------
  -- 2.2) รับเข้าสต็อก (RPC) — RPC ตั้ง created_at = now() → ต้อง UPDATE เดือนเอง
  --      is_stock_purchase = true → ไม่เข้า headline/งบ แต่หักเงินกระเป๋าจริง (case #2)
  ------------------------------------------------------------------------------
  -- กระเป๋า C, หมวก D → เดือน -3 (ค้าง >60 วันเสมอไม่ว่ารันวันไหน · case #5)
  select stock_item_id, transaction_id into v_item_c, v_tx_c
    from public.stock_intake_create(
      p_name := 'กระเป๋า C', p_cost_per_unit := 300, p_qty := 3,
      p_category_id := v_c_stock, p_wallet_id := v_w_bank);
  select stock_item_id, transaction_id into v_item_d, v_tx_d
    from public.stock_intake_create(
      p_name := 'หมวก D', p_cost_per_unit := 250, p_qty := 2,
      p_category_id := v_c_stock, p_wallet_id := v_w_bank);

  -- รองเท้า A (ก้อนใหญ่ 10x500=5,000), เสื้อ B → เดือน -2
  select stock_item_id, transaction_id into v_item_a, v_tx_a
    from public.stock_intake_create(
      p_name := 'รองเท้า A', p_cost_per_unit := 500, p_qty := 10,
      p_category_id := v_c_stock, p_wallet_id := v_w_bank);
  select stock_item_id, transaction_id into v_item_b, v_tx_b
    from public.stock_intake_create(
      p_name := 'เสื้อ B', p_cost_per_unit := 200, p_qty := 5,
      p_category_id := v_c_stock, p_wallet_id := v_w_bank);

  -- รองเท้าใหม่ E → เดือนนี้ (ของใหม่ ไม่ค้าง · เป็นตัวขอบเดือน case #6)
  select stock_item_id, transaction_id into v_item_e, v_tx_e
    from public.stock_intake_create(
      p_name := 'รองเท้าใหม่ E', p_cost_per_unit := 400, p_qty := 2,
      p_category_id := v_c_stock, p_wallet_id := v_w_bank);

  -- ตั้งเดือนของสินค้า (created_at ที่ stock_intake_list ใช้กรอง) + วันของ txn ซื้อ
  -- ให้สอดคล้องกัน · ตั้ง created_at เป็น "เที่ยงเวลาไทย" กันคลาดเคลื่อน tz
  update public.stock_items set created_at = (to_char(v_m3 + 1, 'YYYY-MM-DD') || ' 12:00:00+07')::timestamptz where id in (v_item_c, v_item_d);
  update public.stock_items set created_at = (to_char(v_m2 + 3, 'YYYY-MM-DD') || ' 12:00:00+07')::timestamptz where id in (v_item_a, v_item_b);
  -- 🔴 case #6: ของ E ตั้งขอบเดือนนี้ 00:30 เวลาไทย — ต้องนับเป็น "เดือนนี้"
  update public.stock_items set created_at = v_boundary where id = v_item_e;
  update public.transactions set date = v_m3 + 1 where id in (v_tx_c, v_tx_d);
  update public.transactions set date = v_m2 + 3 where id in (v_tx_a, v_tx_b);
  update public.transactions set date = v_m0     where id = v_tx_e;

  ------------------------------------------------------------------------------
  -- 2.3) การขาย (RPC) เดือน -2 · p_sale_date ตั้งเดือนได้ตรง (ไม่ต้อง UPDATE)
  --      รายได้เข้ากระเป๋า · COGS wallet=null (ไม่หักกระเป๋า) · profit ติดลบได้
  ------------------------------------------------------------------------------
  -- ขายกำไร: รองเท้า A 4 ชิ้น @800 (ทุน 500) → รายได้ 3,200 · COGS 2,000 · กำไร +1,200
  perform public.stock_sale_create(
    p_item_id := v_item_a, p_qty := 4, p_sale_price := 800,
    p_wallet_id := v_w_cash, p_sale_date := v_m2 + 9, p_note := 'ขายรองเท้า A');
  -- ขายขาดทุน (case #4): เสื้อ B 5 ชิ้น @150 (ทุน 200) → รายได้ 750 · COGS 1,000 · กำไร -250
  perform public.stock_sale_create(
    p_item_id := v_item_b, p_qty := 5, p_sale_price := 150,
    p_wallet_id := v_w_cash, p_sale_date := v_m2 + 11, p_note := 'ขายเสื้อ B ล้างสต็อก');

  ------------------------------------------------------------------------------
  -- 2.4) งบ (case #8: อาหารเกิน / เดินทางเหลือ) + รายการประจำ (case #9)
  ------------------------------------------------------------------------------
  insert into public.budgets (category_id, month, amount) values
    (v_c_food,   v_m0, 4000),    -- ใช้ 5,000 → เกินงบ
    (v_c_travel, v_m0, 2000);    -- ใช้ 500  → ยังเหลือ

  insert into public.recurring (label, type, amount, category_id, wallet_id, schedule, next_run, active) values
    ('ค่าเน็ต', 'expense', 400, v_c_bill, v_w_bank, 'monthly:5',  v_m0 + 4, true),
    ('ค่าไฟ',   'expense', 800, v_c_bill, v_w_bank, 'monthly:10', v_m0 + 9, true);

  ------------------------------------------------------------------------------
  -- 2.5) การโอนระหว่างกระเป๋า (case #11) — ไม่เข้า headline/งบ/ประวัติ ขยับแค่คงเหลือ
  ------------------------------------------------------------------------------
  perform public.wallet_transfer_create(
    p_from := v_w_cash, p_to := v_w_bank, p_amount := 1000,
    p_date := v_m0 + 1, p_note := 'ย้ายเข้าออม');

  ------------------------------------------------------------------------------
  -- 2.6) หนี้เพื่อน 5 สถานะ (case #10) — สร้างในฐานะ v_me
  --      d5 (settled) จะสร้าง transaction is_debt_settlement เข้ากระเป๋า/headline
  ------------------------------------------------------------------------------
  select d.id into v_d1 from public.debt_create(
    p_creditor_id := v_me, p_debtor_id := v_friend, p_amount := 500,
    p_reason := 'ค่าข้าวที่ออกให้', p_private := false) d;               -- shared เขาค้างเรา
  select d.id into v_d2 from public.debt_create(
    p_creditor_id := v_friend, p_debtor_id := v_me, p_amount := 800,
    p_reason := 'ยืมเพื่อนไปก่อน', p_private := false) d;                -- shared เราค้างเขา
  select d.id into v_d3 from public.debt_create(
    p_creditor_id := v_me, p_debtor_id := v_friend, p_amount := 300,
    p_reason := 'ค่าหนัง', p_private := false) d;                        -- shared pending (ไม่ยืนยัน)
  select d.id into v_d4 from public.debt_create(
    p_creditor_id := v_friend, p_debtor_id := v_me, p_amount := 200,
    p_reason := 'จดกันลืมว่าติดเพื่อน', p_private := true) d;            -- private (คนอื่นไม่เห็น)
  select d.id into v_d5 from public.debt_create(
    p_creditor_id := v_friend, p_debtor_id := v_me, p_amount := 1000,
    p_reason := 'ค่าตั๋วคอนเสิร์ต', p_private := false) d;               -- shared → จะเคลียร์

  -- ── สลับเป็น v_friend เพื่อ "ยืนยัน" (คนยืนยันต้องไม่ใช่คนสร้าง) ──
  perform set_config('request.jwt.claims', json_build_object('sub', v_friend)::text, true);
  perform public.debt_confirm(v_d1);
  perform public.debt_confirm(v_d2);
  perform public.debt_confirm(v_d5);
  -- d3 ปล่อย pending · d4 เป็น private (สร้างแล้ว confirmed อัตโนมัติ)

  -- ── กลับเป็น v_me เพื่อ "เคลียร์" d5 → ได้ transaction is_debt_settlement (วันนี้) ──
  perform set_config('request.jwt.claims', json_build_object('sub', v_me)::text, true);
  perform public.debt_settle(p_debt_id := v_d5, p_wallet_id := v_w_cash);

  ------------------------------------------------------------------------------
  -- 3) กลับเป็น owner + เก็บ uid ไว้ให้ SELECT สรุปข้างล่าง (กรอก uid ที่เดียว)
  ------------------------------------------------------------------------------
  perform set_config('role', v_owner, true);
  drop table if exists _cfg;
  create temp table _cfg as select v_me as me, v_friend as friend;

  raise notice 'seed เสร็จ · v_me=% · เดือน anchor=%', v_me, v_m0;
end $$;

-- ── สรุปสั้น ๆ (result set) ให้เห็นว่าเขียนอะไรไปบ้าง ก่อนตัดสินใจ commit ──────
-- อ่าน uid จาก _cfg (ไม่ต้องกรอกซ้ำ) · คาดว่า transactions = 25 (15 ทั่วไป + 5 ซื้อสต็อก
-- + 2 รายได้ขาย + 2 COGS + 1 เคลียร์หนี้) · stock_items = 5 · debts (v_me เป็นคู่) = 5
select 'transactions ของ v_me' as what, count(*) as n
  from public.transactions where user_id = (select me from _cfg)
union all select 'stock_items', count(*) from public.stock_items where user_id = (select me from _cfg)
union all select 'debts (v_me เป็นคู่)', count(*) from public.debts
  where creditor_id = (select me from _cfg) or debtor_id = (select me from _cfg);

-- ⚠️ รอบแรก: rollback; (ตรวจว่าไม่มี error)  ·  พอใจแล้วเปลี่ยนเป็น commit; รันซ้ำ
rollback;
