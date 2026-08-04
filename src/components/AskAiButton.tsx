import { useNavigate } from 'react-router-dom'
import { IconSparkles } from '@tabler/icons-react'
import { useConsent } from '@/hooks/useAiSettings'

/**
 * A contextual "ถาม AI เรื่องนี้" entry for a data screen (งบ / สต็อก / …). When a
 * user is already looking at a screen they usually have a question about THAT screen
 * in mind — this lets them jump into the assistant with a relevant question already
 * typed, instead of opening a blank chat and starting from scratch.
 *
 * Load-bearing rules (task 5b §2):
 *  • Shown ONLY when consent = 'on', exactly like the floating pill in AppLayout —
 *    never_chosen / off / still-loading all render nothing (`useConsent().data`).
 *    We never surface a button that would send the user to /ai only to be bounced
 *    straight back to Settings.
 *  • It navigates to /ai?q=<question>; AiPage prefills the composer from `q` and the
 *    user still presses ส่ง themselves — nothing is auto-sent (every request is real
 *    money). So `question` MUST be something the assistant can actually answer with
 *    an existing tool (see docs/testing/expected-answers.md); a preset it can only
 *    decline is a worse experience than no button at all.
 *  • A single <button> — it must NOT be nested inside another <button> (a past bug
 *    in this project) and is sized to its content (`w-fit`) so it never stretches to
 *    steal the row from a screen's primary actions.
 */
export function AskAiButton({
  question,
  className = '',
}: {
  question: string
  className?: string
}) {
  const navigate = useNavigate()
  const enabled = useConsent().data === 'on'
  if (!enabled) return null
  return (
    <button
      type="button"
      onClick={() => navigate(`/ai?q=${encodeURIComponent(question)}`)}
      className={`inline-flex w-fit min-h-11 items-center gap-1.5 rounded-pill border-[0.5px] border-hairline bg-brand-tint px-3.5 text-[12.5px] font-medium text-brand-ink ${className}`}
    >
      <IconSparkles size={15} className="text-brand-deep" />
      ถาม AI เรื่องนี้
    </button>
  )
}
