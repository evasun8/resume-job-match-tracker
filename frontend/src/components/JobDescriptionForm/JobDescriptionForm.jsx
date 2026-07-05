import { useState } from "react";
import * as client from "@/api/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { classifyUploadError } from "@/lib/uploadErrors";

// FE-03: New job / "Analyze" form. title/company are optional (the
// contract may drop them later). Hands { job, match_result, match_error }
// up via onResult — defensively handles match_result: null.
export default function JobDescriptionForm({ onResult }) {
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [mode, setMode] = useState("paste");
  const [jdText, setJdText] = useState("");
  const [jdFile, setJdFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [jobUrl, setJobUrl] = useState("");
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [urlError, setUrlError] = useState(null);

  async function handleFetchUrl() {
    if (!jobUrl.trim()) return;
    setUrlError(null);
    setFetchingUrl(true);
    try {
      const result = await client.fetchJobFromUrl(jobUrl.trim());
      setTitle(result.title || "");
      setCompany(result.company || "");
      setJdText(result.jd_text || "");
      setMode("paste");
    } catch (err) {
      setUrlError(err);
    } finally {
      setFetchingUrl(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (mode === "paste" && !jdText.trim()) {
      setError({ detail: "Paste a job description first." });
      return;
    }
    if (mode === "upload" && !jdFile) {
      setError({ detail: "Choose a job description file first." });
      return;
    }
    if (mode === "url") {
      setError({ detail: "Fetch the job details first, then review and save from the Paste JD tab." });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim() || undefined,
        company: company.trim() || undefined,
        ...(mode === "paste" ? { jd_text: jdText } : { jd_file: jdFile }),
      };
      const result = await client.createJob(payload);
      // result: { job, match_result | null, match_error | null }
      onResult?.(result);
      setTitle("");
      setCompany("");
      setJdText("");
      setJdFile(null);
    } catch (err) {
      if (mode === "upload" && (err.status === 400 || err.status === 413)) {
        setError({ ...err, upload: classifyUploadError(err) });
      } else {
        setError(err);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a Job &amp; Analyze</CardTitle>
        <CardDescription>
          Paste or upload a job description. We&apos;ll compare it against your stored resume — analysis
          can take several seconds.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="job-title">Job title (optional)</Label>
              <Input
                id="job-title"
                placeholder="e.g. Senior Backend Engineer"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="job-company">Company (optional)</Label>
              <Input
                id="job-company"
                placeholder="e.g. Acme Corp"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
          </div>

          <Tabs value={mode} onValueChange={setMode}>
            <TabsList>
              <TabsTrigger value="paste">Paste JD</TabsTrigger>
              <TabsTrigger value="upload">Upload JD file</TabsTrigger>
              <TabsTrigger value="url">Fetch from URL</TabsTrigger>
            </TabsList>
            <TabsContent value="url">
              <div className="space-y-2">
                <Label htmlFor="job-url">Job posting URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="job-url"
                    type="url"
                    placeholder="https://company.com/careers/12345"
                    value={jobUrl}
                    onChange={(e) => setJobUrl(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={fetchingUrl || !jobUrl.trim()}
                    onClick={handleFetchUrl}
                  >
                    {fetchingUrl ? (
                      <>
                        <Spinner /> Fetching...
                      </>
                    ) : (
                      "Fetch job details"
                    )}
                  </Button>
                </div>
                {urlError && (
                  <Alert variant="destructive">
                    <AlertTitle>Could not fetch that job page</AlertTitle>
                    <AlertDescription>
                      {urlError.detail} You can paste the description manually instead.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </TabsContent>
            <TabsContent value="paste">
              <div className="space-y-2">
                <Label htmlFor="jd-text">Job description</Label>
                <Textarea
                  id="jd-text"
                  rows={8}
                  placeholder="Paste the job description here..."
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                />
              </div>
            </TabsContent>
            <TabsContent value="upload">
              <div className="space-y-2">
                <Label htmlFor="jd-file">Job description file</Label>
                <Input
                  id="jd-file"
                  type="file"
                  onChange={(e) => setJdFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </TabsContent>
          </Tabs>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>
                {error.status === 409
                  ? "Upload a resume first"
                  : error.upload
                    ? error.upload.title
                    : "Could not create job"}
              </AlertTitle>
              <AlertDescription>
                {error.status === 409
                  ? "You need a stored resume before analyzing a job. Add one in the resume section above."
                  : error.upload
                    ? error.upload.description
                    : error.detail}
              </AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <Spinner className="text-primary-foreground" />{" "}
                {mode === "upload"
                  ? "Uploading and analyzing... this can take a few seconds"
                  : "Analyzing... this can take a few seconds"}
              </>
            ) : (
              "Save & Analyze Match"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
