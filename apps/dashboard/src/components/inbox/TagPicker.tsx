"use client";

import { useMemo, useState } from "react";

import { Check, Plus } from "lucide-react";

import type { TagColor } from "@aidetalk/shared";

import { ApiError } from "@/lib/api/client";
import { tagApi } from "@/lib/api/endpoints";
import { td, tf, type TranslationKey } from "@/lib/i18n";
import { TAG_COLOR_CLASSES } from "@/lib/tag-colors";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/providers/ToastProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useInboxFilter } from "./InboxFilterProvider";

const COLOR_LABEL_KEY: Record<TagColor, TranslationKey> = {
  gray: "dashboard.tags.colorGray",
  red: "dashboard.tags.colorRed",
  orange: "dashboard.tags.colorOrange",
  amber: "dashboard.tags.colorAmber",
  green: "dashboard.tags.colorGreen",
  teal: "dashboard.tags.colorTeal",
  blue: "dashboard.tags.colorBlue",
  indigo: "dashboard.tags.colorIndigo",
  purple: "dashboard.tags.colorPurple",
  pink: "dashboard.tags.colorPink",
};
const COLOR_ORDER = Object.keys(COLOR_LABEL_KEY) as TagColor[];

/**
 * 태그 부착 피커 — Popover + 검색. 기존 태그 클릭으로 부착/해제, 없으면 새로 만들어 부착.
 * 태그 목록은 useInboxFilter가 단일 출처(사이드바·목록과 공유). 색은 10색 팔레트에서 선택.
 */
export function TagPicker({
  attachedIds,
  onChange,
}: {
  attachedIds: string[];
  /** 부착 목록 통째 교체 — useConversation.setTagIds로 연결(낙관+롤백). */
  onChange: (next: string[]) => void;
}) {
  const { workspace } = useWorkspace();
  const { tags, reloadTags } = useInboxFilter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [color, setColor] = useState<TagColor>("gray");
  const [creating, setCreating] = useState(false);

  const attached = useMemo(() => new Set(attachedIds), [attachedIds]);
  const q = query.trim();
  const filtered = useMemo(() => {
    const lower = q.toLowerCase();
    return tags.filter((t) => (lower ? t.name.toLowerCase().includes(lower) : true));
  }, [tags, q]);
  const exactExists = tags.some((t) => t.name.toLowerCase() === q.toLowerCase());

  function toggle(tagId: string) {
    if (attached.has(tagId)) onChange(attachedIds.filter((id) => id !== tagId));
    else onChange([...attachedIds, tagId]);
  }

  async function createAndAttach() {
    if (!q || creating) return;
    setCreating(true);
    try {
      const tag = await tagApi.create(workspace.id, { name: q, color });
      await reloadTags();
      onChange([...attachedIds, tag.id]);
      setQuery("");
      setColor("gray");
    } catch (err) {
      if (err instanceof ApiError && err.code === "conflict") {
        toast.toast("error", td("dashboard.tags.duplicate"));
      } else {
        toast.error(err);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="xs" className="gap-1 border-dashed text-muted-foreground">
          <Plus className="size-3" aria-hidden />
          {td("dashboard.tags.add")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={td("dashboard.tags.searchPlaceholder")}
          className="h-8 text-[13px]"
        />

        <div className="mt-2 max-h-52 overflow-y-auto">
          {filtered.length === 0 && !q ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">{td("dashboard.tags.empty")}</p>
          ) : (
            filtered.map((t) => {
              const isOn = attached.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggle(t.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent"
                >
                  <span
                    className={cn(
                      "size-2.5 shrink-0 rounded-full",
                      (TAG_COLOR_CLASSES[t.color] ?? TAG_COLOR_CLASSES.gray).dot,
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  {isOn ? <Check className="size-3.5 shrink-0 text-primary" aria-hidden /> : null}
                </button>
              );
            })
          )}
        </div>

        {q && !exactExists ? (
          <div className="mt-2 border-t border-border pt-2">
            {/* 색 선택 — 단색 dot 팔레트(간단). 기본 회색. */}
            <div className="mb-2 flex flex-wrap gap-1.5 px-1">
              {COLOR_ORDER.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={td(COLOR_LABEL_KEY[c])}
                  aria-pressed={color === c}
                  className={cn(
                    "size-4 rounded-full ring-offset-1 ring-offset-popover transition-shadow",
                    TAG_COLOR_CLASSES[c].dot,
                    color === c ? "ring-2 ring-ring" : "",
                  )}
                />
              ))}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start gap-1.5 text-[13px]"
              disabled={creating}
              onClick={() => void createAndAttach()}
            >
              <Plus className="size-3.5" aria-hidden />
              {tf("dashboard.tags.createWithName", { name: q })}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
