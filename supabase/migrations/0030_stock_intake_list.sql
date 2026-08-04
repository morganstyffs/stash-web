-- ============================================================================
-- Stash — 0030_stock_intake_list
--
-- RPC อ่านอย่างเดียว `stock_intake_list(p_from, p_to, p_limit)` — คืน "รายการที่
-- รับเข้าสต็อกในช่วงเดือน" (ชื่อ/จำนวนที่ซื้อ/ราคาต่อหน่วย) ให้ผู้ช่วย AI ตอบคำถาม
-- "เดือนที่แล้วซื้อเข้าสต็อกกี่ชิ้น อะไรบ้าง ราคาเท่าไหร่" (design doc §2 ข้อ 1 / §7 Q3 / PR-3)
--
-- ── ทำไมต้องมี RPC นี้ (ของเดิมตอบไม่ได้) ────────────────────────────────────
--   • transactions_search filter='stock' ปนซื้อ/ขาย และไม่มีชื่อสินค้า/จำนวน/ราคาต่อหน่วย
--   • stock_items มีข้อมูลครบ แต่ **ไม่มีตัวกรองเดือน** → RPC นี้เติมช่องนั้น (อ่านอย่างเดียว)
--
-- ── "วันที่รับเข้า" = stock_items.created_at (ไม่มีคอลัมน์วันซื้อแยก · ยืนยันจาก 0001) ─
--   created_at เป็น timestamptz → กรองเดือนต้องเทียบ **เวลาไทย** ไม่ใช่ UTC/current_date
--   (§4-10): (si.created_at at time zone 'Asia/Bangkok')::date  ก่อนเทียบกับ p_from/p_to
--
-- ── ช่วงเวลา [p_from, p_to) — เหมือน stock_sales_summary (0012) ไม่สร้างแบบที่สาม ──
--   p_from รวม · p_to ไม่รวม · worker ส่ง monthBounds.start / .next (จาก dates.ts)
--
-- ── SECURITY: INVOKER · ไม่มีพารามิเตอร์ระบุตัวตน ──────────────────────────────
--   stock_items มี RLS owner-only อยู่แล้ว (0001: stock_items_select_own using
--   auth.uid()=user_id) → RPC เป็น **security invoker** พึ่ง RLS นั้น · ตัวตนมาจาก
--   auth.uid() ของ token เท่านั้น → **ไม่มี p_user_id** (§3.4) · DEFINER สงวนไว้ให้
--   cross-user/seed ไม่ใช้ที่นี่ · stable (อ่านล้วน) · set search_path='' + qualify public.
--
-- ── เพดานแถว: count(*) over () = จำนวนจริงทั้งชุด "ก่อน" LIMIT (§4.1) ──────────────
--   คืน total_count เป็น window aggregate แบบเดียวกับ transactions_search (0024) →
--   จำนวน/ยอดถูกเสมอแม้ p_limit ตัดแถว · p_limit clamp least(greatest(…,1),200) เหมือนกัน
--   คืนเฉพาะ name/qty_total/cost_per_unit + total_count — **ไม่คืนคอลัมน์เกิน** (ทุกคอลัมน์
--   คือ token ที่เข้าโมเดล และคือข้อมูลการเงินที่ไหลออกไปยังบุคคลที่สาม)
--
-- ── กับดัก §8-7: RETURNS TABLE/OUT param กลายเป็นตัวแปรใน scope ────────────────
--   ชื่อคอลัมน์ผลลัพธ์ (name/qty_total/cost_per_unit) ชนกับคอลัมน์จริง → **qualify ทุก
--   คอลัมน์ (si.…) และ alias ตาราง** เสมอ · ใช้ return query (ไม่ assign OUT var ตรง ๆ)
--
-- ไฟล์ใหม่ล้วน (ล่าสุดในดิสก์คือ 0029 → ใบนี้ 0030 · นับจาก `ls migrations/*.sql`)
-- ไม่แก้ไฟล์ที่ apply แล้ว · ไม่แตะ seed · รันใน Supabase SQL Editor ในฐานะ owner · begin;…commit;
--
-- ── PRE-FLIGHT (รันก่อน — ยืนยันสถานะจริง; query DB จาก agent ไม่ได้จึงฝากไว้) ─
--   -- 1) เลข migration ล่าสุดที่บันทึกไว้ (คาด 0029):
--   select max(version) from public.schema_migrations;
--   -- 2) ฟังก์ชันต้องยังไม่มี:
--   select to_regprocedure('public.stock_intake_list(date, date, integer)');   -- คาด: null
--
-- ── SMOKE TEST (รันหลัง commit — พิสูจน์ว่า "ทำงาน" ไม่ใช่แค่ "มีอยู่") ──────────
--
--   ⚠️⚠️  รันทั้งบล็อกแล้วจบด้วย rollback; เท่านั้น — ห้าม commit; เด็ดขาด  ⚠️⚠️
--   บล็อกนี้ INSERT stock_items จริง (ของผู้ใช้จริง) เพื่อทดสอบ · rollback คืนทุกอย่างกลับ
--   ไม่มีแถวใดรอด · ถ้าเผลอ commit = เพิ่มสินค้าปลอมลงคลังผู้ใช้
--
--   ทำไม "คืนผลเป็น result set" ไม่ใช่ RAISE NOTICE: Supabase SQL Editor ไม่แสดง NOTICE
--   → เก็บผลลง temp table แล้ว SELECT ท้ายบล็อก (แสดงแน่นอน) · assertion ที่ FAIL ใช้
--   RAISE EXCEPTION (แสดงเสมอใน SQL Editor) → ล้มดัง ไม่ล้มเงียบ
--
--   impersonate ผ่าน request.jwt.claims + สลับ role เป็น authenticated (owner BYPASS RLS —
--   ถ้าไม่สลับ ทุก assertion RLS ผ่านหลอก) · เทสต์ขอบเดือน (1-3) รันได้ด้วยผู้ใช้ 1 คน;
--   ข้ามผู้ใช้ (4) ต้องมีผู้ใช้ ≥2 คน (ไม่ครบ → แถวผล 'NOT PROVEN' ไม่ใช่ผ่านเงียบ)
--
--   begin;
--
--   create temp table _smoke (seq int, assertion text, result text, note text);
--
--   do $$
--   declare
--     v_owner text := current_user;   -- role ที่รัน (bypass RLS) — จับไว้เพื่อสลับกลับ
--     v_me uuid; v_other uuid;
--     v_cnt int; v_total bigint; v_cross boolean := false;
--   begin
--     select id into v_me from auth.users order by id limit 1;
--     if v_me is null then
--       insert into _smoke values (0, 'preconditions', 'NOT PROVEN', 'ไม่มีผู้ใช้ในระบบ');
--       return;
--     end if;
--     select id into v_other from auth.users where id <> v_me order by id limit 1;
--
--     -- ⚠️ ใช้ "เดือนที่การันตีว่าว่าง" (มิ.ย. 2020) ไม่ใช่เดือนปัจจุบัน: assertion (1)/(3) นับ
--     --    แบบแน่นอน (count=3) — ถ้าเลือกเดือนที่เจ้าของมีสินค้ารับเข้าจริง ของจริงจะถูกนับรวม
--     --    → FAIL ทั้งที่ RPC ถูก · บทเรียน: assert ค่าแน่นอนบนตารางที่มีข้อมูลจริง ต้องเลือกช่วง
--     --    ที่การันตีว่าว่าง (หรือ assert แบบสัมพัทธ์ = นับส่วนต่าง)
--     -- ⚠️ ต้องระบุ sku เอง: stock_items.sku เป็น NOT NULL ไม่มี default (0011) + unique(user_id,sku)
--     --    → ถ้าไม่ใส่ seed ล้มด้วย 23502 ตั้งแต่แรก ยังไม่ทันเรียก RPC · ใช้ ZZZ-90xx การันตีไม่ชน
--     --    ของจริง (sku จริงขึ้นต้น STZ-) และไม่ชนกันเอง · บทเรียน (คู่ §8-6): อ่าน NOT-NULL ของ
--     --    ทั้งตารางก่อนเขียน smoke test ที่ insert ลงตารางจริง ไม่ใช่แค่คอลัมน์ที่คิดว่าจะใช้
--     -- seed ตอนเป็น owner (bypass RLS) · created_at เป็นเวลาไทย (+07) รอบขอบเดือน มิ.ย. 2020
--     insert into public.stock_items (user_id, name, sku, qty_total, cost_per_unit, created_at) values
--       (v_me, 'มิ.ย.-กลางเดือน', 'ZZZ-9001', 2, 100, '2020-06-15 12:00:00+07'),
--       (v_me, 'มิ.ย.-ต้นเดือน',  'ZZZ-9002', 3,  50, '2020-06-01 00:30:00+07'),   -- Bangkok 06-01 (อยู่ในช่วง)
--       (v_me, 'มิ.ย.-ปลายเดือน', 'ZZZ-9003', 5,  20, '2020-06-30 23:30:00+07'),   -- Bangkok 06-30 (อยู่ในช่วง)
--       (v_me, 'พ.ค.-ท้ายเดือน',  'ZZZ-9004', 9,   1, '2020-05-31 22:00:00+07'),   -- Bangkok 05-31 (นอกช่วง ก่อน from)
--       (v_me, 'ก.ค.-วันแรก',     'ZZZ-9005', 9,   1, '2020-07-01 05:00:00+07');   -- Bangkok 07-01 (นอกช่วง = to ตัดออก)
--     if v_other is not null then
--       insert into public.stock_items (user_id, name, sku, qty_total, cost_per_unit, created_at) values
--         (v_other, 'ของผู้ใช้ B', 'ZZZ-9006', 7, 999, '2020-06-10 12:00:00+07');
--     end if;
--
--     -- ── สลับเป็นผู้ใช้ A (RLS มีผลตั้งแต่บรรทัดนี้; RPC เป็น invoker วิ่งด้วยสิทธิ์ A) ──
--     perform set_config('request.jwt.claims', json_build_object('sub', v_me)::text, true);
--     perform set_config('role', 'authenticated', true);
--
--     -- (1) A เห็นเฉพาะ 3 รายการในเดือน มิ.ย. (ขอบเดือนตัด พ.ค./ก.ค.)
--     select count(*) into v_cnt from public.stock_intake_list('2020-06-01', '2020-07-01', 100);
--     if v_cnt <> 3 then raise exception 'FAIL 1: ควรได้ 3 รายการในเดือน แต่ได้ %', v_cnt; end if;
--
--     -- (2) ของนอกช่วง (พ.ค. ก่อน from · ก.ค. = to) ต้องไม่ติดมา
--     perform 1 from public.stock_intake_list('2020-06-01', '2020-07-01', 100)
--       where name in ('พ.ค.-ท้ายเดือน', 'ก.ค.-วันแรก');
--     if found then raise exception 'FAIL 2: มีของนอกช่วงเดือนติดมา (ขอบเดือนผิด)'; end if;
--
--     -- (3) count จริงทั้งชุดแม้ p_limit ตัดแถว: limit 1 → 1 แถว แต่ total_count = 3
--     select count(*) into v_cnt from public.stock_intake_list('2020-06-01', '2020-07-01', 1);
--     if v_cnt <> 1 then raise exception 'FAIL 3a: limit 1 ควรได้ 1 แถว แต่ได้ %', v_cnt; end if;
--     select il.total_count into v_total
--       from public.stock_intake_list('2020-06-01', '2020-07-01', 1) il limit 1;
--     if v_total <> 3 then raise exception 'FAIL 3b: total_count ควร=3 แม้ limit 1 แต่ได้ %', v_total; end if;
--
--     -- (4) ของผู้ใช้ B ต้องไม่โผล่ให้ A เห็น (RLS ผ่าน invoker)
--     if v_other is not null then
--       select count(*) into v_cnt from public.stock_intake_list('2020-06-01', '2020-07-01', 100)
--         where name = 'ของผู้ใช้ B';
--       if v_cnt <> 0 then raise exception 'FAIL 4: A เห็นของผู้ใช้ B (RLS รั่ว) — % แถว', v_cnt; end if;
--       v_cross := true;
--     end if;
--
--     -- ── กลับเป็น owner แล้วบันทึกผล (temp เป็นของ owner) ──
--     perform set_config('role', v_owner, true);
--     insert into _smoke values
--       (1, 'A เห็นเฉพาะเดือนที่ขอ (3 รายการ)', 'PROVEN', 'ขอบเดือนตัด พ.ค./ก.ค.'),
--       (2, 'ของนอกช่วงเดือนไม่ติดมา',           'PROVEN', 'ทดสอบขอบต้น/ท้ายเดือน'),
--       (3, 'total_count จริงแม้ limit ตัดแถว',   'PROVEN', 'limit 1 → total_count 3');
--     if v_cross then
--       insert into _smoke values (4, 'ของผู้ใช้ B ไม่โผล่ (RLS)', 'PROVEN', 'A query แล้วได้ 0 แถว');
--     else
--       insert into _smoke values (4, 'ของผู้ใช้ B ไม่โผล่ (RLS)', 'NOT PROVEN', 'ต้องมีผู้ใช้ ≥2 คน');
--     end if;
--   end $$;
--
--   select seq as "#", assertion, result, note from _smoke
--   union all
--   select 99, 'สรุป',
--     'PROVEN ' || (select count(*) filter (where result = 'PROVEN') from _smoke) || '/'
--                || (select count(*) from _smoke),
--     (select case when count(*) filter (where result <> 'PROVEN') > 0
--                  then 'ยังมี NOT PROVEN — ต้องมีผู้ใช้ ≥2 คนจึงครบ'
--                  else 'ครบ' end from _smoke)
--   order by 1;
--
--   rollback;   -- ⚠️ สำคัญ: คืนทุกอย่างกลับ — ห้าม commit
-- ============================================================================

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1 · stock_intake_list — รายการรับเข้าสต็อกในช่วง [p_from, p_to)
--   invoker + stable + search_path='' · qualify ทุกคอลัมน์ (si.) · total_count = window
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.stock_intake_list(p_from date, p_to date, p_limit integer)
returns table (
  name          text,
  qty_total     integer,
  cost_per_unit numeric,
  total_count   bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  -- clamp เหมือน transactions_search (0024): default 50, ต่ำสุด 1, สูงสุด 200
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  return query
    select
      si.name,
      si.qty_total,
      si.cost_per_unit,
      -- count(*) over () = จำนวนจริงทั้งชุด ประเมินก่อน limit → ถูกเสมอแม้ถูก cap (§4.1)
      count(*) over () as total_count
    from public.stock_items si
    -- created_at เป็น timestamptz → เทียบเป็นวันเวลาไทยก่อน (§4-10) · ช่วง [from, to)
    where (si.created_at at time zone 'Asia/Bangkok')::date >= p_from
      and (si.created_at at time zone 'Asia/Bangkok')::date <  p_to
    order by si.created_at desc, si.name
    limit v_limit;
end;
$$;

grant execute on function public.stock_intake_list(date, date, integer) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 · bookkeeping  ← โครงเดียวกับท้ายไฟล์ 0029
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version) values ('0030')
on conflict do nothing;

notify pgrst, 'reload schema';

commit;
