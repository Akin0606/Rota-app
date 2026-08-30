import Mark from "@/components/mark";

/**
 * Inline "this is working" label for buttons and rows. The wheel turns while
 * you wait — the same mark, doing the job a spinner would, so waiting always
 * looks like Rotally rather than like a generic control.
 */
export default function Waiting({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Mark spinning className="h-[1em] w-[1em]" />
      {label}
    </span>
  );
}
