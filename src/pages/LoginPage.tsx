import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export function LoginPage() {
  const { session, signInWithPassword, signUpWithPassword } = useAuth()
  const location = useLocation()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) {
    const from = (location.state as { from?: Location })?.from?.pathname ?? '/'
    return <Navigate to={from} replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    const fn = mode === 'signin' ? signInWithPassword : signUpWithPassword
    const { error } = await fn(email, password)
    setBusy(false)
    if (error) {
      setError(error)
      return
    }
    if (mode === 'signup') {
      setNotice('สมัครสำเร็จ — ถ้าเปิดยืนยันอีเมลไว้ ให้เช็กกล่องอีเมลก่อนเข้าสู่ระบบ')
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm rounded-[26px] border-[0.5px] border-hairline bg-white p-7 shadow-card">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-mint-deep text-lg font-medium text-white">
            S
          </div>
          <div className="text-center">
            <p className="text-lg font-medium">Stash</p>
            <p className="mt-0.5 text-[13px] text-muted">บันทึกรายรับ-รายจ่าย + สต็อก</p>
          </div>
        </div>

        <div className="mb-5 flex rounded-input bg-fill p-[3px]">
          {(['signin', 'signup'] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m)
                setError(null)
                setNotice(null)
              }}
              className={`flex-1 rounded-lg py-2 text-[13px] font-medium transition ${
                mode === m ? 'bg-mint-tint text-mint-text' : 'text-faint'
              }`}
            >
              {m === 'signin' ? 'เข้าสู่ระบบ' : 'สมัครใหม่'}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="ml-0.5 text-[11px] text-faint">อีเมล</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[13px] outline-none focus:border-mint"
              placeholder="you@example.com"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="ml-0.5 text-[11px] text-faint">รหัสผ่าน</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[13px] outline-none focus:border-mint"
              placeholder="อย่างน้อย 6 ตัวอักษร"
            />
          </label>

          {error && <p className="text-[12px] text-expense">{error}</p>}
          {notice && <p className="text-[12px] text-mint-text">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-btn bg-mint-deep py-3 text-[14px] font-medium text-white disabled:opacity-60"
          >
            {busy ? 'กำลังดำเนินการ…' : mode === 'signin' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
          </button>
        </form>
      </div>
    </div>
  )
}
