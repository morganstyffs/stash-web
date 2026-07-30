import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { resetRequestOutcome } from '@/lib/auth'

/**
 * Request a password-reset email. Enumeration-safe (Convention 17): after
 * submit we show the SAME neutral message whether or not the address has an
 * account — Supabase returns success either way, and we never reveal existence.
 */
export function ForgotPasswordPage() {
  const { resetPasswordForEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const { error } = await resetPasswordForEmail(email.trim())
    setBusy(false)
    const outcome = resetRequestOutcome(error)
    setMessage(outcome.message)
    setIsError(!outcome.ok)
    if (outcome.ok) setSent(true)
  }

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm rounded-[26px] border-[0.5px] border-hairline bg-white p-7 shadow-card">
        <div className="mb-6 flex flex-col items-center gap-3">
          <img src="/stash-logo.svg" alt="Stash" className="h-9 w-auto" />
          <p className="text-[13px] text-muted">ตั้งรหัสผ่านใหม่</p>
        </div>

        {sent ? (
          <div className="flex flex-col gap-4">
            <p className="rounded-input bg-fill px-3 py-3 text-[13px] leading-relaxed text-ink">
              {message}
            </p>
            <Link
              to="/login"
              className="text-center text-[13px] font-medium text-brand-deep"
            >
              กลับไปหน้าเข้าสู่ระบบ
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <p className="text-[12.5px] leading-relaxed text-muted">
              กรอกอีเมลที่ใช้สมัคร เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="ml-0.5 text-[11px] text-faint">อีเมล</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[13px] outline-none focus:border-brand"
                placeholder="you@example.com"
              />
            </label>

            {message && isError && <p className="text-[12px] text-expense">{message}</p>}

            <button
              type="submit"
              disabled={busy}
              className="mt-1 rounded-btn bg-brand-deep py-3 text-[14px] font-medium text-white disabled:opacity-60"
            >
              {busy ? 'กำลังส่ง…' : 'ส่งลิงก์ตั้งรหัสใหม่'}
            </button>

            <Link
              to="/login"
              className="mt-1 text-center text-[13px] text-muted"
            >
              กลับไปหน้าเข้าสู่ระบบ
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
