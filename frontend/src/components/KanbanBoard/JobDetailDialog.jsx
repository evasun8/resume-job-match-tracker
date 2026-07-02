import { useEffect, useState } from "react";
import * as client from "@/api/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import MatchResultView from "@/components/MatchResultView/MatchResultView";
import SuggestedBullets from "@/components/SuggestedBullets/SuggestedBullets";

// FE-07 (detail half): fetches GET /api/jobs/{id} and reuses
// MatchResultView + SuggestedBullets. match_result may be null.
export default function JobDetailDialog({ jobId, open, onOpenChange }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null); // { job, match_result }
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || jobId == null) return;
    let cancelled = false;
    setLoading(true);
    setData(null);
    setError(null);
    client
      .getJob(jobId)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.detail || "Failed to load job"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, jobId]);

  const job = data?.job;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {job ? job.title || job.company || "Untitled Job" : "Job details"}
          </DialogTitle>
          {job && (
            <DialogDescription className="flex items-center gap-2">
              {job.title && job.company ? job.company : null}
              <Badge variant="secondary" className="capitalize">{job.status}</Badge>
            </DialogDescription>
          )}
        </DialogHeader>

        {loading && <Spinner label="Loading job details..." />}

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Could not load job</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {data && !loading && (
          data.match_result ? (
            <div className="space-y-4">
              <MatchResultView matchResult={data.match_result} />
              <SuggestedBullets suggestedBullets={data.match_result.suggested_bullets} />
            </div>
          ) : (
            <Alert variant="warning">
              <AlertTitle>No analysis available</AlertTitle>
              <AlertDescription>
                This job was saved, but no successful match analysis exists for it.
              </AlertDescription>
            </Alert>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
