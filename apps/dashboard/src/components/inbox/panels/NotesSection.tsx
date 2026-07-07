"use client";

import { useEffect, useState } from "react";

import { Lock } from "lucide-react";

import type { ConversationNote } from "@aidetalk/shared";

import { noteApi } from "@/lib/api/endpoints";
import { formatRelativeTime } from "@/lib/format";
import { td } from "@/lib/i18n";
import { useToast } from "@/components/providers/ToastProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Textarea } from "@/components/ui/textarea";
import { DetailsSection } from "../DetailsSidebar";

/**
 * 상담 메모 섹션 — 팀 내부 전용.
 * ⚠️ CLAUDE.md 규칙 9 취지: 메모는 상담원 화면 전용. visitor에게 절대 노출/전송하지 않는다.
 * 데이터는 이 컴포넌트가 noteApi로 직접 소유(대화 진입 시 로드).
 */
export function NotesSection({ wsId, convId }: { wsId: string; convId: string }) {
  const { me } = useWorkspace();
  const toast = useToast();
  const [notes, setNotes] = useState<ConversationNote[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setNotes([]);
    noteApi
      .list(wsId, convId)
      .then((items) => alive && setNotes(items))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [wsId, convId]);

  async function onCreate() {
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    try {
      const note = await noteApi.create(wsId, convId, { body });
      setNotes((prev) => [...prev, note]);
      setDraft("");
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function onSaveEdit(noteId: string) {
    const body = editBody.trim();
    if (!body) return;
    try {
      const updated = await noteApi.update(wsId, noteId, { body });
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      setEditingId(null);
      setEditBody("");
    } catch (err) {
      toast.error(err);
    }
  }

  async function onDelete(noteId: string) {
    try {
      await noteApi.remove(wsId, noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (err) {
      toast.error(err);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <DetailsSection name="notes" title={td("dashboard.notes.title")}>
      <div className="space-y-3">
        {notes.length === 0 ? (
          <p className="text-xs text-muted-foreground">{td("dashboard.notes.empty")}</p>
        ) : (
          <ul className="space-y-2.5">
            {notes.map((n) => {
              const mine = n.authorId === me.user.id;
              const isEditing = editingId === n.id;
              return (
                <li key={n.id} className="rounded-md bg-muted/50 p-2.5">
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate font-medium text-foreground/80">
                      {n.authorName || me.user.name}
                    </span>
                    <span className="shrink-0 tabular-nums">{formatRelativeTime(n.createdAt)}</span>
                  </div>
                  {isEditing ? (
                    <div className="space-y-1.5">
                      <Textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        className="min-h-14 text-[13px]"
                      />
                      <div className="flex gap-1.5">
                        <Button size="xs" onClick={() => void onSaveEdit(n.id)}>
                          {td("dashboard.notes.save")}
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => setEditingId(null)}>
                          {td("dashboard.common.cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap break-words text-[13px] text-foreground">
                        {n.body}
                      </p>
                      {mine ? (
                        <div className="mt-1 flex gap-2 text-[11px]">
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setEditingId(n.id);
                              setEditBody(n.body);
                            }}
                          >
                            {td("dashboard.notes.edit")}
                          </button>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setDeletingId(n.id)}
                          >
                            {td("dashboard.notes.delete")}
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="space-y-1.5">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={td("dashboard.notes.placeholder")}
            className="min-h-16 text-[13px]"
          />
          <div className="flex justify-end">
            <Button size="sm" disabled={saving || !draft.trim()} onClick={() => void onCreate()}>
              {td("dashboard.notes.save")}
            </Button>
          </div>
        </div>

        {/* 내부 전용 안내 — 고객에게 보이지 않음(규칙 9 취지). */}
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Lock className="size-3" aria-hidden />
          {td("dashboard.notes.internalOnly")}
        </p>
      </div>

      <ConfirmDialog
        open={deletingId !== null}
        danger
        message={td("dashboard.notes.deleteConfirm")}
        confirmLabel={td("dashboard.notes.delete")}
        onConfirm={() => deletingId && void onDelete(deletingId)}
        onCancel={() => setDeletingId(null)}
      />
    </DetailsSection>
  );
}
