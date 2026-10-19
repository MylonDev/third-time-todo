import { useState } from 'react';
import { usePractices } from '../store/practices';
import type { Practice } from '../types';
import { Modal } from './Modal';

/** Asked when a session ends: write down what to do first next time. Skip leaves the old note alone. */
export function NextStepModal({ practice, onClose }: { practice: Practice; onClose: () => void }) {
  const setNextStep = usePractices((s) => s.setNextStep);
  const [text, setText] = useState('');
  const valid = text.trim() !== '';

  return (
    <Modal label={`Next step for ${practice.name}`} onClose={onClose} size="sm" className="p-5 gap-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          setNextStep(practice.id, text);
          onClose();
        }}
        className="flex flex-col gap-5"
      >
        <div>
          <h2 className="text-lg font-semibold">Next step for {practice.name}?</h2>
          <p className="text-sm text-text-muted">What will you do first next time? Starting is then already decided.</p>
        </div>
        <input
          aria-label="Next step"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Learn the intro"
          className="min-h-12 rounded-2xl border border-border bg-surface-2 px-4 text-base text-text outline-none"
        />
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="press min-h-12 cursor-pointer rounded-full border border-border font-medium text-text-muted hover:text-text"
          >
            Skip
          </button>
          <button
            type="submit"
            disabled={!valid}
            className="press min-h-12 cursor-pointer rounded-full bg-accent font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
