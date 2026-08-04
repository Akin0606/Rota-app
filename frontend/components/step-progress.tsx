type StepProgressProps = {
  total: number;
  current: number;
};

export default function StepProgress({ total, current }: StepProgressProps) {
  return (
    <div className="mb-7 flex gap-1">
      {Array.from({ length: total }, (_, i) => i + 1).map((step) => (
        <div
          key={step}
          className={`h-1 flex-1 rounded-full transition-colors ${
            step <= current ? "bg-accent" : "bg-unset-border"
          }`}
        />
      ))}
    </div>
  );
}
