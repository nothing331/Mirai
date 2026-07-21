import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-9 items-center justify-center gap-2 border border-ink px-3 py-2 text-xs font-bold transition-[background-color,color,border-color] hover:bg-acid hover:text-ink disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
  {
    variants: {
      variant: {
        default: "bg-ink text-paper",
        accent: "bg-acid text-ink",
        outline: "bg-transparent text-ink",
        quiet: "border-line bg-transparent text-ink",
      },
      size: { default: "h-9", icon: "size-9 px-0" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

/** Shared shadcn-style button with editor-specific visual variants. */
export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { buttonVariants };
