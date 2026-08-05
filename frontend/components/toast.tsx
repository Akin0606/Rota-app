"use client";

type ToastProps = {
  message: string | null;
};

export default function Toast({ message }: ToastProps) {
  if (!message) return null;

  return (
    <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div className="animate-fadeIn rounded-xl border border-hairline bg-surface-subtle px-4 py-3 text-sm font-medium text-ink shadow-card">
        {message}
      </div>
    </div>
  );
}
