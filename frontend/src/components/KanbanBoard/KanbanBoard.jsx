import { useCallback, useEffect, useState } from "react";
import * as client from "@/api/client";
import JobCard from "@/components/JobCard/JobCard";
import JobDetailDialog from "./JobDetailDialog";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// FE-06 + FE-08: five-column board with HTML5 drag-and-drop.
// Drops PATCH the status with an optimistic update + rollback on error.
const COLUMNS = [
  { status: "saved", label: "Saved" },
  { status: "applied", label: "Applied" },
  { status: "interviewing", label: "Interviewing" },
  { status: "rejected", label: "Rejected" },
  { status: "offer", label: "Offer" },
];

export default function KanbanBoard() {
  const [jobs, setJobs] = useState(null); // null until first load
  const [loadError, setLoadError] = useState(null);
  const [moveError, setMoveError] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [detailJobId, setDetailJobId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setJobs(await client.listJobs());
    } catch (err) {
      setLoadError(err.detail || "Failed to load jobs");
      setJobs([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function moveJob(id, newStatus) {
    const job = jobs.find((j) => j.id === id);
    if (!job || job.status === newStatus) return;
    const prevStatus = job.status;

    // Optimistic update.
    setMoveError(null);
    setJobs((cur) => cur.map((j) => (j.id === id ? { ...j, status: newStatus } : j)));
    try {
      await client.updateJobStatus(id, newStatus);
    } catch (err) {
      // Rollback on failure.
      setJobs((cur) => cur.map((j) => (j.id === id ? { ...j, status: prevStatus } : j)));
      setMoveError(err.detail || "Failed to move job — change reverted.");
    }
  }

  function handleDrop(e, status) {
    e.preventDefault();
    setDragOverCol(null);
    const id = Number(e.dataTransfer.getData("text/plain"));
    setDraggingId(null);
    if (!Number.isNaN(id)) moveJob(id, status);
  }

  if (jobs === null && !loadError) {
    return <Spinner label="Loading board..." />;
  }

  return (
    <div className="space-y-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertTitle>Could not load jobs</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            {loadError}
            <Button variant="outline" size="sm" onClick={load}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {moveError && (
        <Alert variant="destructive">
          <AlertDescription>{moveError}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 md:grid-cols-5">
        {COLUMNS.map(({ status, label }) => {
          const colJobs = (jobs || []).filter((j) => j.status === status);
          return (
            <div
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCol(status);
              }}
              onDragLeave={() => setDragOverCol((c) => (c === status ? null : c))}
              onDrop={(e) => handleDrop(e, status)}
              className={cn(
                "flex min-h-[300px] flex-col gap-2 rounded-lg border bg-muted/30 p-2 transition-colors",
                dragOverCol === status && "border-ring bg-accent"
              )}
            >
              <div className="flex items-center justify-between px-1 py-1">
                <h3 className="text-sm font-semibold">{label}</h3>
                <Badge variant="secondary">{colJobs.length}</Badge>
              </div>
              {colJobs.length === 0 && (
                <p className="px-1 text-xs italic text-muted-foreground">No jobs</p>
              )}
              {colJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  isDragging={draggingId === job.id}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", String(job.id));
                    e.dataTransfer.effectAllowed = "move";
                    setDraggingId(job.id);
                  }}
                  onClick={() => {
                    setDetailJobId(job.id);
                    setDetailOpen(true);
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>

      <JobDetailDialog jobId={detailJobId} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
