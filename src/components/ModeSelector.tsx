import { MODE_CONFIG } from '../utils/thirdTime';
import { useSettings } from '../store/settings';
import type { Mode } from '../types';

const MODES: Mode[] = ['quarter', 'third', 'half'];

const colorMap: Record<Mode, { active: string; ring: string }> = {
  quarter: { active: 'bg-orange-500 text-white', ring: 'ring-orange-400' },
  third:   { active: 'bg-purple-600 text-white', ring: 'ring-purple-400' },
  half:    { active: 'bg-teal-600 text-white',   ring: 'ring-teal-400'   },
};

interface Props {
  disabled?: boolean;
}

export function ModeSelector({ disabled = false }: Props) {
  const { mode, setMode } = useSettings();

  return (
    <div className="flex gap-2 flex-wrap justify-center">
      {MODES.map((m) => {
        const cfg = MODE_CONFIG[m];
        const colors = colorMap[m];
        const isActive = mode === m;
        return (
          <button
            key={m}
            onClick={() => !disabled && setMode(m)}
            className={`
              relative px-4 py-3 rounded-xl border-2 text-left transition-all min-w-[160px]
              ${isActive
                ? `${colors.active} border-transparent ring-2 ${colors.ring} shadow-md`
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300'}
              ${disabled && !isActive ? 'opacity-40 cursor-not-allowed' : ''}
              ${!disabled && !isActive ? 'hover:border-gray-300 hover:shadow-sm cursor-pointer' : ''}
            `}
          >
            <div className="font-semibold text-sm">{cfg.label}</div>
            <div className={`text-xs mt-0.5 ${isActive ? 'opacity-80' : 'text-gray-400'}`}>
              {cfg.description}
            </div>
            {isActive && (
              <span className="absolute -top-1.5 -right-1.5 text-[10px] font-bold bg-white text-gray-700 rounded-full px-1.5 py-0.5 shadow border border-gray-200">
                {disabled ? 'locked' : 'active'}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
