"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "../../components/providers/ToastProvider";
import { Button } from "@/components/ui/button";
import { FormRow } from "@/components/ui/form-row";
import { Input } from "@/components/ui/input";
import { workspaceApi } from "../../lib/api/endpoints";
import { td } from "../../lib/i18n";
import type { Segment } from "../../lib/api/schemas";

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

export default function OnboardingPage() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [segment, setSegment] = useState<Segment>("s1_site");
  const [busy, setBusy] = useState(false);

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
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xs"
        aria-label={td("dashboard.onboarding.title")}
      >
        <h1 className="text-xl font-semibold">{td("dashboard.onboarding.title")}</h1>
        <p className="mb-5 mt-1 text-sm text-gray-500">{td("dashboard.onboarding.subtitle")}</p>

        <FormRow label={td("dashboard.onboarding.wsName")} htmlFor="wsName">
          <Input
            id="wsName"
            required
            placeholder={td("dashboard.onboarding.wsNamePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FormRow>

        <fieldset className="mb-5">
          <legend className="mb-2 text-sm font-medium text-gray-700">
            {td("dashboard.onboarding.segmentLabel")}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {SEGMENTS.map((s) => (
              <label
                key={s.value}
                className={`cursor-pointer rounded-lg border p-4 ${
                  segment === s.value
                    ? "border-brand ring-1 ring-brand"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="segment"
                  value={s.value}
                  checked={segment === s.value}
                  onChange={() => setSegment(s.value)}
                  className="sr-only"
                />
                <span className="block text-sm font-semibold text-gray-800">{s.title}</span>
                <span className="mt-1 block text-xs text-gray-500">{s.desc}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Button type="submit" className="w-full" disabled={busy}>
          {td("dashboard.onboarding.createSubmit")}
        </Button>
      </form>
    </main>
  );
}
