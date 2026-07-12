import { useEffect, useState } from "react";
import * as client from "@/api/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";

// FE-13: Settings page — enter/update the user's personal OpenAI API key.
// Only the backend's *masked* form of the key is ever kept in state or
// rendered; the raw key lives solely in the controlled input until submit,
// then is cleared.
export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // load failure (unexpected)
  const [maskedKey, setMaskedKey] = useState(null); // e.g. "sk-...c70A" or null

  const [keyInput, setKeyInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await client.getSettings();
        if (!cancelled) setMaskedKey(settings.openai_api_key_masked);
      } catch (err) {
        if (!cancelled) setError(err.detail || "Failed to load settings");
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
    setJustSaved(false);
    if (!keyInput.trim()) {
      setSubmitError("Enter an API key first.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await client.updateApiKey(keyInput.trim());
      // Keep only the masked confirmation — the raw key is never echoed
      // back into state or the DOM after submission.
      setMaskedKey(result.openai_api_key_masked);
      setKeyInput("");
      setJustSaved(true);
    } catch (err) {
      setSubmitError(err.detail || "Could not save the API key.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Spinner label="Loading settings..." />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load settings</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const keySuffix = maskedKey ? maskedKey.slice(maskedKey.lastIndexOf("...")) : null;

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          OpenAI API Key
          {maskedKey && <Badge variant="success">Saved</Badge>}
        </CardTitle>
        <CardDescription>
          Job match analysis runs on OpenAI&apos;s models using your own API key, so usage is billed
          to your own OpenAI account. Create a key at{" "}
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            platform.openai.com
          </a>
          . Your key is stored securely and only its last few characters are ever shown back to you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {maskedKey && (
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="text-sm font-medium">
              Key ending in {keySuffix} saved{justSaved ? " — you're all set." : "."}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Saving a new key below replaces this one.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="openai-api-key">{maskedKey ? "New API key" : "API key"}</Label>
            <Input
              id="openai-api-key"
              type="password"
              autoComplete="off"
              placeholder="sk-..."
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">OpenAI keys start with &quot;sk-&quot;.</p>
          </div>

          {submitError && (
            <Alert variant="destructive">
              <AlertTitle>Could not save API key</AlertTitle>
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={submitting}>
            {submitting ? <Spinner className="text-primary-foreground" /> : null}
            {submitting ? "Saving..." : maskedKey ? "Replace key" : "Save key"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
