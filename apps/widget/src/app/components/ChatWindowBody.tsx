import type { WidgetController, WidgetSnapshot } from "../controller";
import { Composer } from "./Composer";
import { EmailPrompt } from "./EmailPrompt";
import { MessageList } from "./MessageList";
import { QuickReplies } from "./QuickReplies";

interface Props {
  snap: WidgetSnapshot;
  controller: WidgetController;
}

/** MessageList + QuickReplies + EmailPrompt + Composer (06 §2). */
export function ChatWindowBody({ snap, controller }: Props) {
  return (
    <>
      <MessageList
        items={snap.items}
        localSystemLines={snap.localSystemLines}
        typing={snap.typing}
        onRetry={(id) => controller.retry(id)}
      />
      <QuickReplies replies={snap.quickReplies} onPick={(txt) => controller.sendQuickReply(txt)} />
      {snap.emailPromptVisible ? (
        <EmailPrompt
          onSubmit={(email) => void controller.submitEmail(email)}
          onSkip={() => controller.skipEmail()}
        />
      ) : null}
      <Composer onSend={(txt) => void controller.sendText(txt)} />
    </>
  );
}
