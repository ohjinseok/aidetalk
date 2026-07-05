import { SettingsTabs } from "@/components/settings/SettingsTabs";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <SettingsTabs />
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
