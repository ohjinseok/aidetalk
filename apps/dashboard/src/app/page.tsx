import { getWelcomeMessage } from "../lib/greeting";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-lg">{getWelcomeMessage()}</p>
    </main>
  );
}
