type ShiftBadgeProps = {
  name: string;
  time?: string;
  color: string;
};

export default function ShiftBadge({ name, time, color }: ShiftBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: `${color}22`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {name}
      {time && <span className="font-normal opacity-70">{time}</span>}
    </span>
  );
}
