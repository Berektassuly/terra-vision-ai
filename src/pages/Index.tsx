import { AppSidebar } from "@/components/AppSidebar";
import { ChatArea } from "@/components/ChatArea";

const Index = () => {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <AppSidebar />
      <ChatArea />
    </div>
  );
};

export default Index;
