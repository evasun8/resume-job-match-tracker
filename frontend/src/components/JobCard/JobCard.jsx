import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// FE-07: Kanban job card. title/company are optional in the schema —
// falls back to "Untitled Job". match_summary may be null (analysis
// failed/unavailable) and must still render.
export default function JobCard({ job, onClick, onDragStart, isDragging }) {
  const { title, company, match_summary } = job;
  const heading = title || company || "Untitled Job";
  const subheading = title && company ? company : null;
  const apply =
    match_summary &&
    String(match_summary.recommendation).toLowerCase().replace(/[_\s]/g, "-") === "apply";

  return (
    <Card
      data-testid={`job-card-${job.id}`}
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick?.()}
      className={cn(
        "cursor-grab select-none transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        isDragging && "opacity-50"
      )}
    >
      <CardContent className="space-y-2 p-3">
        <div>
          <p className="text-sm font-medium leading-tight">{heading}</p>
          {subheading && <p className="text-xs text-muted-foreground">{subheading}</p>}
        </div>
        {match_summary ? (
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="tabular-nums">
              {match_summary.overall_score}
            </Badge>
            <Badge variant={apply ? "success" : "destructive"}>
              {apply ? "Apply" : "Do not apply"}
            </Badge>
          </div>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Analysis unavailable
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
