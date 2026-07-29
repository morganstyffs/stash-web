import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/Toast'
import { validateNewPassword } from '@/lib/auth'
import { translateError } from '@/lib/errors'

/**
 * Lands here from the reset-password email link. Supabase's detectSessionInUrl
 * exchanges the URL fragment for a temporary recovery session (handled in
 * AuthProvider), so by the time loading settles a valid link means `session` is
 * set. No session after loading → the link was missing/expired/used.
 */
export function ResetPasswordPage() {
  const { session, loading, updatePassword } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const invalid = validateNewPassword(password, confirm)
    if (invalid) {
      setError(invalid)
      return
    }
    setError(null)
    setBusy(true)
    const { error: updErr } = await updatePassword(password)
    setBusy(false)
    if (updErr) {
      setError(translateError(updErr))
      return
    }
    toast.success('ตั้งรหัสผ่านใหม่แล้ว')
    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm rounded-[26px] border-[0.5px] border-hairline bg-white p-7 shadow-card">
        <div className="mb-6 flex flex-col items-center gap-3">
          <img src="/stash-logo.svg" alt="Stash" className="h-9 w-auto" />
          <p className="text-[13px] text-muted">ตั้งรหัสผ่านใหม่</p>
        </div>

        {loading ? (
          <p className="py-4 text-center text-[13px] text-muted">กำลังตรวจสอบลิงก์…</p>
        ) : !session ? (
          <div className="flex flex-col gap-4">
            <p className="rounded-input bg-fill px-3 py-3 text-[13px] leading-relaxed text-ink">
              ลิงก์ตั้งรหัสผ่านไม่ถูกต้องหรือหมดอายุแล้ว — ขอลิงก์ใหม่อีกครั้ง
            </p>
            <Link
              to="/forgot-password"
              className="rounded-btn bg-mint-deep py-3 text-center text-[14px] font-medium text-white"
            >
              ขอลิงก์ใหม่
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="ml-0.5 text-[11px] text-faint">รหัสผ่านใหม่</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[13px] outline-none focus:border-mint"
                placeholder="อย่างน้อย 6 ตัวอักษร"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="ml-0.5 text-[11px] text-faint">ยืนยันรหัสผ่านใหม่</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[13px] outline-none focus:border-mint"
                placeholder="พิมพ์รหัสผ่านอีกครั้ง"
              />
            </label>

            {error && <p className="text-[12px] text-expense">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="mt-1 rounded-btn bg-mint-deep py-3 text-[14px] font-medium text-white disabled:opacity-60"
            >
              {busy ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่านใหม่'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
