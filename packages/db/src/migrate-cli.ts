/**
 * 마이그레이션 CLI 진입점 — `pnpm db:migrate`(= tsx src/migrate-cli.ts).
 * 이 파일은 오직 CLI로만 실행되며 어떤 모듈도 이걸 import하지 않는다.
 * (부수효과 없는 runMigrations는 ./migrate에 있다 — 서버 번들에는 그쪽만 인라인된다.)
 */
import { runMigrations } from "./migrate";

runMigrations()
  .then(() => {
    console.log("마이그레이션 완료");
    process.exit(0);
  })
  .catch((err) => {
    console.error("마이그레이션 실패:", err);
    process.exit(1);
  });
