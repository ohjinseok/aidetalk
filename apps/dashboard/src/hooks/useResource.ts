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

export interface UseResourceOptions {
  /**
   * 지정 시 로드 실패를 기본 토스트 대신 이 콜백으로 처리한다.
   * (예: 조용히 무시하거나, notFound/에러 문구 상태로 치환)
   */
  onError?: (err: unknown) => void;
  /**
   * true면 deps 변경 시 재조회 전에 data를 initial로 되돌린다.
   * 화면 전환(예: 선택된 대화 변경) 시 이전 데이터 잔상을 막을 때 사용.
   * 기본 false — 기존 사용처(멤버/웹훅/에이전트 목록)는 재조회 중 이전 값을 유지한다.
   */
  resetOnDepsChange?: boolean;
}

/**
 * "마운트 시 로드 + 오류 토스트 + 로딩 플래그" 패턴을 한 곳으로 모은다.
 * 여러 설정 화면(멤버/웹훅/에이전트)이 동일한 useState+useEffect+try/catch를 복붙하던 것을 대체.
 *
 * @param load    리소스를 가져오는 async 함수. 항상 최신 클로저가 호출된다.
 * @param initial 초기값(빈 배열 등) — 로드 전 렌더에서 참조 가능하도록.
 * @param deps    이 값들이 바뀌면 자동 재조회(예: [wsId]).
 * @param options onError/resetOnDepsChange — 필요한 화면만 선택적으로 사용.
 */
export function useResource<T>(
  load: () => Promise<T>,
  initial: T,
  deps: React.DependencyList,
  options?: UseResourceOptions,
): Resource<T> {
  const toast = useToast();
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);

  // deps만 재조회 트리거로 쓰고, load/options 클로저는 항상 최신을 참조(ref).
  const loadRef = useRef(load);
  loadRef.current = load;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const initialRef = useRef(initial);
  initialRef.current = initial;

  const reload = useCallback(async () => {
    try {
      setData(await loadRef.current());
    } catch (err) {
      const onError = optionsRef.current?.onError;
      if (onError) onError(err);
      else toast.error(err);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // deps 변경 시 재조회 — reload는 안정적(ref로 최신 load 참조).
  useEffect(() => {
    if (optionsRef.current?.resetOnDepsChange) {
      setData(initialRef.current);
      setLoading(true);
    }
    void reload();
  }, deps);

  return { data, setData, loading, reload };
}
