import { requireOrg } from "@/lib/tenant";
import { NewChatLanding } from "@/components/new-chat-landing";

export const dynamic = "force-dynamic";

export default async function ChatIndexPage() {
  const { user } = await requireOrg();
  return (
    <div className="h-full overflow-y-auto bg-background">
      <NewChatLanding greetingName={user.name ?? undefined} />
    </div>
  );
}
