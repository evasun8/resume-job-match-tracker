import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// FE-05: STRICTLY read-only display of suggested resume bullets.
// The only action is copy-to-clipboard — there is intentionally no
// "apply to resume" / "accept" affordance anywhere in this component.
export default function SuggestedBullets({ suggestedBullets }) {
  const [copiedIndex, setCopiedIndex] = useState(null);

  if (!suggestedBullets || suggestedBullets.length === 0) return null;

  async function copy(text, index) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for environments without clipboard permission.
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex((cur) => (cur === index ? null : cur)), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Suggested resume bullets</CardTitle>
        <CardDescription>
          Ready-to-paste suggestions targeting your gaps. These are for reference only — copy the
          ones you like into your own resume; nothing here modifies your stored resume.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {suggestedBullets.map((b, i) => (
            <li key={i} className="rounded-md border p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <Badge variant="outline">Gap: {b.target_gap}</Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copy(b.suggested_text, i)}
                >
                  {copiedIndex === i ? "Copied!" : "Copy to clipboard"}
                </Button>
              </div>
              <p className="text-sm leading-relaxed">{b.suggested_text}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
