import * as React from "react";
import { cn } from "@/lib/utils";

const variants = {
  default: "bg-background text-foreground",
  destructive: "border-destructive/50 text-destructive [&>svg]:text-destructive",
  warning: "border-amber-500/50 text-amber-700 bg-amber-50",
};

const Alert = React.forwardRef(({ className, variant = "default", ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn("relative w-full rounded-lg border px-4 py-3 text-sm", variants[variant], className)}
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h5 ref={ref} className={cn("mb-1 font-medium leading-none tracking-tight", className)} {...props} />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("text-sm [&_p]:leading-relaxed", className)} {...props} />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
