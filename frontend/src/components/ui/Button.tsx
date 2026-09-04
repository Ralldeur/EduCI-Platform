"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg" | "icon";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-[var(--radius-md)] font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
          {
            "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary-hover)] focus-visible:ring-[var(--color-primary)] shadow-[var(--shadow-sm)]":
              variant === "primary",
            "bg-[var(--color-surface-raised)] border border-[var(--color-border)] text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-border-strong)] focus-visible:ring-[var(--color-border-strong)]":
              variant === "secondary",
            "bg-transparent hover:bg-[var(--color-surface-hover)] text-[var(--color-foreground)] focus-visible:ring-[var(--color-border-strong)]":
              variant === "ghost",
            "bg-[var(--color-danger)] text-white hover:opacity-90 focus-visible:ring-[var(--color-danger)]":
              variant === "danger",
            "border border-[var(--color-border)] bg-transparent hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-border-strong)] text-[var(--color-foreground)] focus-visible:ring-[var(--color-border-strong)]":
              variant === "outline",
          },
          {
            "px-3 py-1.5 text-sm": size === "sm",
            "px-3.5 py-2 text-sm": size === "md",
            "px-5 py-2.5 text-[15px]": size === "lg",
            "p-2 h-9 w-9": size === "icon",
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export default Button;
