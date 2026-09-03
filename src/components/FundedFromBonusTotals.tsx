import { formatRupiah } from '../lib/format'
import {
  FUNDED_FROM_BONUS_LABEL,
  FUNDED_FROM_BONUS_LABEL_CLASS,
} from '../lib/types'

interface FundedFromBonusTotalsProps {
  target: number
  remaining: number
}

/** Target vs remaining for sinking funds filled from bonus income. */
export function FundedFromBonusTotals({
  target,
  remaining,
}: FundedFromBonusTotalsProps) {
  return (
    <div className="rounded-xl bg-white px-3 py-2.5 text-xs shadow-sm dark:bg-neutral-800">
      <p className={`mb-1.5 font-medium ${FUNDED_FROM_BONUS_LABEL_CLASS}`}>
        {FUNDED_FROM_BONUS_LABEL}
      </p>
      <div className="grid grid-cols-2 gap-2 tabular-nums">
        <div>
          <p className="text-[10px] text-neutral-400">Target</p>
          <p className={`font-semibold ${FUNDED_FROM_BONUS_LABEL_CLASS}`}>
            {formatRupiah(target)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-neutral-400">Remaining</p>
          <p className={`font-semibold ${FUNDED_FROM_BONUS_LABEL_CLASS}`}>
            {formatRupiah(remaining)}
          </p>
        </div>
      </div>
    </div>
  )
}
