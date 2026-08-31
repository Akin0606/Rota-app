"use client";

import BottomSheet from "./bottom-sheet";
import ManagerIcon, { type ManagerIconName } from "./icon";

// B5: on an already-built week, the reference tools (export, submitted
// availability, solver notes, re-run auto-fill, copy, whole-week orientation)
// move off the front page and behind a quiet "More ⋯". The primary surface
// stays coverage → approvals → day-view → publish.
type RotaMoreSheetProps = {
  open: boolean;
  onClose: () => void;
  onExport: (fmt: "pdf" | "xlsx") => void;
  exportingFmt: "pdf" | "xlsx" | null;
  onViewImage: () => void;
  onRegenerate: () => void;
  generating: boolean;
  onCopyPrevious: () => void;
  copying: boolean;
  canCopy: boolean;
  /** Published/confirmed — rebuilding pulls the rota off staff first. */
  isLive: boolean;
  /** A past week: nothing here can be rebuilt or copied into. */
  readOnly: boolean;
  orientation: string;
  onToggleOrientation: () => void;
  onToggleAvailability: () => void;
  availabilityOpen: boolean;
  onToggleNotes: () => void;
  notesOpen: boolean;
  notesCount: number;
};

function Row({
  icon,
  label,
  sub,
  onClick,
  disabled,
  active,
}: {
  icon: ManagerIconName;
  label: string;
  sub?: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-[11px] px-2.5 py-3 text-left transition-[transform] hover:bg-surface-subtle active:scale-[0.99] disabled:opacity-50"
    >
      <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-cp-icon text-accent">
        <ManagerIcon name={icon} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium text-ink">{label}</span>
        {sub && <span className="block text-[11.5px] text-ink-muted">{sub}</span>}
      </span>
      {active && <span className="shrink-0 text-[11px] font-medium text-accent">Showing</span>}
    </button>
  );
}

export default function RotaMoreSheet({
  open,
  onClose,
  onExport,
  exportingFmt,
  onViewImage,
  onRegenerate,
  generating,
  onCopyPrevious,
  copying,
  canCopy,
  isLive,
  readOnly,
  orientation,
  onToggleOrientation,
  onToggleAvailability,
  availabilityOpen,
  onToggleNotes,
  notesOpen,
  notesCount,
}: RotaMoreSheetProps) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="More"
      footer={
        <button
          onClick={onClose}
          className="flex-1 rounded-[11px] border-[0.5px] border-hairline py-3 text-[13px] font-medium text-ink-muted"
        >
          Done
        </button>
      }
    >
      <div className="flex flex-col gap-0.5">
        <Row
          icon="file-text"
          label="Download PDF"
          sub="Print-ready, branded"
          onClick={() => onExport("pdf")}
          disabled={exportingFmt !== null}
        />
        <Row
          icon="table"
          label="Download Excel"
          sub="Editable spreadsheet"
          onClick={() => onExport("xlsx")}
          disabled={exportingFmt !== null}
        />
        <Row
          icon="photo"
          label="View as image"
          sub="PNG for WhatsApp"
          onClick={() => {
            onViewImage();
            onClose();
          }}
        />

        <div className="my-1.5 border-t border-hairline" />

        <Row
          icon="eye"
          label="Submitted availability"
          sub="See what each person sent"
          onClick={onToggleAvailability}
          active={availabilityOpen}
        />
        <Row
          icon="info-circle"
          label="Solver notes"
          sub={notesCount > 0 ? `${notesCount} note${notesCount === 1 ? "" : "s"}` : "None"}
          onClick={onToggleNotes}
          disabled={notesCount === 0}
          active={notesOpen}
        />
        <Row
          icon="table"
          label="Whole-week orientation"
          sub={orientation === "staff-rows" ? "Staff × Days" : "Days × Staff"}
          onClick={onToggleOrientation}
        />

        {/* Rebuilding lives down here on purpose. Never re-nag a manager to
            generate a week they already built — and on a live week it is a
            footgun, so it names the consequence instead of hiding it. */}
        {!readOnly && (
          <>
            <div className="my-1.5 border-t border-hairline" />

            <Row
              icon="sparkles"
              label={isLive ? "Rebuild this week" : "Re-run auto-fill"}
              sub={
                isLive
                  ? "Unpublishes first — staff lose the current rota"
                  : "Regenerate from availability"
              }
              onClick={() => {
                onRegenerate();
                onClose();
              }}
              disabled={generating}
            />
            {canCopy && (
              <Row
                icon="calendar-bolt"
                label="Copy from last week"
                sub="Start from last week's rota"
                onClick={() => {
                  onCopyPrevious();
                  onClose();
                }}
                disabled={copying}
              />
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
