import { AppSidebar } from "@/components/AppSidebar";
import { ChatArea } from "@/components/ChatArea";

export default function HomePage() {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <AppSidebar />
      <ChatArea />
    </div>
  );
}
