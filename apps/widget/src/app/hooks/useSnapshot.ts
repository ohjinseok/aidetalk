import { useEffect, useState } from "preact/hooks";

import type { WidgetController, WidgetSnapshot } from "../controller";

/** 컨트롤러 스냅샷을 구독해 변경 시 리렌더한다. */
export function useSnapshot(controller: WidgetController): WidgetSnapshot {
  const [snap, setSnap] = useState<WidgetSnapshot>(() => controller.getSnapshot());
  useEffect(() => controller.subscribe(() => setSnap(controller.getSnapshot())), [controller]);
  return snap;
}
