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
          "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
          {
            "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] focus:ring-[var(--color-primary)]":
              variant === "primary",
            "bg-[var(--color-secondary)] text-white hover:opacity-90 focus:ring-[var(--color-secondary)]":
              variant === "secondary",
            "bg-transparent hover:bg-[var(--color-surface-hover)] text-[var(--color-foreground)] focus:ring-[var(--color-border)]":
              variant === "ghost",
            "bg-red-500 text-white hover:bg-red-600 focus:ring-red-500":
              variant === "danger",
            "border border-[var(--color-border)] bg-transparent hover:bg-[var(--color-surface-hover)] text-[var(--color-foreground)] focus:ring-[var(--color-border)]":
              variant === "outline",
          },
          {
            "px-3 py-1.5 text-sm": size === "sm",
            "px-4 py-2 text-sm": size === "md",
            "px-6 py-3 text-base": size === "lg",
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
