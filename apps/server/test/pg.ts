/**
 * 통합 테스트용 임시 Postgres 접속 정보.
 * global-setup이 이 URL로 docker 컨테이너를 띄우고 마이그레이션을 적용한다.
 * 테스트 코드는 이 상수로 DB에 연결한다(09 §1: 실제 Postgres 사용, mocking 금지).
 */
export const TEST_PG_CONTAINER = "aidetalk-test-pg";
export const TEST_PG_PORT = 54331;
export const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:${TEST_PG_PORT}/aidetalk_test`;
