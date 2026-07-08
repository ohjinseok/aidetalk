/**
 * 인박스 태그 API — 워크스페이스 단위 태그 CRUD(04_API_SPEC.md §2 예정 확장, 03 §3).
 * 생성/수정은 전 멤버 가능. 삭제는 owner 전용(부착된 모든 대화에서 함께 사라지는 파괴적 변경).
 * 대화에 태그를 부착/해제하는 라우트는 여기가 아니라 inbox.ts에 있다(관심사 분리).
 *
 * ⚠️ serialize.ts는 병렬 작업(다른 에이전트) 중이라 여기서는 로컬로 직렬화한다.
 */
import {
  AppError,
  createTagRequestSchema,
  updateTagRequestSchema,
  type CreateTagRequest,
  type Tag,
  type TagColor,
  type UpdateTagRequest,
} from "@aidetalk/shared";
import { Hono } from "hono";

import { validateJson, validated } from "../../http/middleware";
import type { HonoEnv } from "../../http/types";
import { getWsCtx } from "../../http/ws-ctx";
import { assertOwner } from "./shared";

export function createTagRoutes(): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();

  // 목록 — name 오름차순(repo가 정렬).
  app.get("/:wsId/tags", async (c) => {
    const { ctx, wsId } = getWsCtx(c);
    const rows = await ctx.repos.tag.list(wsId);
    return c.json({ items: rows.map(serializeTag), nextCursor: null });
  });

  // 생성 — 전 멤버 가능. (workspaceId, name) 중복이면 conflict.
  app.post("/:wsId/tags", validateJson(createTagRequestSchema), async (c) => {
    const { ctx, wsId } = getWsCtx(c);
    const body = validated<CreateTagRequest>(c);

    const row = await ctx.repos.tag.create(wsId, { name: body.name, color: body.color });
    if (!row) throw AppError.of("conflict", "tag name already exists");
    return c.json({ tag: serializeTag(row) }, 201);
  });

  // 수정 — 전 멤버 가능. name 충돌 시 conflict, 대상 없으면 not_found.
  app.patch("/:wsId/tags/:tagId", validateJson(updateTagRequestSchema), async (c) => {
    const { ctx, wsId } = getWsCtx(c);
    const body = validated<UpdateTagRequest>(c);

    const row = await ctx.repos.tag.update(wsId, c.req.param("tagId"), {
      name: body.name,
      color: body.color,
    });
    if (row === null) throw AppError.of("conflict", "tag name already exists");
    if (row === undefined) throw AppError.of("not_found", "tag not found");
    return c.json({ tag: serializeTag(row) });
  });

  // 삭제 — owner 전용(파괴적 변경: 부착된 모든 대화에서 함께 제거).
  app.delete("/:wsId/tags/:tagId", async (c) => {
    const { ctx, wsId } = getWsCtx(c);
    assertOwner(c.get("member")!);

    const removed = await ctx.repos.tag.remove(wsId, c.req.param("tagId"));
    if (!removed) throw AppError.of("not_found", "tag not found");
    return c.body(null, 204);
  });

  return app;
}

/** tags row → Tag(04 §6). */
function serializeTag(row: {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  createdAt: Date | string;
}): Tag {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    color: row.color as TagColor,
    createdAt: toIsoString(row.createdAt),
  };
}

function toIsoString(v: Date | string): string {
  return typeof v === "string" ? v : v.toISOString();
}
