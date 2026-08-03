-- ============================================================================
-- Stash — 0029_ai_settings
--
-- ตารางเก็บ "ความยินยอมส่งข้อมูลไปประมวลผลที่ผู้ให้บริการ AI (Anthropic)" ต่อผู้ใช้
-- ใบแรกสุดของฟีเจอร์ AI Chat (ดู docs/ai-assistant-design.md §3.5 / §3.5.1 / PR-0)
-- **ใบนี้ยังไม่มีคนอ่าน ยังไม่มีคนเขียน** — worker เช็ค consent อยู่ใน PR-1, UI สวิตช์
-- + ตัวเขียนอยู่ใน PR-4 · ตารางนี้เป็นแค่ที่เก็บ (backend ล้วน ไม่แตะ src/)
--
-- ── ทำไม consent ต้องเก็บฝั่งเซิร์ฟเวอร์ (ไม่ใช่ localStorage) ─────────────────
-- toggle "ใช้ผู้ช่วย AI" เดิมอยู่ใน localStorage (stash.prefs.ai) = ผูกกับเครื่อง
-- ไม่ใช่บัญชี และ worker ตรวจไม่ได้ · สิ่งที่ไหลออกคือข้อมูลการเงินของผู้ใช้ไปยัง
-- บุคคลที่สาม — ต้องยินยอมรายบุคคลที่ worker เช็คเองก่อนเรียก Anthropic (ห้ามเชื่อ
-- flag จาก client เหมือนไม่เชื่อ user_id จาก body) · แหล่งความจริงของ consent = ตารางนี้
--
-- ── ทำไมตารางแยก ไม่ใช่คอลัมน์ใน profiles ───────────────────────────────────
-- profiles มี RLS `profiles_select_own_or_friend` (0015) ที่เปิดให้เพื่อนที่ accepted
-- แล้ว SELECT แถวเราได้ → ถ้าวาง consent บน profiles เพื่อนจะเห็นสถานะ consent ของเรา
-- consent เป็น "ตัวควบคุมความเป็นส่วนตัว" ไม่ควรรั่วให้ใครแม้บูลีนเดียว · ตารางนี้เป็น
-- single-owner (RLS `auth.uid()=user_id`) แบบเดียวกับ wallets/wallet_transfers —
-- ไม่มี cross-user จึงไม่แตะโมเดล DEFINER ของกลุ่มยอดค้าง (design doc §3.5)
--
-- ── "ไม่มีแถว" = ไม่ยินยอม · ไม่ backfill · ไม่แตะ seed (design doc §3.5.1) ────
-- ทุกบัญชีถูกสร้างไปแล้ว (handle_new_user → seed_defaults_internal เกิดไปหมดแล้ว)
-- → ตารางนี้ว่างในวันสร้าง · ตัดสินแล้วว่า **นิยาม "ไม่มีแถว" = consent=false เป๊ะ**:
--   • ไม่ backfill (ไม่มี DML วน auth.users) → migration additive ล้วน review ง่าย
--   • ไม่แตะ seed_defaults_internal → ผู้ใช้ใหม่ก็เริ่มแบบ "ไม่มีแถว" เท่าผู้ใช้เดิม
--     (สม่ำเสมอ + UI เห็นคำอธิบายยินยอมครั้งแรกเหมือนกัน) · **ผลพลอยได้: ใบนี้ไม่ต้อง
--     reproduce seed เลย** ซึ่งเป็นห่วงโซ่ที่เปราะที่สุดของโปรเจกต์ (0015→…→0026)
--   • worker (PR-1) ต้องแปล query ที่คืน 0 แถว → "ไม่ยินยอม" (403) ไม่ใช่ error/500 —
--     .maybeSingle() คืน data=null ไม่ใช่ error · fail closed เดียวกับ consent=false
-- default false บนคอลัมน์เป็น backstop: ถ้ามีแถวแต่ไม่ได้ระบุ consent ก็ได้ false
--
-- ── ไม่มี DELETE policy โดยตั้งใจ ────────────────────────────────────────────
-- ลบแถว = ย้อนกลับไปสถานะ "ยังไม่เคยเลือก" (row หาย) ซึ่งขัดเจตนาที่ใช้ "ไม่มีแถว"
-- แทน "ยังไม่เคยตอบ" (§3.5.1: row หาย = โชว์คำอธิบายครั้งแรก · consent=false = กดปิดแล้ว
-- ไม่ต้องนัดซ้ำ) · การเปลี่ยนใจใช้ update consent=false ไม่ใช่ลบแถว · **นี่ตั้งใจ
-- ไม่ใช่ลืม** (แนวเดียวกับคอมเมนต์ล็อกของ token scrim ที่ "do NOT add a dark variant")
--
-- ── SECURITY: single-owner ล้วน · ไม่มี cross-user ──────────────────────────
-- automatic RLS ของ Supabase เปิด RLS ให้ตารางใหม่ แต่ไม่สร้าง policy → เขียนเอง
-- ครบ (select/insert/update; ไม่มี delete) · ไม่มี grant ระดับตาราง (ไฟล์ล่าสุด
-- 0028 wallet_transfers ก็ไม่มี — ตารางใน public พึ่ง default privileges ของ Supabase)
--
-- ไฟล์ใหม่ล้วน (ล่าสุดในดิสก์คือ 0028 → ใบนี้ 0029 · นับจาก `ls migrations/*.sql`)
-- ไม่แก้ไฟล์ที่ apply แล้ว · รันใน Supabase SQL Editor ในฐานะ owner · ครอบ begin;…commit;
--
-- ── PRE-FLIGHT (รันก่อน — ยืนยันสถานะจริง; query DB จาก agent ไม่ได้จึงฝากไว้) ─
--   -- 1) เลข migration ล่าสุดที่บันทึกไว้ (คาด 0028):
--   select max(version) from public.schema_migrations;
--   -- 2) ai_settings ต้องยังไม่มี:
--   select to_regclass('public.ai_settings');   -- คาด: null
--   -- 3) ฟังก์ชัน trigger set_updated_at ต้องมีอยู่แล้ว (ใช้ซ้ำจาก 0001 ไม่สร้างใหม่):
--   select proname from pg_proc where proname = 'set_updated_at';   -- คาด: 1 แถว
--
-- ── SMOKE TEST (รันหลัง commit — พิสูจน์ว่า "ทำงาน" ไม่ใช่แค่ "มีอยู่") ──────────
--   ก้อนเดียว begin;…rollback; — ไม่มีแถวใดรอด · impersonate ผ่าน request.jwt.claims +
--   สลับ role เป็น authenticated (SQL Editor รันในฐานะ owner ที่ BYPASS RLS — ถ้าไม่สลับ
--   ทุก assertion เรื่อง RLS จะผ่านหลอก ๆ) · เทสต์เจ้าของ-เดี่ยว (1/3/4) รันได้ด้วยผู้ใช้
--   1 คน · เทสต์ข้ามผู้ใช้ (2/5/6) ต้องมีผู้ใช้ ≥2 คน — ถ้ามีคนเดียวจะประกาศ 'NOT PROVEN'
--   ไม่ใช่ผ่านเงียบ ๆ · **(6) ลบแถว B ทิ้งก่อน (สลับกลับเป็น owner ชั่วคราว) ให้ insert ล้ม
--   จาก RLS with-check "ทางเดียว" ไม่ปนกับ PK ซ้ำ** · ท้ายบล็อกพิมพ์ 'PROVEN X/6' บรรทัดเดียว
--   ถ้า assert ใดล้ม → หยุดรายงาน อย่า patch
--
--   begin;
--   do $$
--   declare
--     v_owner   text := current_user;   -- role ที่รัน (bypass RLS) — จับไว้ก่อนสลับ เพื่อสลับกลับได้
--     v_me uuid; v_other uuid;
--     v_consent boolean; v_default boolean; v_cnt int; v_err boolean;
--     v_proven  int := 0;               -- นับ assertion ที่ "พิสูจน์จริง" (ไม่ใช่ข้าม)
--   begin
--     select id into v_me from auth.users order by id limit 1;
--     if v_me is null then
--       raise notice 'NOT PROVEN: ไม่มีผู้ใช้ในระบบ — พิสูจน์อะไรไม่ได้ (PROVEN 0/6)'; return;
--     end if;
--     -- คนที่สอง (อาจ null ถ้ามีผู้ใช้คนเดียว → เทสต์ข้ามผู้ใช้จะถูกประกาศว่า NOT PROVEN)
--     select id into v_other from auth.users where id <> v_me order by id limit 1;
--
--     -- seed แถวของ B ตอนยังเป็น owner (bypass RLS) เพื่อทดสอบว่า A มองไม่เห็น/แก้ไม่ได้
--     if v_other is not null then
--       insert into public.ai_settings (user_id, consent) values (v_other, true);
--     end if;
--
--     -- ── สลับเป็นผู้ใช้ A (RLS มีผลตั้งแต่บรรทัดนี้ไป) ──
--     perform set_config('request.jwt.claims', json_build_object('sub', v_me)::text, true);
--     perform set_config('role', 'authenticated', true);
--
--     -- ── เทสต์เจ้าของ-เดี่ยว (ต้องการแค่ผู้ใช้ A) ──
--     -- (1) A ยังไม่มีแถว → 0 แถว ไม่ error (เคสที่ worker แปลเป็น "ไม่ยินยอม" = 403)
--     select count(*) into v_cnt from public.ai_settings;
--     assert v_cnt = 0, '1: no-row ควรได้ 0 แถว (ไม่ error)';
--     v_proven := v_proven + 1;
--
--     -- (3) default: insert โดยไม่ระบุอะไรเลย → user_id = auth.uid() (default), consent = false (default)
--     insert into public.ai_settings default values;
--     select consent into v_default from public.ai_settings where user_id = v_me;
--     assert v_default = false, '3: default consent ต้องเป็น false (และ default auth.uid() ต้องเซ็ต user_id)';
--     v_proven := v_proven + 1;
--
--     -- (4) A เขียน (update) + อ่านแถวตัวเองได้
--     update public.ai_settings set consent = true where user_id = v_me;
--     select consent into v_consent from public.ai_settings where user_id = v_me;
--     assert v_consent = true, '4: ผู้ใช้เขียน/อ่านแถวตัวเองไม่ได้';
--     v_proven := v_proven + 1;
--
--     -- ── เทสต์ข้ามผู้ใช้ (ต้องมีผู้ใช้ B) ──
--     if v_other is null then
--       raise notice 'NOT PROVEN (ข้ามผู้ใช้): มีผู้ใช้คนเดียว — RLS select/update/insert ยังไม่ได้พิสูจน์';
--     else
--       -- (2) A มองไม่เห็นแถวของ B (RLS select)
--       select count(*) into v_cnt from public.ai_settings where user_id = v_other;
--       assert v_cnt = 0, '2: ผู้ใช้ A เห็นแถวของผู้ใช้ B (RLS select รั่ว)';
--       v_proven := v_proven + 1;
--
--       -- (5) A แก้แถวของ B ไม่ได้ (RLS using → 0 rows affected ไม่ใช่ error)
--       update public.ai_settings set consent = false where user_id = v_other;
--       get diagnostics v_cnt = row_count;
--       assert v_cnt = 0, '5: ผู้ใช้ A แก้แถวของผู้ใช้ B ได้ (RLS update รั่ว)';
--       v_proven := v_proven + 1;
--
--       -- (6) A สร้างแถวให้ B ไม่ได้ — raise ต้องมาจาก RLS with-check "ทางเดียว":
--       --     ลบแถว B ทิ้งก่อน (สลับกลับเป็น owner ชั่วคราว) เพื่อตัดโอกาส raise เพราะ PK ซ้ำ
--       --     (เทสต์ที่ผ่านด้วยเหตุผลผิด = ตระกูล debt_create ที่รอด verification เพราะไม่มีใครเรียกจริง)
--       perform set_config('role', v_owner, true);          -- กลับเป็น owner (bypass RLS)
--       delete from public.ai_settings where user_id = v_other;
--       perform set_config('role', 'authenticated', true);  -- กลับเป็น A (claims ยังเป็น A)
--       v_err := false;
--       begin
--         insert into public.ai_settings (user_id, consent) values (v_other, true);
--       exception when others then v_err := true; end;
--       assert v_err, '6: ผู้ใช้ A สร้างแถวให้ผู้ใช้ B ได้ (RLS insert with check รั่ว)';
--       v_proven := v_proven + 1;
--     end if;
--
--     raise notice 'SMOKE DONE — PROVEN %/6 assertion (ครบ 6/6 เมื่อมีผู้ใช้ ≥2 คน)', v_proven;
--   end $$;
--   rollback;
-- ============================================================================

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1 · ai_settings — ความยินยอมส่งข้อมูลไป Anthropic (1 แถว/user)
--   user_id เป็น PK (1 แถว/user พอ) → ไม่ต้องมี index เพิ่ม (PK index ใช้ lookup ได้)
--   default auth.uid() ตามแพทเทิร์นตารางที่ผู้ใช้เป็นเจ้าของ (transactions/
--   wallet_transfers) → client/RPC ไม่ต้องส่ง user_id เอง · on delete cascade:
--   ลบบัญชี = ลบ consent ตาม
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.ai_settings (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  consent    boolean not null default false,
  updated_at timestamptz not null default now()
);

-- updated_at trigger (reuses public.set_updated_at() from 0001 — ไม่สร้างใหม่)
drop trigger if exists set_updated_at on public.ai_settings;
create trigger set_updated_at before update on public.ai_settings
  for each row execute function public.set_updated_at();

-- RLS single-owner: select / insert / update (ไม่มี delete โดยตั้งใจ — ดูหัวไฟล์)
alter table public.ai_settings enable row level security;

drop policy if exists ai_settings_select_own on public.ai_settings;
create policy ai_settings_select_own on public.ai_settings
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists ai_settings_insert_own on public.ai_settings;
create policy ai_settings_insert_own on public.ai_settings
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists ai_settings_update_own on public.ai_settings;
create policy ai_settings_update_own on public.ai_settings
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- จงใจไม่มี delete policy: ลบแถว = ย้อนไปสถานะ "ยังไม่เคยเลือก" ซึ่งขัดเจตนา
-- ที่ใช้ "ไม่มีแถว" แทน "ยังไม่เคยตอบ" (§3.5.1) · เปลี่ยนใจใช้ update consent=false


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 · bookkeeping  ← โครงเดียวกับท้ายไฟล์ 0028
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version) values ('0029')
on conflict do nothing;

notify pgrst, 'reload schema';

commit;
