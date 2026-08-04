import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"span"> & {
  variant?: "default" | "outline" | "success" | "warning" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        variant === "default" && "bg-primary/15 text-primary",
        variant === "outline" && "border border-border text-muted-foreground",
        variant === "success" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        variant === "warning" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        variant === "danger" && "bg-red-500/15 text-red-700 dark:text-red-300",
        className,
      )}
      {...props}
    />
  );
}
