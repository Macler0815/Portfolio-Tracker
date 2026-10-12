interface DonutChartProps {
  segments: { label: string; value: number; color: string }[];
  centerLabel?: string;
  centerValue?: string;
  size?: number;
}

export function DonutChart({ segments, centerLabel, centerValue, size = 180 }: DonutChartProps) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const radius = size / 2 - 16;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <div
          className="rounded-full border-8 border-gray-200 dark:border-gray-700"
          style={{ width: size - 32, height: size - 32 }}
        />
      </div>
    );
  }

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={16}
          className="stroke-gray-200 dark:stroke-gray-800"
        />
        {segments.map((seg, i) => {
          const len = (seg.value / total) * circumference;
          const dash = `${len} ${circumference - len}`;
          const circle = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={16}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.6s ease, stroke-dasharray 0.6s ease' }}
            />
          );
          offset += len;
          return circle;
        })}
      </svg>
      {(centerLabel || centerValue) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {centerLabel && <span className="text-xs text-gray-500 dark:text-gray-400">{centerLabel}</span>}
          {centerValue && <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">{centerValue}</span>}
        </div>
      )}
    </div>
  );
}
