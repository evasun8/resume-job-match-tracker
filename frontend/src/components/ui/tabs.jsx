import * as React from "react";
import { cn } from "@/lib/utils";

// Minimal controlled tabs (shadcn-style API, no Radix dependency).
const TabsContext = React.createContext(null);

function Tabs({ value, onValueChange, className, children, ...props }) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={cn(className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

function TabsList({ className, ...props }) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

function TabsTrigger({ value, className, ...props }) {
  const ctx = React.useContext(TabsContext);
  const active = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => ctx.onValueChange(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        active ? "bg-background text-foreground shadow" : "hover:text-foreground",
        className
      )}
      {...props}
    />
  );
}

function TabsContent({ value, className, ...props }) {
  const ctx = React.useContext(TabsContext);
  if (ctx.value !== value) return null;
  return <div role="tabpanel" className={cn("mt-2", className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
