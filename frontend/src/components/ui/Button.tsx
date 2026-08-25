import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50",
          size === "md" && "px-3.5 py-2 text-sm",
          size === "sm" && "px-2.5 py-1.5 text-xs",
          variant === "primary" &&
            "bg-indigo-600 text-white hover:bg-indigo-700",
          variant === "secondary" &&
            "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50",
          variant === "danger" && "bg-red-600 text-white hover:bg-red-700",
          variant === "ghost" &&
            "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
