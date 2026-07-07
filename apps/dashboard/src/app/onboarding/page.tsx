"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Check } from "lucide-react";

import { AuthBrandMark } from "@/components/auth/AuthBrandMark";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormRow } from "@/components/ui/form-row";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { workspaceApi } from "@/lib/api/endpoints";
import { td } from "@/lib/i18n";
import type { Segment } from "@aidetalk/shared";

export default function OnboardingPage() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [segment, setSegment] = useState<Segment>("s1_site");
  const [busy, setBusy] = useState(false);

  // 렌더 시점에 td() 조회 — 모듈 로드 시점 조회를 피한다(다른 화면과 동일 패턴).
  const SEGMENTS: { value: Segment; title: string; desc: string }[] = [
    {
      value: "s1_site",
      title: td("dashboard.onboarding.segmentS1Title"),
      desc: td("dashboard.onboarding.segmentS1Desc"),
    },
    {
      value: "s2_no_site",
      title: td("dashboard.onboarding.segmentS2Title"),
      desc: td("dashboard.onboarding.segmentS2Desc"),
    },
  ];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const ws = await workspaceApi.create({ name, segment });
      router.replace(`/w/${ws.id}/inbox`);
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-md gap-0 py-8 shadow-sm" aria-label={td("dashboard.onboarding.title")}>
        <CardHeader className="gap-1.5 text-center">
          <AuthBrandMark />
          <CardTitle className="text-xl font-semibold tracking-tight">
            {td("dashboard.onboarding.title")}
          </CardTitle>
          <CardDescription>{td("dashboard.onboarding.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="mt-7">
          <form onSubmit={onSubmit}>
            <FormRow label={td("dashboard.onboarding.wsName")} htmlFor="wsName">
              <Input
                id="wsName"
                required
                placeholder={td("dashboard.onboarding.wsNamePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </FormRow>

            <fieldset className="mb-6">
              <legend className="mb-2 text-sm font-medium text-foreground">
                {td("dashboard.onboarding.segmentLabel")}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {SEGMENTS.map((s) => {
                  const selected = segment === s.value;
                  return (
                    <label
                      key={s.value}
                      className={cn(
                        "relative flex cursor-pointer flex-col rounded-lg border p-4 transition-colors outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2",
                        selected
                          ? "border-foreground bg-accent/60"
                          : "border-border hover:border-foreground/40 hover:bg-muted/40",
                      )}
                    >
                      <input
                        type="radio"
                        name="segment"
                        value={s.value}
                        checked={selected}
                        onChange={() => setSegment(s.value)}
                        className="sr-only"
                      />
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground">{s.title}</span>
                        {selected ? (
                          <Check className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
                        ) : null}
                      </span>
                      <span className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {s.desc}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <Button type="submit" className="h-10 w-full" disabled={busy}>
              {td("dashboard.onboarding.createSubmit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
