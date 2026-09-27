import { cx } from './cx.js';

/**
 * Pill toggle/filter chip (governorates, durations, "any court"…). Selected chips are filled
 * green (`tone: 'primary'`) or ink (`tone: 'night'`); unselected ones are outlined.
 */
export function chipClass(
  selected: boolean,
  { tone = 'primary', className }: { tone?: 'primary' | 'night'; className?: string } = {},
) {
  return cx(
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors duration-200',
    selected
      ? tone === 'night'
        ? 'border-night bg-night text-canvas'
        : 'border-primary bg-primary text-on-primary'
      : 'border-line-strong bg-transparent text-ink hover:border-ink/40 hover:bg-surface',
    className,
  );
}

/** Sport/option tile (22px radius): selected = green filled, otherwise white with a hairline. */
export function tileClass(selected: boolean, className?: string) {
  return cx(
    'flex flex-col justify-between rounded-tile border p-4 transition-[background-color,border-color,transform] duration-200 active:scale-[0.98]',
    selected
      ? 'border-primary bg-primary text-on-primary'
      : 'border-line bg-surface text-ink hover:border-line-strong',
    className,
  );
}
