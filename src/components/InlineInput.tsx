import type { InputHTMLAttributes } from 'react';

type NativeProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onKeyDown'>;

export interface InlineInputProps extends NativeProps {
  /** Enter. Also what `onBlur` should usually do — pass it there too. */
  onCommit: () => void;
  /** Escape. Put the value back the way it was and close the editor. */
  onCancel: () => void;
}

/**
 * The field you get when you click something to rename or retime it.
 *
 * Seven of these were written out by hand, each repeating the same Enter /
 * Escape block and the same accent-bordered styling. Escape now also stops
 * propagating: without that, cancelling an edit inside a dialog bubbles up
 * and closes the whole dialog with it.
 */
export function InlineInput({
  onCommit,
  onCancel,
  className = '',
  style,
  ...rest
}: InlineInputProps) {
  return (
    <input
      {...rest}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onCommit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          // Both layers: React's, and the native event, which is what an
          // enclosing Modal listens for on `document`.
          e.stopPropagation();
          e.nativeEvent.stopPropagation();
          onCancel();
        }
      }}
      className={`rounded-lg px-2 py-1 outline-none border transition-colors ${className}`}
      style={{
        background: 'var(--color-surface-2)',
        color: 'var(--color-text)',
        borderColor: 'var(--color-accent)',
        ...style,
      }}
    />
  );
}
