-- ============================================================================
-- Stash — 0027_drop_target_price
--
-- ตัด "ราคาขายเป้าหมาย" (target_price) ออกทั้งระบบ
--   target_price = ราคาที่เจ้าของ "หวัง" ไม่ใช่ราคาที่ตลาดยอมจ่าย · เดิมถูกเอาไป
--   คูณเป็นตัวเลข "รอขาย +฿X · ถ้าขายได้ตามราคาตั้ง" บนหน้าคลัง = ตัวเลขที่ดูเหมือน
--   เงินแต่ไม่ใช่เงิน (ทำให้รู้สึกรวยกว่าจริงตลอดเวลา) · เจ้าของเคาะให้ตัดทั้งคอลัมน์
--   → ที่ว่างบนหน้าคลังใส่ "ทุนจม" (เงินจริงที่จมอยู่ในของค้างเกิน 60 วัน) แทน ฝั่ง client
--
-- ทำ 2 อย่างในทรานแซกชันเดียว:
--   1) reproduce stock_intake_create โดยตัด p_target_price + คอลัมน์ target_price
--      ในการ insert (ยกจาก 0025 ทั้งดุ้น — ตัวนับ atomic + retry loop + Bangkok date
--      คงเดิมทุกบรรทัด) · signature เปลี่ยน → drop ด้วย 14-arg signature จริงจาก 0025
--      (ไม่ใส่ if exists) แล้ว re-grant ด้วย 13-arg signature ใหม่
--   2) drop column target_price (ทำ "หลัง" สร้างฟังก์ชันใหม่ เพื่อไม่ให้ฟังก์ชันเก่า
--      อ้างคอลัมน์ที่หายไปแม้ชั่วขณะ) · CHECK `stock_items_target_nonneg` (0009)
--      Postgres ลบให้เองพร้อมคอลัมน์ ไม่ต้องสั่งลบแยก
--
-- ── VERIFICATION (run AFTER applying, ใน begin;…rollback; แทน <user_id>) ──────
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<user_id>"}';
--   select * from public.stock_intake_create('ทดสอบ', 100, 1);
--   -- PASS: คืน transaction_id / stock_item_id / sku ครบ และ sku เป็นรูปแบบ XXX-NNNN
--   --       (เช่น STZ-0000) · ถ้า error ว่าคอลัมน์ target_price ไม่มี = ฟังก์ชันเก่า
--   --       ยังค้าง (ไม่ได้ reproduce)
--   rollback;
-- ============================================================================

begin;

-- ═══════════════════════════════════════════════════════════════════════
-- SECTION 1 · stock_intake_create — reproduce ทั้งตัว (ตัด target_price)
--   plpgsql ไม่ตรวจ dependency ตอน drop → ต้องทับในใบเดียวกันก่อน drop column
--   drop ด้วย 14-arg signature จริงจาก 0025 (ลงท้าย …text[], boolean, text)
-- ═══════════════════════════════════════════════════════════════════════
drop function public.stock_intake_create(
  text, numeric, integer, text, uuid, uuid, text, text, text,
  public.item_condition, numeric, text[], boolean, text);

create function public.stock_intake_create(
  p_name           text,
  p_cost_per_unit  numeric,
  p_qty            integer,
  p_category       text                  default null,
  p_category_id    uuid                  default null,
  p_wallet_id      uuid                  default null,
  p_brand          text                  default null,
  p_size           text                  default null,
  p_color          text                  default null,
  p_condition      public.item_condition default null,
  p_photos         text[]                default '{}'::text[],
  p_needs_details  boolean               default false,
  p_note           text                  default null)
returns table(transaction_id uuid, stock_item_id uuid, sku text)
language plpgsql
set search_path to ''
as $function$
declare
  v_uid        uuid := auth.uid();
  v_today      date := (now() at time zone 'Asia/Bangkok')::date;   -- ★ preserved from 0010
  v_tx         uuid;
  v_item       uuid;
  v_sku        text;
  v_seq        bigint;
  v_prefix     text;
  v_attempt    int := 0;
  v_constraint text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(p_qty, 0) < 1 then
    raise exception 'qty must be >= 1';
  end if;
  if coalesce(p_cost_per_unit, -1) < 0 then
    raise exception 'cost_per_unit must be >= 0';
  end if;

  -- 1) the inventory-purchase expense (Bangkok wall-clock date, from 0010)
  insert into public.transactions
    (user_id, type, amount, category_id, wallet_id, note, is_stock_purchase, date)
  values
    (v_uid, 'expense', p_cost_per_unit * p_qty, p_category_id, p_wallet_id,
     coalesce(p_note, p_name), true, v_today)
  returning id into v_tx;

  -- ensure a config row exists (self-heal — never fail on a missing row)
  insert into public.stock_sku_config (user_id) values (v_uid)
  on conflict (user_id) do nothing;

  -- 2) allocate a SKU + insert the item, retrying on SKU collision only.
  loop
    -- atomic, forward-only bump — the UPDATE row-locks the config row so
    -- concurrent intakes serialize instead of reusing a number.
    -- RETURNING เห็นค่าใหม่ → next_seq - 1 คือเลขที่ชิ้นนี้ได้ (เริ่มที่ 0)
    update public.stock_sku_config
       set next_seq = next_seq + 1
     where user_id = v_uid
    returning next_seq - 1, prefix
      into v_seq, v_prefix;

    v_sku := public.stock_sku_build(v_prefix, v_seq);

    begin
      insert into public.stock_items
        (user_id, name, category, brand, size, color, condition,
         cost_per_unit, qty_total, qty_remaining, sku,
         status, needs_details, photos, source_transaction_id)
      values
        (v_uid, p_name, p_category, p_brand, p_size, p_color, p_condition,
         p_cost_per_unit, p_qty, p_qty, v_sku,
         'in_stock', coalesce(p_needs_details, false), coalesce(p_photos, '{}'), v_tx)
      returning id into v_item;
      exit;   -- success
    exception when unique_violation then
      -- Only our SKU constraint is retryable; any other unique violation is a
      -- real error and must surface immediately (not spin 10 empty rounds).
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'stock_items_user_sku_key' then
        raise;
      end if;
      v_attempt := v_attempt + 1;
      if v_attempt >= 10 then
        raise exception 'could not allocate a unique SKU after % attempts', v_attempt;
      end if;
      -- else: loop — bump the counter again and retry
    end;
  end loop;

  -- 3) close the loop: point the transaction at the item it created
  update public.transactions set stock_item_id = v_item where id = v_tx;

  return query select v_tx, v_item, v_sku;
end;
$function$;

grant execute on function public.stock_intake_create(
  text, numeric, integer, text, uuid, uuid, text, text, text,
  public.item_condition, text[], boolean, text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- SECTION 2 · drop คอลัมน์ target_price
--   ทำหลังสร้างฟังก์ชันใหม่ (ในทรานแซกชันเดียว) · CHECK stock_items_target_nonneg
--   (0009 · target_price is null or target_price >= 0) ถูก Postgres ลบให้เอง
--   พร้อมคอลัมน์ — ไม่มี constraint อื่นอ้างถึง target_price
-- ═══════════════════════════════════════════════════════════════════════
alter table public.stock_items drop column target_price;


-- ═══════════════════════════════════════════════════════════════════════
-- SECTION 3 · bookkeeping  ← โครงเดียวกับท้ายไฟล์ 0026
-- ═══════════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version) values ('0027')
on conflict do nothing;

notify pgrst, 'reload schema';

commit;
