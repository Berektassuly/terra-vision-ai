import Link from "next/link";
import { AppSidebar } from "@/components/AppSidebar";

export default function SettingsPage() {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <AppSidebar />
      <main className="flex-1 flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Settings — coming soon.</p>
        <Link href="/" className="ml-2 text-primary underline">Home</Link>
      </main>
    </div>
  );
}
