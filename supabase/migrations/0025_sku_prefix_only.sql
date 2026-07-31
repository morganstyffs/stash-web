-- ============================================================================
-- Stash — 0025_sku_prefix_only
--
-- รูปแบบ SKU ใหม่: {PREFIX}-{SEQ}  เช่น  STZ-0000
--   prefix : 3 ตัว [A-Z0-9] · ผู้ใช้แก้เองได้ตลอด (มีผลกับของที่รับเข้าใหม่เท่านั้น)
--   seq    : 4 หลัก zero-pad · ตัวนับ 1 ตัวต่อ user · เริ่ม 0 · เดินหน้าอย่างเดียว
--            เกิน 9999 → ขยายเป็น 5 หลักเอง (pad but NEVER truncate)
--
-- ตัดท่อนแบรนด์กลาง SKU ออกทั้งหมด (เดิม STZ-GEN-0002)
--   → คอลัมน์ use_brand_code / brand_len / seq_digits / separator = drop
--   → พารามิเตอร์ p_brand_code หายจาก stock_intake_create (p_brand ยังอยู่ เป็นข้อมูลสินค้า)
--
-- ตัวนับ atomic + retry loop ของเดิม (0011) ถูกต้องอยู่แล้ว — ยกมาทั้งดุ้น เปลี่ยนแค่การเรียก build
--
-- NOTE (ของจริงต่างจากสเปก): สเปกอ้างเลข 0022 แต่ main เดินหน้าไปถึง
--   0024_transactions_search_category แล้ว → ไฟล์นี้จึงเป็น 0025 · signature ที่ drop
--   ตรวจกับ 0011_sku_config.sql (ต้นทางของทั้งสามฟังก์ชัน) ตรงตามสเปกทุกตัว
--
-- ── VERIFICATION (run AFTER applying, ใน begin;…rollback; แทน <user_id>) ──────
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<user_id>"}';
--   select public.stock_sku_preview();                          -- คาด: STZ-0000
--   select * from public.stock_intake_create('ทดสอบ', 100, 1);   -- คาด sku = STZ-0000
--   select public.stock_sku_preview();                          -- คาด: STZ-0001 (ถ้าไม่ขยับ = pre/post-increment เพี้ยน)
-- ============================================================================

begin;

-- ═══════════════════════════════════════════════════════════════════════
-- SECTION 1 · stock_sku_config
-- ═══════════════════════════════════════════════════════════════════════
-- constraint ที่ผูกกับคอลัมน์เหล่านี้ Postgres ลบให้เองพร้อมคอลัมน์
alter table public.stock_sku_config
  drop column use_brand_code,
  drop column brand_len,
  drop column seq_digits,
  drop column separator;

-- ตัวนับ: ของเดิม check (next_seq >= 1) — เลื่อนขอบล่างเป็น 0
-- ไม่ drop ทิ้งเฉย ๆ เพราะยังต้องกันตัวนับติดลบ
-- (stock_intake_create ใช้ค่า pre-increment → ชิ้นแรกได้ 0000)
alter table public.stock_sku_config
  drop constraint stock_sku_config_next_seq_check;
alter table public.stock_sku_config
  add constraint stock_sku_config_next_seq_check check (next_seq >= 0);
alter table public.stock_sku_config
  alter column next_seq set default 0;

-- prefix: ของเดิม '^[A-Z0-9]{0,6}$' → บังคับ 3 ตัวพอดี · ชื่อ constraint ซ้ำ ต้อง drop ก่อน
alter table public.stock_sku_config
  drop constraint stock_sku_config_prefix_check;

-- check เดิมบังคับ [A-Z0-9] อยู่แล้ว → ไม่มีตัวพิมพ์เล็กให้แปลง
-- แต่ {0,6} แปลว่าอาจมีแถวที่ยาวไม่ใช่ 3 → ดีดกลับเป็นค่าเริ่มต้น
-- (ปลอดภัยเพราะยังไม่มีข้อมูลจริง + ผู้ใช้ตั้ง prefix เองได้ในหน้าตั้งค่า)
update public.stock_sku_config
   set prefix     = case when prefix ~ '^[A-Z0-9]{3}$' then prefix else 'STZ' end,
       next_seq   = 0,
       updated_at = now();

-- mirror ฝั่ง client: SKU_PREFIX_RE ใน src/lib/sku.ts
alter table public.stock_sku_config
  add constraint stock_sku_config_prefix_check
  check (prefix ~ '^[A-Z0-9]{3}$');


-- ═══════════════════════════════════════════════════════════════════════
-- SECTION 2 · stock_sku_build — สูตรประกอบ SKU "ที่เดียว" ของทั้งระบบ
-- signature เปลี่ยน (8 → 2 args) → drop ด้วย signature จริงจาก DB (0011) แล้ว re-grant
-- ═══════════════════════════════════════════════════════════════════════
drop function public.stock_sku_build(text, boolean, text, text, integer, bigint, integer, text);

create function public.stock_sku_build(p_prefix text, p_seq bigint)
returns text
language plpgsql
immutable
set search_path to ''
as $function$
begin
  -- pad ให้ครบ 4 หลัก แต่ห้ามตัด: greatest() กัน lpad ตัดหัวเลขที่ยาวกว่า 4
  return p_prefix || '-' || lpad(p_seq::text, greatest(4, length(p_seq::text)), '0');
end;
$function$;

grant execute on function public.stock_sku_build(text, bigint) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- SECTION 3 · stock_sku_preview — อ่านอย่างเดียว ไม่จองเลข (STABLE)
-- signature เปลี่ยน (2 → 0 args) → drop ด้วย signature จริงจาก DB (0011)
-- ═══════════════════════════════════════════════════════════════════════
drop function public.stock_sku_preview(text, text);

create function public.stock_sku_preview()
returns text
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_prefix text;
  v_seq    bigint;
begin
  select c.prefix, c.next_seq
    into v_prefix, v_seq
    from public.stock_sku_config c
   where c.user_id = auth.uid();

  if not found then          -- ไม่มีแถว config → ห้ามล้ม ให้ค่าเริ่มต้นแทน
    v_prefix := 'STZ';
    v_seq    := 0;
  end if;

  return public.stock_sku_build(v_prefix, v_seq);
end;
$function$;

grant execute on function public.stock_sku_preview() to authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- SECTION 4 · stock_intake_create — reproduce ทั้งตัว (build เปลี่ยน signature)
--   plpgsql ไม่ตรวจ dependency ตอน drop → ถ้าไม่ทับในใบเดียวกัน
--   migration จะผ่าน แต่การรับเข้าจะพังตอนกดจริง
--   drop ด้วย 15-arg signature จริงจาก DB (0011, ลงท้าย …text, text = p_note, p_brand_code)
-- ═══════════════════════════════════════════════════════════════════════
drop function public.stock_intake_create(
  text, numeric, integer, text, uuid, uuid, text, text, text,
  public.item_condition, numeric, text[], boolean, text, text);

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
  p_target_price   numeric               default null,
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
         cost_per_unit, qty_total, qty_remaining, target_price, sku,
         status, needs_details, photos, source_transaction_id)
      values
        (v_uid, p_name, p_category, p_brand, p_size, p_color, p_condition,
         p_cost_per_unit, p_qty, p_qty, p_target_price, v_sku,
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
  public.item_condition, numeric, text[], boolean, text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- SECTION 5 · bookkeeping  ← โครงเดียวกับท้ายไฟล์ 0024
-- ═══════════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version) values ('0025')
on conflict do nothing;

notify pgrst, 'reload schema';

commit;
