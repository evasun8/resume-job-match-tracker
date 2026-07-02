import { useEffect, useState } from "react";
import * as client from "@/api/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { classifyUploadError } from "@/lib/uploadErrors";

// FE-02: Resume upload/paste. GET /api/resume 404 = expected "no resume
// yet" empty state, never rendered as an error.
export default function ResumeInput({ onResumeChange }) {
  const [loading, setLoading] = useState(true);
  const [resume, setResume] = useState(null); // null = no resume yet
  const [error, setError] = useState(null); // unexpected errors only
  const [editing, setEditing] = useState(false);

  const [mode, setMode] = useState("paste");
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null); // string (plain) or classified upload error object

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await client.getResume();
        if (!cancelled) setResume(r);
      } catch (err) {
        if (cancelled) return;
        if (err.status === 404) {
          setResume(null); // expected: no resume yet
        } else {
          setError(err.detail || "Failed to load resume");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError(null);
    const payload = mode === "paste" ? { text } : { file };
    if (mode === "paste" && !text.trim()) {
      setSubmitError({ description: "Paste your resume text first." });
      return;
    }
    if (mode === "upload" && !file) {
      setSubmitError({ description: "Choose a file first." });
      return;
    }
    setSubmitting(true);
    try {
      const saved = await client.saveResume(payload);
      setResume(saved);
      setEditing(false);
      setText("");
      setFile(null);
      onResumeChange?.(saved);
    } catch (err) {
      if (mode === "upload" && (err.status === 400 || err.status === 413)) {
        setSubmitError(classifyUploadError(err));
      } else {
        setSubmitError({ title: "Could not save resume", description: err.detail || "Failed to save resume" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Spinner label="Checking for an existing resume..." />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load resume</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const showForm = !resume || editing;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Your Resume
          {resume && <Badge variant="success">Stored</Badge>}
        </CardTitle>
        <CardDescription>
          {resume
            ? "This resume is used for every job match analysis. Replacing it overwrites the previous version."
            : "No resume yet — paste or upload one to start analyzing jobs."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {resume && !editing && (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-sm font-medium">
                {resume.filename || "Pasted text resume"}
              </p>
              {resume.text && (
                <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">
                  {resume.text.slice(0, 300)}
                  {resume.text.length > 300 ? "…" : ""}
                </p>
              )}
            </div>
            <Button variant="outline" onClick={() => setEditing(true)}>
              Replace resume
            </Button>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Tabs value={mode} onValueChange={setMode}>
              <TabsList>
                <TabsTrigger value="paste">Paste text</TabsTrigger>
                <TabsTrigger value="upload">Upload file</TabsTrigger>
              </TabsList>
              <TabsContent value="paste">
                <div className="space-y-2">
                  <Label htmlFor="resume-text">Resume text</Label>
                  <Textarea
                    id="resume-text"
                    rows={8}
                    placeholder="Paste your resume here..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                </div>
              </TabsContent>
              <TabsContent value="upload">
                <div className="space-y-2">
                  <Label htmlFor="resume-file">Resume file</Label>
                  <Input
                    id="resume-file"
                    type="file"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </TabsContent>
            </Tabs>

            {submitError && (
              <Alert variant="destructive">
                {submitError.title && <AlertTitle>{submitError.title}</AlertTitle>}
                <AlertDescription>{submitError.description}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? <Spinner className="text-primary-foreground" /> : null}
                {submitting
                  ? mode === "upload"
                    ? "Uploading and processing file..."
                    : "Saving..."
                  : resume
                    ? "Replace resume"
                    : "Save resume"}
              </Button>
              {editing && (
                <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
