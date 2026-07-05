"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { useToast } from "@/components/providers/ToastProvider";

/** useResource가 돌려주는 리소스 상태. */
export interface Resource<T> {
  data: T;
  setData: Dispatch<SetStateAction<T>>;
  /** 최초 로드 완료 전까지 true. reload 실패 시에도 false로 내려간다. */
  loading: boolean;
  /** 수동 재조회(등록/삭제 후 목록 갱신 등). */
  reload: () => Promise<void>;
}

/**
 * "마운트 시 로드 + 오류 토스트 + 로딩 플래그" 패턴을 한 곳으로 모은다.
 * 여러 설정 화면(멤버/웹훅/에이전트)이 동일한 useState+useEffect+try/catch를 복붙하던 것을 대체.
 *
 * @param load   리소스를 가져오는 async 함수. 항상 최신 클로저가 호출된다.
 * @param initial 초기값(빈 배열 등) — 로드 전 렌더에서 참조 가능하도록.
 * @param deps   이 값들이 바뀌면 자동 재조회(예: [wsId]).
 */
export function useResource<T>(
  load: () => Promise<T>,
  initial: T,
  deps: React.DependencyList,
): Resource<T> {
  const toast = useToast();
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);

  // deps만 재조회 트리거로 쓰고, load 클로저는 항상 최신을 참조(ref).
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    try {
      setData(await loadRef.current());
    } catch (err) {
      toast.error(err);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // deps 변경 시 재조회 — reload는 안정적(ref로 최신 load 참조).
  useEffect(() => {
    void reload();
  }, deps);

  return { data, setData, loading, reload };
}
