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
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition-[background-color,border-color,color,transform] duration-200 ease-soft active:scale-[0.96]',
    selected
      ? tone === 'night'
        ? 'animate-pop border-night bg-night text-canvas'
        : 'animate-pop border-primary bg-primary text-on-primary'
      : 'border-line-strong bg-transparent text-ink hover:border-ink/40 hover:bg-surface',
    className,
  );
}

/** Sport/option tile (`rounded-tile`): selected = green filled, otherwise a sand fill. */
export function tileClass(selected: boolean, className?: string) {
  return cx(
    'flex flex-col justify-between rounded-tile border p-4 transition-[background-color,border-color,transform,box-shadow] duration-200 ease-soft active:scale-[0.96]',
    selected
      ? 'border-primary bg-primary text-on-primary'
      : 'border-transparent bg-sand-100 text-ink hover:bg-sand-200',
    className,
  );
}
