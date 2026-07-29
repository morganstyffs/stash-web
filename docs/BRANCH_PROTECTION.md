# Branch Protection (main)

ตั้งค่าให้ **`main` merge ได้ก็ต่อเมื่อ CI ผ่าน** เพื่อกัน type error / build พังหลุดขึ้น production
(บทเรียนจาก PR #31: `npm run typecheck` เป็น no-op → build พังหลุดถึง Cloudflare — ดู audit F-19)

## ตั้งค่าใน GitHub UI
`Settings → Branches → Add branch ruleset` (หรือ `Add rule` แบบเก่า) → target `main`:

- ✅ **Require a pull request before merging** (ห้าม push ตรงเข้า main)
  - ต้องการ approvals กี่คนก็ตั้งได้ (ผู้ใช้คนเดียวตั้ง 0 ได้ แต่ยังบังคับผ่าน PR)
- ✅ **Require status checks to pass before merging**
  - ✅ **Require branches to be up to date before merging**
  - เพิ่ม status check: **`build`** (ชื่อ job ใน `.github/workflows/ci.yml`)
- ✅ **Do not allow bypassing the above settings** (บังคับกับ admin ด้วย ถ้าต้องการเข้ม)

> status check ชื่อ `build` จะโผล่ให้เลือกหลังจาก workflow รันอย่างน้อย 1 ครั้งบน repo แล้ว
> (เปิด/อัปเดต PR สักใบให้ CI รันก่อน แล้วค่อยกลับมาเพิ่มใน ruleset)

## ตั้งผ่าน GitHub CLI (ทางเลือก)
```bash
gh api -X PUT repos/morganstyffs/stash-web/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f 'required_status_checks[strict]=true' \
  -f 'required_status_checks[contexts][]=build' \
  -f 'enforce_admins=true' \
  -f 'required_pull_request_reviews[required_approving_review_count]=0' \
  -f 'restrictions=null'
```

## ลำดับ deploy ที่ถูกต้อง (migration-first)
Client ที่พึ่ง schema ใหม่ **ห้าม merge เข้า main ก่อนรัน migration**:

1. รัน migration ใน Supabase SQL Editor (ครอบ `begin; … commit;`)
2. รัน verification block ในหัวไฟล์ migration
3. ทดสอบ flow จากแอป (ชั่วคราวบน branch/preview)
4. **merge PR ของ client → main** → Cloudflare deploy

กลับลำดับเมื่อไหร่ = แอปพังทันทีที่ build ผ่าน (client เรียก RPC/คอลัมน์ที่ DB ยังไม่มี)
