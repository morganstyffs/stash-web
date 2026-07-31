-- ============================================================================
-- Stash — 0024_transactions_search_category
-- เพิ่มตัวกรอง **หมวด** ให้ `transactions_search` — เพื่อให้แตะแถวหมวดใน legend
-- ของโดนัทบนหน้าแรกแล้วเด้งไปดูรายการจริงของหมวดนั้นได้ (PR-37)
--
-- WHY THE CATEGORY FILTER CANNOT REUSE p_q:
-- `p_q` แมตช์ **โน้ต หรือ ชื่อหมวด** (0022 บรรทัด 265-266) → กดสไลซ์ที่เขียน
-- ฿39,000 แล้วได้ลิสต์ที่รวมได้เลขอื่น เพราะโน้ตของหมวดอื่นที่มีคำนั้นปนเข้ามา
-- และหมวดที่ชื่อเป็นสตริงย่อยของกันก็ปนกันเอง · ตัวเลขบนหน้าแรกกับหน้าประวัติ
-- ต้องตรงกันเป๊ะ ไม่งั้นผู้ใช้เลิกเชื่อทั้งสองหน้า → ต้องกรองด้วย `category_id` ตรง ๆ
--
-- WHY `p_category_id text` NOT `uuid`:
-- `supabase gen types` ประกาศ argument เป็น non-nullable → ถ้าเป็น `uuid` ฝั่ง
-- client จะบอก "ไม่กรองหมวด" ไม่ได้เลยโดยไม่ cast ซึ่งห้าม (convention 11)
-- PR-22 เจอเรื่องนี้กับ `p_q` และ 0023 เจอกับ `p_month` — แก้ด้วยวิธีเดียวกันทั้งหมด
-- ตอนนี้ p_q / p_month / p_category_id ใช้กติกาเดียวกันหมด:
--   **ว่าง = ไม่กรอง · ผิดรูปแบบ = raise** (allowlist ไม่ใช่ denylist — convention 14)
--
-- REPRODUCED VERBATIM FROM 0023 (convention 3 — reproduce จากเวอร์ชันล่าสุดบน main
-- ยืนยันแล้วว่า `0023_transactions_search_month.sql` บน main ไม่ถูกแก้หลัง apply):
--   • predicate ของ filter ทั้งสี่แบบ byte-for-byte
--   • การคำนวณช่วงเดือนจาก p_month และการ raise เมื่อรูปแบบผิด
--   • การ escape LIKE และการแมตช์ยอดแบบตรงเป๊ะ
--   • window aggregate และเหตุผลที่มันต้องถูกคำนวณก่อน LIMIT
--   • order by date desc, created_at desc, id desc
--   • security invoker + stable + set search_path = '' + revoke/grant
-- → ใบนี้เปลี่ยนได้แค่ "แคบลงได้อีกด้วยหมวด" ห้ามเปลี่ยนว่าลิสต์มีแถวอะไร
--
-- SIGNATURE CHANGE → drop ด้วย signature จริงของ 0023 (5 อาร์กิวเมนต์) ไม่ใส่
-- `if exists` (convention 4) แล้วสร้างใหม่ + re-grant
-- PostgREST เรียกด้วยชื่อ argument จึงไม่สนลำดับ
--
-- ⚠️ MERGE ORDER (§2.1 — กับดัก 0020): ห้าม merge PR `types-drift` เดี่ยว
-- ดึง `src/lib/database.types.ts` เข้าสาขาฟีเจอร์ของ PR-37 แล้ว merge ทีเดียว
-- พร้อม call site · **ตอนนี้ PR-36 merge ไปแล้ว ถ้า types ถูก merge เดี่ยว
-- call site ของ p_month ที่อยู่บน main จะยังคอมไพล์ได้ แต่ p_category_id
-- ที่เพิ่มเข้ามาจะไม่มีใครส่ง → PostgREST จะปฏิเสธเพราะขาดอาร์กิวเมนต์**
--
-- ⚠️ p_category_id จะยังไม่มี UI เรียกจนกว่า PR-37 จะลง — §9 บันทึกไว้ว่า
--    "RPC ที่ไม่เคยถูกเรียกจริง = ยังไม่ถูกพิสูจน์" (บั๊ก cast enum ใน debt_create
--    ซ่อนอยู่สี่ migration ด้วยเหตุนี้) · smoke test จึงเรียกมันจริงและ assert ผล
--    ทั้งเดี่ยว ๆ และคู่กับตัวกรองเดือน
--
-- รันใน Supabase SQL Editor ในฐานะ owner ครอบด้วย begin; … commit;
--
-- ── PRE-FLIGHT (ต้องได้ค่าตามนี้เป๊ะ ไม่ตรง = หยุด) ─────────────────────────
--   select count(*) from pg_proc where proname = 'transactions_search';   -- 1
--   select pg_get_function_identity_arguments(oid) from pg_proc
--    where proname = 'transactions_search';
--   -- ต้องได้: p_filter text, p_q text, p_month text, p_limit integer, p_offset integer
--   -- ถ้าเห็น p_category_id อยู่แล้ว = รันไฟล์นี้ไปแล้ว **หยุด**
--   -- ถ้าไม่เห็น p_month = ยังไม่ได้รัน 0023 **หยุด** ต้องรัน 0023 ก่อน
--
-- ── SMOKE TEST ──────────────────────────────────────────────────────────────
--   `verify_0024_smoke.sql` — 17 assert ครอบพฤติกรรมเดิมของ 0022/0023 ทั้งหมด
--   (ซึ่งยังไม่มีหลักฐานว่าเคยถูกทดสอบ) + ตัวกรองหมวด + หมวดคู่กับเดือน
--   **ต้องได้ SMOKE OK ก่อน merge PR-37**
-- ============================================================================


-- ===========================================================================
-- SECTION 1 — drop the 5-arg version by its real signature (no `if exists`).
-- ===========================================================================
drop function public.transactions_search(text, text, text, integer, integer);


-- ===========================================================================
-- SECTION 2 — transactions_search, reproduced from 0023 + p_category_id
--
-- p_filter       'all' | 'income' | 'expense' | 'stock' (allowlist; อื่น = raise)
-- p_q            ข้อความค้นหา · ว่าง = ไม่ค้น · แมตช์โน้ต / ชื่อหมวด / ยอดตรงเป๊ะ
-- p_month        'YYYY-MM' = เฉพาะเดือนนั้น · ว่าง = ทุกเดือน · ผิดรูปแบบ = raise
--                ขอบเขต: วันแรกของเดือน (รวม) → วันแรกของเดือนถัดไป (ไม่รวม)
--                ตรงกับ MonthBounds.start / .next ฝั่ง client
-- p_category_id  uuid เป็นข้อความ = เฉพาะหมวดนั้น · ว่าง = ทุกหมวด · ผิดรูปแบบ = raise
-- p_limit        ขนาดหน้า clamp 1..200 (ขนาดหน้า ไม่ใช่จำนวนเงิน)
-- p_offset       ข้ามกี่แถว
--
-- AMBIGUITY (convention 7 / §9 — กับดัก qty_remaining): ทุกคอลัมน์ OUT ข้างล่าง
-- เป็นตัวแปรใน scope ด้วย → ทุกการอ้างคอลัมน์ในบอดี้ต้อง qualify (t.* / c.*)
-- ห้าม "จัดระเบียบ" เอา qualifier ออก
-- ===========================================================================
create or replace function public.transactions_search(
  p_filter      text,
  p_q           text,
  p_month       text,
  p_category_id text,
  p_limit       integer,
  p_offset      integer
)
returns table (
  id                   uuid,
  "type"               public.transaction_type,
  amount               numeric,
  "date"               date,
  note                 text,
  created_at           timestamptz,
  is_stock_purchase    boolean,
  is_stock_cogs        boolean,
  is_debt_settlement   boolean,
  stock_item_id        uuid,
  category_name        text,
  category_icon        text,
  category_color_index smallint,
  match_count          bigint,
  match_income         numeric,
  match_expense        numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_q      text    := nullif(btrim(coalesce(p_q, '')), '');
  v_month  text    := nullif(btrim(coalesce(p_month, '')), '');
  v_catstr text    := nullif(btrim(coalesce(p_category_id, '')), '');
  v_cat    uuid;
  v_pat    text;
  v_num    numeric;
  v_from   date;
  v_to     date;
  v_limit  integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if p_filter is null or p_filter not in ('all', 'income', 'expense', 'stock') then
    raise exception 'unknown filter: %', p_filter;
  end if;

  -- Blank means "every month". A malformed month is a caller bug, not a request
  -- for everything — raise instead of silently widening the result set.
  if v_month is not null then
    if v_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
      raise exception 'bad month: %', p_month;
    end if;
    v_from := to_date(v_month || '-01', 'YYYY-MM-DD');
    v_to   := (v_from + interval '1 month')::date;
  end if;

  -- ว่าง = ทุกหมวด · uuid พังก็ raise ด้วยเหตุผลเดียวกัน (ไม่แอบคืนทุกหมวด)
  if v_catstr is not null then
    if v_catstr !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'bad category id: %', p_category_id;
    end if;
    v_cat := v_catstr::uuid;
  end if;

  if v_q is not null then
    -- escape \, % and _ so user text is matched literally (default LIKE escape
    -- character is the backslash)
    v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    -- a plain number also matches the amount EXACTLY — "500" means 500, not
    -- "anything containing 500"; substring-matching money reads as noise
    if v_q ~ '^[0-9]+(\.[0-9]+)?$' then
      v_num := v_q::numeric;
    end if;
  end if;

  return query
  select
    t.id,
    t.type,
    t.amount,
    t.date,
    t.note,
    t.created_at,
    t.is_stock_purchase,
    t.is_stock_cogs,
    t.is_debt_settlement,
    t.stock_item_id,
    c.name,
    c.icon,
    c.color_index,
    -- over () = the whole match set, evaluated before order by / limit
    count(*) over ()                                                  as match_count,
    sum(case when t.type = 'income' then t.amount else 0 end) over () as match_income,
    sum(case when t.type = 'income' then 0 else t.amount end) over () as match_expense
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  where (
             p_filter = 'all'
          or (p_filter = 'income'  and t.type = 'income')
          or (p_filter = 'expense' and t.type = 'expense' and t.is_stock_purchase = false)
          or (p_filter = 'stock'   and (t.is_stock_purchase or t.stock_item_id is not null))
        )
    -- month window: start inclusive, next-month start exclusive
    and (v_from is null or t.date >= v_from)
    and (v_to   is null or t.date <  v_to)
    -- exact category, never a name search — so the total here equals the donut
    -- slice on the home screen to the baht
    and (v_cat  is null or t.category_id = v_cat)
    and (
             v_q is null
          or t.note ilike v_pat
          or c.name ilike v_pat
          or (v_num is not null and t.amount = v_num)
        )
  -- t.id last so paging is deterministic when date + created_at tie
  order by t.date desc, t.created_at desc, t.id desc
  limit v_limit offset v_offset;
end;
$$;

revoke execute on function public.transactions_search(text, text, text, text, integer, integer) from public;
revoke execute on function public.transactions_search(text, text, text, text, integer, integer) from anon;
grant  execute on function public.transactions_search(text, text, text, text, integer, integer) to authenticated;


-- ===========================================================================
-- Tail — self-record + reload PostgREST.
-- ===========================================================================
insert into public.schema_migrations (version) values ('0024') on conflict do nothing;

notify pgrst, 'reload schema';
