"use client";

import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cn } from "@/lib/utils";

/** Groups mutually exclusive editor tool choices. */
export function ToggleGroup({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return <ToggleGroupPrimitive.Root className={cn("grid grid-cols-3 border border-ink", className)} {...props} />;
}

/** Renders one accessible tool choice inside a toggle group. */
export function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      className={cn("flex min-h-10 items-center justify-center gap-1.5 border-r border-ink px-1 font-mono text-[10px] uppercase last:border-r-0 data-[state=on]:bg-ink data-[state=on]:text-white focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-accent", className)}
      {...props}
    />
  );
}
