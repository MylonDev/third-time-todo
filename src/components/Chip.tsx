/** A pill that is on or off, as the Timed length chips are. */
export function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`press min-h-10 cursor-pointer rounded-full border px-3.5 text-sm font-medium ${
        on ? 'bg-accent-dim border-accent-edge text-accent' : 'border-border text-text-muted hover:text-text'
      }`}
    >
      {label}
    </button>
  );
}
