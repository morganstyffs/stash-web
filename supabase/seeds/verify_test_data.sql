-- ============================================================================
-- Stash — verify_test_data.sql   (พิสูจน์ว่า DB ตอบตรงค่าคาดหวัง · ใบ TESTDATA)
--
-- 🔴 ไฟล์ที่สำคัญที่สุดของใบนี้ — เพราะ agent ต่อ DB ไม่ได้ ค่าคาดหวังใน
--    expected-answers.md จึงเป็นแค่ "สิ่งที่ควรเป็นตามสูตรในโค้ด" ยังไม่ใช่ "สิ่งที่
--    DB ตอบจริง" · ไฟล์นี้ query ค่าจริงกลับมา "ผ่าน RPC จริง" (ไม่ใช่ query ตาราง
--    เฉย ๆ) แล้วเทียบกับค่าที่ hardcode ไว้ → PROVEN / FAILED
--
-- ── ทำไมคืนเป็น result set ไม่ใช่ RAISE NOTICE / RAISE EXCEPTION ─────────────
--   Supabase SQL Editor ไม่แสดง NOTICE · และถ้า RAISE EXCEPTION กลางทาง ทรานแซกชัน
--   จะ abort ทำให้ SELECT ตารางผลไม่ออกเลย → เห็นแค่ error แถวเดียว ไม่เห็นว่า
--   "อันไหนผ่าน อันไหนพัง" · จึงเก็บผลทุก assert ลง temp table แล้ว SELECT ท้ายสุด
--   แถว FAILED จะเด่นในผล + มีแถวสรุป PROVEN n/m · (ต่างจากไฟล์ seed/reset ที่ให้
--   assert ล้ม = raise หยุดทั้งชุด เพราะพวกนั้นแก้ข้อมูลจริง ต้องหยุดทันที)
--
-- ── ทำไมต้อง impersonate ──────────────────────────────────────────────────
--   RPC ทั้งหมด (wallet_balances / stock_sales_summary / stock_intake_list /
--   transactions_search / friend_debts_summary) เป็น SECURITY INVOKER → owner
--   ที่ bypass RLS จะเห็นข้ามผู้ใช้/ได้ค่าผิด · ต้องสลับ role authenticated + ตั้ง
--   request.jwt.claims ให้ auth.uid() = v_me (ลอกจากหัวไฟล์ 0030)
--
-- ── ขอบเขต: เฉพาะ "กลุ่ม ก" (คงที่ทุกวัน) เท่านั้นในนี้ ─────────────────────
--   คงเหลือกระเป๋า · ยอดขายเดือนที่ปิด · จำนวนชิ้นรับเข้าต่อเดือน · headline เดือน
--   ที่ปิด · จ่ายแยกหมวด (เดือน -1/-2 ผ่าน p_category_id จริง) · ต้องไม่มี
--   category_id=null · ยอดหนี้ shared สุทธิ · ทั้งหมดไม่ขึ้นกับ "วันนี้วันที่เท่าไหร่"
--   ค่า "กลุ่ม ข" (days_left / daily_allowance / oldest_in_stock_days) พิสูจน์
--   อัตโนมัติไม่ได้ → อยู่เป็น "สูตร" ใน expected-answers.md ไม่อยู่ในนี้
--   ⚠️ ข้อสมมติเดียว: รัน verify "ในเดือนเดียวกับที่ seed" (คงเหลือกระเป๋าไม่สนใจ
--      แต่ยอด/จำนวนที่แบ่งตามเดือน -1/-2/-3 จะเลื่อนถ้าข้ามเดือน)
--
-- รันทั้งไฟล์ได้ไม่จำกัด ไม่แก้ข้อมูล (ครอบ begin; … rollback;)
-- ============================================================================

begin;

create temp table _v (seq int, check_name text, expected text, actual text, result text);

do $$
declare
  v_owner text := current_user;
  -- ⬇️⬇️ กรอก uid 2 บัญชี (ต้องตรงกับที่ seed) — ไม่ใช้ limit 1
  v_me     uuid := '00000000-0000-0000-0000-000000000000';   -- ← uid ตัวเอง
  v_friend uuid := '11111111-1111-1111-1111-111111111111';   -- ← uid เพื่อน

  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_m0 date; v_m1 date; v_m2 date; v_m3 date;

  -- ค่าที่วัดจริง (เก็บระหว่าง impersonate แล้วค่อยเขียนลง _v ตอนเป็น owner)
  v_cash numeric; v_bank numeric; v_pp numeric;
  v_rev numeric; v_cogs numeric; v_profit numeric; v_qty int; v_scnt int;
  v_s1cnt int;
  v_in2 int; v_in3 int; v_in0 int;
  v_exp_m1 numeric; v_exp_m2 numeric; v_inc_m2 numeric;
  v_snet numeric; v_they numeric; v_iowe numeric; v_pnet numeric;

  -- id หมวด (เก็บเป็น text เพื่อส่งให้ transactions_search.p_category_id ตรง ๆ)
  v_cat_food text; v_cat_travel text; v_cat_shop text; v_cat_fun text;
  v_cat_bill text; v_cat_cogs text;
  -- จ่ายแยกหมวด (window aggregate match_expense จาก RPC) + จำนวน category_id null
  v_c1food numeric; v_c1travel numeric; v_c1shop numeric; v_c1fun numeric;
  v_c2food numeric; v_c2travel numeric; v_c2bill numeric; v_c2cogs numeric;
  v_nullcat int;
begin
  -- ── ตรวจ uid: "มีอยู่จริงใน auth.users" ไม่ใช่ "เทียบกับค่าตัวอย่าง" ──────────
  --   🔴 เคยเกิดจริง: กรอก uid ด้วย find-replace ทั้งไฟล์ → ค่าตัวอย่างในเงื่อนไข
  --      (00000000-… / 11111111-…) ถูกแทนไปด้วย กลายเป็น `if v_me = v_me` ซึ่งจริง
  --      เสมอ → raise ทุกครั้งทั้งที่กรอกถูก เสียเวลาไล่หาสาเหตุ · วิธี not exists นี้
  --      ทน find-replace และยังจับ uid ที่พิมพ์ผิด/ไม่มีบัญชีได้ด้วย (ของเดิมจับไม่ได้)
  --      ⛔ ห้ามแก้กลับไปเทียบกับค่าตัวอย่าง · เพิ่ม v_friend ด้วย (assert หนี้ใช้มัน)
  if not exists (select 1 from auth.users where id = v_me) then
    raise exception 'ไม่พบ v_me (%) ใน auth.users — กรอก uid แล้วหรือยัง / uid ผิดหรือเปล่า', v_me;
  end if;
  if not exists (select 1 from auth.users where id = v_friend) then
    raise exception 'ไม่พบ v_friend (%) ใน auth.users — กรอก uid แล้วหรือยัง / uid ผิดหรือเปล่า', v_friend;
  end if;
  if v_me = v_friend then
    raise exception 'v_me กับ v_friend ต้องเป็นคนละบัญชี';
  end if;

  v_m0 := date_trunc('month', v_today)::date;
  v_m1 := (v_m0 - interval '1 month')::date;
  v_m2 := (v_m0 - interval '2 month')::date;
  v_m3 := (v_m0 - interval '3 month')::date;

  -- ── impersonate v_me ──
  perform set_config('request.jwt.claims', json_build_object('sub', v_me)::text, true);
  perform set_config('role', 'authenticated', true);

  -- (A) คงเหลือกระเป๋า (RPC wallet_balances) — คงที่ทุกวัน
  select wb.balance into v_cash from public.wallet_balances() wb
    join public.wallets w on w.id = wb.wallet_id where w.name = 'เงินสด';
  select wb.balance into v_bank from public.wallet_balances() wb
    join public.wallets w on w.id = wb.wallet_id where w.name = 'ธนาคาร';
  select wb.balance into v_pp from public.wallet_balances() wb
    join public.wallets w on w.id = wb.wallet_id where w.name = 'พร้อมเพย์';

  -- (B) ยอดขายเดือน -2 (RPC stock_sales_summary) — มีขายกำไร+ขาดทุนรวมกัน
  --     ใช้ named arg ทุกตัว: signature จริงใน SQL อาจเรียงคนละลำดับกับ database.types
  select coalesce(s.revenue,0), coalesce(s.cogs,0), coalesce(s.profit,0),
         coalesce(s.qty_sold,0), coalesce(s.sale_count,0)
    into v_rev, v_cogs, v_profit, v_qty, v_scnt
    from public.stock_sales_summary(p_from := v_m2, p_to := (v_m2 + interval '1 month')::date) s;

  -- (C) เดือน -1 ไม่มีขายเลย
  select coalesce(s.sale_count,0) into v_s1cnt
    from public.stock_sales_summary(p_from := v_m1, p_to := (v_m1 + interval '1 month')::date) s;

  -- (D) จำนวนชิ้นรับเข้าต่อเดือน (RPC stock_intake_list)
  select count(*) into v_in2 from public.stock_intake_list(p_from := v_m2, p_to := (v_m2 + interval '1 month')::date, p_limit := 200);
  select count(*) into v_in3 from public.stock_intake_list(p_from := v_m3, p_to := (v_m3 + interval '1 month')::date, p_limit := 200);
  -- 🔴 case #6: ของขอบเดือน (00:30 เวลาไทย วันแรก) ต้องนับเป็น "เดือนนี้" = 1 ชิ้น
  select count(*) into v_in0 from public.stock_intake_list(p_from := v_m0, p_to := (v_m0 + interval '1 month')::date, p_limit := 200);

  -- (E) headline จ่าย/รับ (RPC transactions_search — ตัวเดียวกับที่ month_spending ใช้)
  --     filter='expense' = type=expense AND NOT is_stock_purchase (รวม COGS/เคลียร์หนี้)
  --     named arg: p_category_id เป็น text '' = ทุกหมวด (0024) · เลี่ยงพลาดลำดับ positional
  select ts.match_expense into v_exp_m1
    from public.transactions_search(p_filter := 'expense', p_q := '', p_month := to_char(v_m1,'YYYY-MM'), p_category_id := '', p_limit := 200, p_offset := 0) ts limit 1;
  select ts.match_expense into v_exp_m2
    from public.transactions_search(p_filter := 'expense', p_q := '', p_month := to_char(v_m2,'YYYY-MM'), p_category_id := '', p_limit := 200, p_offset := 0) ts limit 1;
  select ts.match_income into v_inc_m2
    from public.transactions_search(p_filter := 'income', p_q := '', p_month := to_char(v_m2,'YYYY-MM'), p_category_id := '', p_limit := 200, p_offset := 0) ts limit 1;

  -- (F) หนี้ shared สุทธิกับเพื่อน (RPC friend_debts_summary)
  select fds.shared_net, fds.shared_they_owe_me, fds.shared_i_owe_them, fds.private_net
    into v_snet, v_they, v_iowe, v_pnet
    from public.friend_debts_summary() fds where fds.friend_id = v_friend;

  -- (G) จ่ายแยกหมวด — ผ่าน transactions_search + p_category_id "จริง" (uuid ของหมวด)
  --     ไม่ใช่ query ตาราง เพื่อพิสูจน์ว่า "ตัวกรองหมวดของ RPC ทำงาน" ไม่ใช่แค่
  --     ข้อมูลในตารางถูก · match_expense เป็น window aggregate เหนือทั้ง match set
  --     (หมวด+เดือน+expense) ทุกแถวจึงได้เลขเดียวกัน → เอาแถวแรกพอ
  --     🔴 เดิม verify ตรวจแต่ "ยอดรวมทั้งเดือน" จึงจับบั๊ก category_id=null (ใบ 1b)
  --        ไม่ได้ — assert รายหมวดข้างล่างจับได้ตรง (หมวดที่ตกหล่นจะขาดยอด)
  --     RLS จำกัด categories เป็นของ v_me อยู่แล้ว จึงไม่ต้องใส่ user_id
  select id::text into v_cat_food   from public.categories where name = 'อาหาร' and kind = 'expense';
  select id::text into v_cat_travel from public.categories where name = 'เดินทาง';
  select id::text into v_cat_shop   from public.categories where name = 'ช้อปปิ้ง';
  select id::text into v_cat_fun    from public.categories where name = 'บันเทิง';
  select id::text into v_cat_bill   from public.categories where name = 'บิล/ค่าบ้าน';
  select id::text into v_cat_cogs   from public.categories where system_key = 'stock_cogs';

  -- เดือน -1: อาหาร 4,000 · เดินทาง 2,000 · ช้อปปิ้ง 3,000 · บันเทิง 1,000 (Σ = headline 10,000)
  --   coalesce(...,'') → ถ้าหมวดหาย (id null) p_category_id ว่าง = "ทุกหมวด" → ยอดไม่ตรง = FAILED
  select ts.match_expense into v_c1food from public.transactions_search(
    p_filter := 'expense', p_q := '', p_month := to_char(v_m1,'YYYY-MM'), p_category_id := coalesce(v_cat_food,''),   p_limit := 200, p_offset := 0) ts limit 1;
  select ts.match_expense into v_c1travel from public.transactions_search(
    p_filter := 'expense', p_q := '', p_month := to_char(v_m1,'YYYY-MM'), p_category_id := coalesce(v_cat_travel,''), p_limit := 200, p_offset := 0) ts limit 1;
  select ts.match_expense into v_c1shop from public.transactions_search(
    p_filter := 'expense', p_q := '', p_month := to_char(v_m1,'YYYY-MM'), p_category_id := coalesce(v_cat_shop,''),   p_limit := 200, p_offset := 0) ts limit 1;
  select ts.match_expense into v_c1fun from public.transactions_search(
    p_filter := 'expense', p_q := '', p_month := to_char(v_m1,'YYYY-MM'), p_category_id := coalesce(v_cat_fun,''),    p_limit := 200, p_offset := 0) ts limit 1;

  -- เดือน -2: อาหาร 2,000 · เดินทาง 1,000 · บิล/ค่าบ้าน 3,000 · ต้นทุนขายสต็อก(COGS) 3,000 (Σ = headline 9,000)
  select ts.match_expense into v_c2food from public.transactions_search(
    p_filter := 'expense', p_q := '', p_month := to_char(v_m2,'YYYY-MM'), p_category_id := coalesce(v_cat_food,''),   p_limit := 200, p_offset := 0) ts limit 1;
  select ts.match_expense into v_c2travel from public.transactions_search(
    p_filter := 'expense', p_q := '', p_month := to_char(v_m2,'YYYY-MM'), p_category_id := coalesce(v_cat_travel,''), p_limit := 200, p_offset := 0) ts limit 1;
  select ts.match_expense into v_c2bill from public.transactions_search(
    p_filter := 'expense', p_q := '', p_month := to_char(v_m2,'YYYY-MM'), p_category_id := coalesce(v_cat_bill,''),   p_limit := 200, p_offset := 0) ts limit 1;
  select ts.match_expense into v_c2cogs from public.transactions_search(
    p_filter := 'expense', p_q := '', p_month := to_char(v_m2,'YYYY-MM'), p_category_id := coalesce(v_cat_cogs,''),   p_limit := 200, p_offset := 0) ts limit 1;

  -- (H) จับบั๊กใบ 1b ตรง ๆ: seed ต้อง insert "ทุกแถวมีหมวด" · ถ้ามี category_id=null
  --     แม้แถวเดียว = seed lookup หมวดไม่เจอแล้วยอมเงียบ (บั๊กเดิม) → ต้องได้ 0
  --     อ่านตรงจากตาราง (ตรวจ "โครงสร้างข้อมูล" ไม่ใช่พฤติกรรม RPC) · RLS = ของ v_me
  select count(*) into v_nullcat from public.transactions where category_id is null;

  -- ── กลับเป็น owner แล้วบันทึกผล (temp table เป็นของ owner) ──
  perform set_config('role', v_owner, true);

  insert into _v values
    ( 1, 'คงเหลือ เงินสด',              '3650',   coalesce(v_cash::text,'(null)'),   case when v_cash  = 3650   then 'PROVEN' else 'FAILED' end),
    ( 2, 'คงเหลือ ธนาคาร',             '111800', coalesce(v_bank::text,'(null)'),   case when v_bank  = 111800 then 'PROVEN' else 'FAILED' end),
    ( 3, 'คงเหลือ พร้อมเพย์ (ติดลบ ไม่ clamp)', '-3000', coalesce(v_pp::text,'(null)'), case when v_pp = -3000 then 'PROVEN' else 'FAILED' end),
    ( 4, 'ขาย -2 · รายได้',            '3950',   coalesce(v_rev::text,'(null)'),    case when v_rev    = 3950  then 'PROVEN' else 'FAILED' end),
    ( 5, 'ขาย -2 · ต้นทุนขาย (COGS)',  '3000',   coalesce(v_cogs::text,'(null)'),   case when v_cogs   = 3000  then 'PROVEN' else 'FAILED' end),
    ( 6, 'ขาย -2 · กำไรสุทธิ (มีขาดทุนรวม)', '950', coalesce(v_profit::text,'(null)'), case when v_profit = 950 then 'PROVEN' else 'FAILED' end),
    ( 7, 'ขาย -2 · จำนวนชิ้น',         '9',      coalesce(v_qty::text,'(null)'),    case when v_qty    = 9     then 'PROVEN' else 'FAILED' end),
    ( 8, 'ขาย -2 · จำนวนครั้ง',        '2',      coalesce(v_scnt::text,'(null)'),   case when v_scnt   = 2     then 'PROVEN' else 'FAILED' end),
    ( 9, 'ขาย -1 · ไม่มีการขาย',       '0',      coalesce(v_s1cnt::text,'(null)'),  case when v_s1cnt  = 0     then 'PROVEN' else 'FAILED' end),
    (10, 'รับเข้า -2 · จำนวนรายการ',   '2',      coalesce(v_in2::text,'(null)'),    case when v_in2    = 2     then 'PROVEN' else 'FAILED' end),
    (11, 'รับเข้า -3 · จำนวนรายการ',   '2',      coalesce(v_in3::text,'(null)'),    case when v_in3    = 2     then 'PROVEN' else 'FAILED' end),
    (12, 'รับเข้า เดือนนี้ · ของขอบเดือน 00:30 นับเป็นเดือนนี้', '1', coalesce(v_in0::text,'(null)'), case when v_in0 = 1 then 'PROVEN' else 'FAILED' end),
    (13, 'headline จ่าย -1',           '10000',  coalesce(v_exp_m1::text,'(null)'), case when v_exp_m1 = 10000 then 'PROVEN' else 'FAILED' end),
    (14, 'headline จ่าย -2 (รวม COGS)','9000',   coalesce(v_exp_m2::text,'(null)'), case when v_exp_m2 = 9000  then 'PROVEN' else 'FAILED' end),
    (15, 'รับ -2 (รวมรายได้ขาย)',      '33950',  coalesce(v_inc_m2::text,'(null)'), case when v_inc_m2 = 33950 then 'PROVEN' else 'FAILED' end),
    (16, 'หนี้ shared สุทธิ (เราค้างเขา 300)', '-300', coalesce(v_snet::text,'(null)'), case when v_snet = -300 then 'PROVEN' else 'FAILED' end),
    (17, 'หนี้ shared · เขาค้างเรา',   '500',    coalesce(v_they::text,'(null)'),   case when v_they   = 500   then 'PROVEN' else 'FAILED' end),
    (18, 'หนี้ shared · เราค้างเขา',   '800',    coalesce(v_iowe::text,'(null)'),   case when v_iowe   = 800   then 'PROVEN' else 'FAILED' end),
    (19, 'หนี้ private สุทธิ (จดเอง -200)', '-200', coalesce(v_pnet::text,'(null)'), case when v_pnet = -200 then 'PROVEN' else 'FAILED' end),
    -- ── จ่ายแยกหมวด ผ่าน RPC transactions_search (p_category_id จริง) — ใบ 1b ──
    (20, 'จ่าย -1 · หมวดอาหาร',            '4000', coalesce(v_c1food::text,'(null)'),   case when v_c1food   = 4000 then 'PROVEN' else 'FAILED' end),
    (21, 'จ่าย -1 · หมวดเดินทาง',          '2000', coalesce(v_c1travel::text,'(null)'), case when v_c1travel = 2000 then 'PROVEN' else 'FAILED' end),
    (22, 'จ่าย -1 · หมวดช้อปปิ้ง',         '3000', coalesce(v_c1shop::text,'(null)'),   case when v_c1shop   = 3000 then 'PROVEN' else 'FAILED' end),
    (23, 'จ่าย -1 · หมวดบันเทิง',          '1000', coalesce(v_c1fun::text,'(null)'),    case when v_c1fun    = 1000 then 'PROVEN' else 'FAILED' end),
    (24, 'จ่าย -2 · หมวดอาหาร',            '2000', coalesce(v_c2food::text,'(null)'),   case when v_c2food   = 2000 then 'PROVEN' else 'FAILED' end),
    (25, 'จ่าย -2 · หมวดเดินทาง',          '1000', coalesce(v_c2travel::text,'(null)'), case when v_c2travel = 1000 then 'PROVEN' else 'FAILED' end),
    (26, 'จ่าย -2 · หมวดบิล/ค่าบ้าน',      '3000', coalesce(v_c2bill::text,'(null)'),   case when v_c2bill   = 3000 then 'PROVEN' else 'FAILED' end),
    (27, 'จ่าย -2 · หมวดต้นทุนขายสต็อก (COGS)', '3000', coalesce(v_c2cogs::text,'(null)'), case when v_c2cogs = 3000 then 'PROVEN' else 'FAILED' end),
    -- ── จับบั๊กใบ 1b ตรง ๆ: ต้องไม่มี transaction ที่ category_id เป็น null ──
    (28, 'ไม่มี transaction category_id null (ใบ 1b)', '0', coalesce(v_nullcat::text,'(null)'), case when v_nullcat = 0 then 'PROVEN' else 'FAILED' end);
end $$;

-- ── ผลลัพธ์ + แถวสรุป ──
select seq as "#", check_name as "การตรวจ", expected as "คาดหวัง", actual as "ได้จริง", result as "ผล"
from _v
union all
select 99, 'สรุป',
  'PROVEN ' || (select count(*) filter (where result = 'PROVEN') from _v)::text
             || '/' || (select count(*) from _v)::text,
  '',
  (select case when count(*) filter (where result <> 'PROVEN') > 0
               then '❌ มี FAILED — ตรวจข้อมูล/สูตร' else '✅ ครบทุกข้อ' end from _v)
order by 1;

rollback;
