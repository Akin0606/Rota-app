import { notFound } from "next/navigation";

import ManagerPickerPreview from "./manager-picker-preview";

// Local dev tool only — hidden on any production build.
export const dynamic = "force-dynamic";

export default function DevLabPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ManagerPickerPreview />;
}
