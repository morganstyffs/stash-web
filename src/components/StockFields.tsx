import { useRef, type ChangeEvent, type ReactNode } from 'react'
import { IconCameraPlus, IconX } from '@tabler/icons-react'
import type { ItemCondition } from '@/lib/database.types'

/** A photo being edited: storage `path` + a displayable `preview` URL. */
export interface EditablePhoto {
  path: string
  preview: string
}

export const CONDITIONS: { key: ItemCondition; label: string }[] = [
  { key: 'new', label: 'ของใหม่' },
  { key: 'used_good', label: 'มือสอง · ดี' },
  { key: 'flawed', label: 'มีตำหนิ' },
]

export function Label({ children }: { children: ReactNode }) {
  return <p className="mb-1 ml-0.5 text-[11px] text-faint">{children}</p>
}

export function TextInput({
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  inputMode?: 'text' | 'numeric' | 'decimal'
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      className="w-full rounded-input border-[0.5px] border-hairline bg-fill px-[11px] py-[10px] text-[13px] outline-none placeholder:text-faint focus:border-mint"
    />
  )
}

export function ConditionChips({
  value,
  onChange,
}: {
  value: ItemCondition | ''
  onChange: (v: ItemCondition | '') => void
}) {
  return (
    <div className="flex gap-[7px]">
      {CONDITIONS.map((c) => {
        const active = value === c.key
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(active ? '' : c.key)}
            className={`rounded-pill px-[14px] py-1.5 text-[12px] ${
              active
                ? 'bg-mint-tint font-medium text-mint-text'
                : 'border-[0.5px] border-hairline text-muted'
            }`}
          >
            {c.label}
          </button>
        )
      })}
    </div>
  )
}

/** Camera-add tile + uploaded thumbnails with remove buttons. */
export function PhotoEditor({
  photos,
  onAdd,
  onRemove,
  uploading,
}: {
  photos: EditablePhoto[]
  onAdd: (files: File[]) => void
  onRemove: (path: string) => void
  uploading: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  function pick(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length) onAdd(files)
  }
  return (
    <div className="flex flex-wrap gap-[10px]">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex h-[58px] w-[58px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[11px] border-[1.5px] border-dashed border-chevron"
      >
        <IconCameraPlus size={19} className="text-faint" />
        <span className="text-[9px] text-faint">{uploading ? '…' : 'รูป'}</span>
      </button>
      {photos.map((p) => (
        <div key={p.path} className="relative h-[58px] w-[58px] shrink-0">
          <img src={p.preview} alt="" className="h-full w-full rounded-[11px] object-cover" />
          <button
            type="button"
            aria-label="ลบรูป"
            onClick={() => onRemove(p.path)}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-white"
          >
            <IconX size={12} />
          </button>
        </div>
      ))}
      <input ref={ref} type="file" accept="image/*" multiple hidden onChange={pick} />
    </div>
  )
}

/** True when any required detail is still missing (drives needs_details). */
export function computeNeedsDetails(f: {
  size: string
  color: string
  condition: ItemCondition | ''
  target: number | null
  photoCount: number
}): boolean {
  return (
    !f.size.trim() || !f.color.trim() || !f.condition || f.target == null || f.photoCount === 0
  )
}
