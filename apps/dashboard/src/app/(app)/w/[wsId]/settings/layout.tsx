/**
 * 설정 레이아웃 — 하위 탭은 각 페이지의 PageShell 안에서 렌더링되어
 * 콘텐츠 폭·정렬이 페이지별(narrow/wide)로 맞는다. 여기서는 전체 높이만 잡아준다.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-full">{children}</div>;
}
