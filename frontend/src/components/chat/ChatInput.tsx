"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, ImagePlus, X } from "lucide-react";
import toast from "react-hot-toast";
import Button from "@/components/ui/Button";
import { compressImageFile } from "@/lib/imageCompress";

interface ChatInputProps {
  onSend: (message: string, imageDataUrl?: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

export default function ChatInput({
  onSend,
  isLoading,
  placeholder = "Pose ta question...",
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [message]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permet de resélectionner le même fichier ensuite
    if (!file) return;

    setIsCompressing(true);
    try {
      const dataUrl = await compressImageFile(file);
      setImagePreview(dataUrl);
    } catch {
      toast.error("Impossible de lire cette photo, réessaie");
    } finally {
      setIsCompressing(false);
    }
  };

  const handleSubmit = () => {
    const trimmed = message.trim();
    if ((!trimmed && !imagePreview) || isLoading) return;
    onSend(trimmed, imagePreview ?? undefined);
    setMessage("");
    setImagePreview(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-[var(--color-border)] bg-[var(--color-background)] p-4">
      <div className="max-w-3xl mx-auto">
        {imagePreview && (
          <div className="mb-2 inline-flex items-center gap-2 p-1.5 pr-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-raised)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local (data URL), pas un asset optimisable */}
            <img src={imagePreview} alt="Photo à envoyer" className="h-12 w-12 object-cover rounded-[var(--radius-sm)]" />
            <button
              type="button"
              onClick={() => setImagePreview(null)}
              className="text-[var(--color-muted)] hover:text-[var(--color-foreground)] p-1"
              title="Retirer la photo"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isCompressing}
            size="icon"
            className="rounded-[var(--radius-lg)] h-[44px] w-[44px] flex-shrink-0"
            title="Joindre une photo (ex. un exercice manuscrit)"
          >
            {isCompressing ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <ImagePlus size={18} />
            )}
          </Button>
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={1}
              disabled={isLoading}
              className="w-full px-3.5 py-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-strong)] focus:border-[var(--color-border-strong)] resize-none transition-all text-sm"
            />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={(!message.trim() && !imagePreview) || isLoading}
            size="icon"
            className="rounded-[var(--radius-lg)] h-[44px] w-[44px] flex-shrink-0"
          >
            {isLoading ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </Button>
        </div>
      </div>
      <p className="text-center text-xs text-[var(--color-muted-subtle)] mt-2.5 max-w-3xl mx-auto">
        EduCI peut faire des erreurs. Vérifie les informations importantes.
      </p>
    </div>
  );
}
