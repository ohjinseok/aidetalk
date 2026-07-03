/**
 * 인프라 추상화 인터페이스 — 02_ARCHITECTURE.md §1-1.
 * 추상화는 딱 3곳: DB(Drizzle), 파일 저장, 실시간 전파.
 * DB는 Drizzle이 담당하므로 여기서는 파일 저장/실시간 전파 2개만 정의한다.
 * (WS "연결 보유"는 의도적으로 추상화하지 않는다 — 02 §1-1.)
 */

/** 파일 저장 — 기본 로컬 디스크, 옵션 S3/R2/MinIO. `STORAGE_DRIVER=local|s3`. */
export interface StorageAdapter {
  put(key: string, data: ReadableStream | Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<ReadableStream>;
  delete(key: string): Promise<void>;
  signedUrl(key: string, expiresInSec: number): Promise<string>;
}

/** 실시간 전파 — 기본 Redis, 옵션 in-memory(단일 프로세스). `PUBSUB_DRIVER=redis|memory`. */
export interface PubSubAdapter {
  publish(channel: string, msg: string): Promise<void>;
  /** @returns unsubscribe 함수 */
  subscribe(channel: string, handler: (msg: string) => void): Promise<() => void>;
}
