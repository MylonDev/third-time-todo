export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** A second, smaller line under the label. */
  hint?: string;
  disabled?: boolean;
}

/**
 * A row of mutually exclusive buttons. Each is a button with `aria-pressed`
 * rather than a radio, so it works for a choice that acts on tap (start Focus)
 * as well as one that only sets a field.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className = '',
}: {
  value: T | null;
  options: SegmentOption<T>[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  // With a hint each button is narrow and two lines tall.
  const dense = options.some((o) => o.hint);
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex gap-1 rounded-full border border-border p-1 ${className}`}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`press flex-1 min-h-11 rounded-full text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
            dense ? 'px-1 py-1' : 'px-3'
          } ${
            value === o.value ? 'bg-accent text-on-accent' : 'text-text-muted hover:text-text'
          }`}
        >
          {o.label}
          {o.hint && <span className="block text-[0.625rem] font-normal leading-tight opacity-80">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}
