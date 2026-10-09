export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A row of mutually exclusive buttons. Each is a button with `aria-pressed`
 * rather than a radio, so it works for a choice that acts on tap (start Should)
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
          onClick={() => onChange(o.value)}
          className={`press flex-1 min-h-11 rounded-full px-3 text-sm font-semibold transition-colors cursor-pointer ${
            value === o.value ? 'bg-accent text-on-accent' : 'text-text-muted hover:text-text'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
