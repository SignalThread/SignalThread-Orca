import { Suspense } from "react";
import ResetInner from "./reset-inner";

export default function ResetPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <ResetInner />
    </Suspense>
  );
}
