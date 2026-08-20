import { cn } from "@/lib/utils";

const CELL = 163.38;
const HALF = CELL / 2;
const CX = [221.27, 450, 678.73] as const;
const CY = [156.9, 385.63, 614.36, 843.09] as const;
const PLUS: Array<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [2, 1],
  [0, 2],
  [1, 2],
  [2, 2],
  [1, 3],
];

/** Ochieng & Co parent mark: eight 45° squares + vertical bar. */
export function OchiengLogoSimple({
  className,
  size = 40,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 1000 1000"
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
      className={cn(
        "fill-current text-[#231f20] transition-transform duration-300 hover:scale-110",
        className,
      )}
      aria-hidden="true"
    >
      {PLUS.map(([col, row]) => {
        const cx = CX[col];
        const cy = CY[row];
        return (
          <rect
            key={`${col}-${row}`}
            x={cx - HALF}
            y={cy - HALF}
            width={CELL}
            height={CELL}
            transform={`rotate(-45 ${cx} ${cy})`}
          />
        );
      })}
      <rect x={904.24} y={157.08} width={56.53} height={723.45} />
    </svg>
  );
}
