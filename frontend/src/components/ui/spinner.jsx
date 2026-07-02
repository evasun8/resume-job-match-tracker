import { cn } from "@/lib/utils";

function Spinner({ className, label }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm text-muted-foreground", className)} role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      {label && <span>{label}</span>}
    </span>
  );
}

export { Spinner };
