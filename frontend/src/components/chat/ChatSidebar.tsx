"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  MessageSquare,
  Trash2,
  BookOpen,
  ClipboardCheck,
  Brain,
  HelpCircle,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
  GraduationCap,
} from "lucide-react";
import { useTheme } from "next-themes";
import { signOut } from "next-auth/react";
import Button from "@/components/ui/Button";
import { cn, getSubjectIcon } from "@/lib/utils";
import type { ConversationSummary, ConversationMode } from "@/types";

interface ChatSidebarProps {
  conversations: ConversationSummary[];
  activeId?: string;
  onNewConversation: (mode: ConversationMode) => void;
  onDeleteConversation: (id: string) => void;
  isMobileOpen: boolean;
  onMobileToggle: () => void;
}

const MODE_ICONS: Record<string, React.ReactNode> = {
  CHAT: <MessageSquare size={14} />,
  EXERCISE: <ClipboardCheck size={14} />,
  CORRECTION: <BookOpen size={14} />,
  QUIZ: <Brain size={14} />,
  REVISION: <HelpCircle size={14} />,
};

const MODE_LABELS: Record<string, string> = {
  CHAT: "Discussion",
  EXERCISE: "Exercices",
  CORRECTION: "Correction",
  QUIZ: "Quiz",
  REVISION: "Révision",
};

export default function ChatSidebar({
  conversations,
  activeId,
  onNewConversation,
  onDeleteConversation,
  isMobileOpen,
  onMobileToggle,
}: ChatSidebarProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [showModeMenu, setShowModeMenu] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={onMobileToggle}
        className="fixed top-3 left-3 z-50 md:hidden p-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] cursor-pointer"
      >
        {isMobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={onMobileToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed md:relative z-40 h-full w-72 bg-[var(--color-sidebar)] border-r border-[var(--color-border)] flex flex-col transition-transform duration-300",
          isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 mb-4">
            <GraduationCap size={24} className="text-[var(--color-primary)]" />
            <h1 className="font-bold text-lg">Ivoir&apos;Académie</h1>
          </div>

          <div className="relative">
            <Button
              onClick={() => setShowModeMenu(!showModeMenu)}
              className="w-full justify-center gap-2"
              size="md"
            >
              <Plus size={16} />
              Nouvelle conversation
            </Button>

            {showModeMenu && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg overflow-hidden z-50">
                {(
                  Object.entries(MODE_LABELS) as [string, string][]
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => {
                      onNewConversation(mode as ConversationMode);
                      setShowModeMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[var(--color-surface-hover)] text-sm text-left cursor-pointer"
                  >
                    {MODE_ICONS[mode]}
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Conversations */}
        <div className="flex-1 overflow-y-auto py-2">
          {conversations.length === 0 ? (
            <p className="text-center text-sm text-[var(--color-muted)] py-8 px-4">
              Aucune conversation.
              <br />
              Commence par poser une question !
            </p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "group flex items-center gap-2 px-3 py-2.5 mx-2 rounded-lg cursor-pointer transition-colors",
                  activeId === conv.id
                    ? "bg-[var(--color-surface-hover)]"
                    : "hover:bg-[var(--color-surface-hover)]"
                )}
                onClick={() => {
                  router.push(`/chat/${conv.id}`);
                  onMobileToggle();
                }}
              >
                <span className="text-[var(--color-muted)]">
                  {MODE_ICONS[conv.mode] ?? MODE_ICONS.CHAT}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">
                    {conv.title ?? "Nouvelle conversation"}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                    {conv.subject && (
                      <span>{getSubjectIcon(conv.subject)}</span>
                    )}
                    <span>{conv._count.messages} msg</span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteConversation(conv.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all cursor-pointer"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[var(--color-border)] space-y-1">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--color-surface-hover)] text-sm transition-colors cursor-pointer"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            {theme === "dark" ? "Mode clair" : "Mode sombre"}
          </button>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--color-surface-hover)] text-sm text-red-500 transition-colors cursor-pointer"
          >
            <LogOut size={16} />
            Déconnexion
          </button>
        </div>
      </aside>
    </>
  );
}
