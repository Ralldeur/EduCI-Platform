"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import ChatSidebar from "@/components/chat/ChatSidebar";
import { GraduationCap } from "lucide-react";
import toast from "react-hot-toast";
import type { ConversationSummary, ConversationMode } from "@/types";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const activeId = pathname.split("/chat/")[1];

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch {
      console.error("Failed to fetch conversations");
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchConversations();
    }
  }, [status, fetchConversations]);

  // Refresh conversations when pathname changes (new conversation created)
  useEffect(() => {
    if (status === "authenticated") {
      fetchConversations();
    }
  }, [pathname, status, fetchConversations]);

  const handleNewConversation = async (mode: ConversationMode) => {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          gradeLevel: session?.user?.gradeLevel,
        }),
      });

      if (res.ok) {
        const conv = await res.json();
        await fetchConversations();
        router.push(`/chat/${conv.id}`);
        setIsMobileOpen(false);
      }
    } catch {
      toast.error("Erreur lors de la création");
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchConversations();
        if (activeId === id) {
          router.push("/chat");
        }
      }
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">
          <GraduationCap size={48} className="text-[var(--color-primary)]" />
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="h-screen flex overflow-hidden">
      <ChatSidebar
        conversations={conversations}
        activeId={activeId}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        isMobileOpen={isMobileOpen}
        onMobileToggle={() => setIsMobileOpen(!isMobileOpen)}
      />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
