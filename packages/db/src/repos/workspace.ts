/**
 * workspaceRepo — 03_DATA_MODEL.md §3.
 * create만 예외적으로 workspaceId를 받지 않는다(워크스페이스 자체를 생성).
 */
import { newId } from "@aidetalk/shared";
import { eq } from "drizzle-orm";

import type { Database } from "../client";
import { workspaces, type WidgetSettings } from "../schema/workspaces";

export interface CreateWorkspaceInput {
  name: string;
  segment?: "s1_site" | "s2_no_site";
  plan?: "oss" | "starter" | "pro";
  widgetSettings?: WidgetSettings;
  attributionRule?: "last_click" | "first_click";
}

export function makeWorkspaceRepo(db: Database) {
  return {
    /** 워크스페이스 생성(온보딩). 워크스페이스를 만드는 함수라 workspaceId를 받지 않는다. */
    async create(input: CreateWorkspaceInput) {
      const [row] = await db
        .insert(workspaces)
        .values({
          id: newId("ws"),
          name: input.name,
          segment: input.segment ?? "s1_site",
          plan: input.plan ?? "oss",
          widgetSettings: input.widgetSettings ?? {},
          attributionRule: input.attributionRule ?? "last_click",
        })
        .returning();
      return row!;
    },

    async getById(workspaceId: string) {
      const [row] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
      return row;
    },

    async updateSettings(workspaceId: string, widgetSettings: WidgetSettings) {
      const [row] = await db
        .update(workspaces)
        .set({ widgetSettings, updatedAt: new Date() })
        .where(eq(workspaces.id, workspaceId))
        .returning();
      return row;
    },

    async updatePlan(workspaceId: string, plan: "oss" | "starter" | "pro") {
      const [row] = await db
        .update(workspaces)
        .set({ plan, updatedAt: new Date() })
        .where(eq(workspaces.id, workspaceId))
        .returning();
      return row;
    },
  };
}

export type WorkspaceRepo = ReturnType<typeof makeWorkspaceRepo>;
