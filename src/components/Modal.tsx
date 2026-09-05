import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Nested overlays must not each restore `overflow` on the way out. */
let scrollLocks = 0;

function lockScroll(): () => void {
  if (scrollLocks === 0) document.body.style.overflow = 'hidden';
  scrollLocks += 1;
  return () => {
    scrollLocks -= 1;
    if (scrollLocks === 0) document.body.style.overflow = '';
  };
}

export interface ModalProps {
  /**
   * Called on Escape, on a scrim click, and by whatever close control the
   * caller renders. Omit it for a modal that demands a decision — the session
   * restore prompt has no safe default, so it offers no way out but a choice.
   */
  onClose?: () => void;
  /** Announced as the dialog's name. */
  label: string;
  /** `center` for a dialog, `sheet` for the panel that slides in from the right. */
  variant?: 'center' | 'sheet';
  /** Width of a centered dialog. Ignored by `sheet`. */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  children: ReactNode;
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' } as const;

/**
 * The shell every overlay in the app sits in.
 *
 * Each of them used to hand-roll its own scrim, at its own opacity and z-index,
 * and none announced itself as a dialog, trapped focus, locked the page behind
 * it, or closed on Escape. They share this one now, so the behaviour is the
 * same wherever you meet it.
 */
export function Modal({
  onClose,
  label,
  variant = 'center',
  size = 'md',
  className = '',
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dismissible = onClose !== undefined;

  useEffect(lockScroll, []);

  // Send focus into the dialog, and put it back where it came from on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();
    return () => previous?.focus?.();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;

      // Keep Tab inside the dialog rather than letting it wander the page behind.
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [dismissible, onClose]
  );

  const isSheet = variant === 'sheet';

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex ${isSheet ? 'justify-end' : 'items-center justify-center p-4'}`}
      onKeyDown={handleKeyDown}
    >
      <div
        className="absolute inset-0 backdrop-blur-sm bg-black/50"
        onClick={dismissible ? onClose : undefined}
        aria-hidden="true"
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={
          isSheet
            ? `relative w-full max-w-sm h-full flex flex-col shadow-2xl overflow-y-auto border-l outline-none ${className}`
            : `relative rounded-2xl shadow-2xl w-full ${SIZES[size]} flex flex-col border outline-none ${className}`
        }
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        initial={isSheet ? { x: '100%' } : { opacity: 0, y: 40, scale: 0.97 }}
        animate={isSheet ? { x: 0 } : { opacity: 1, y: 0, scale: 1 }}
        exit={isSheet ? { x: '100%' } : { opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: 'spring', damping: 22, stiffness: 280 }}
      >
        {children}
      </motion.div>
    </div>,
    document.body
  );
}
