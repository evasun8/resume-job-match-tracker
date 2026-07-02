import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// FE-04: Pure display component — accepts `matchResult` as a prop, never
// fetches. All six category keys are ALWAYS rendered, even when empty.
const CATEGORIES = [
  ["hard_skills", "Hard Skills"],
  ["tools_platforms", "Tools & Platforms"],
  ["years_experience", "Years of Experience"],
  ["certifications", "Certifications"],
  ["soft_skills", "Soft Skills"],
  ["education", "Education"],
];

function isApply(recommendation) {
  return String(recommendation || "").toLowerCase().replace(/[_\s]/g, "-") === "apply";
}

function ChipList({ items, tone }) {
  if (!items || items.length === 0) {
    return <p className="text-sm italic text-muted-foreground">None identified</p>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <li key={i}>
          <Badge variant={tone === "matched" ? "success" : "destructive"} className="font-normal">
            {item}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

export default function MatchResultView({ matchResult }) {
  if (!matchResult) return null;

  const {
    overall_score,
    recommendation,
    recommendation_reasoning,
    scoring_method_explanation,
    categories = {},
  } = matchResult;

  const apply = isApply(recommendation);

  return (
    <div className="space-y-4">
      {/* Prominent score + recommendation */}
      <Card className={apply ? "border-green-600/40" : "border-destructive/40"}>
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center justify-center rounded-lg bg-muted px-6 py-4">
            {/* Score scale assumed 0-100 (unconfirmed) — intentionally no "/100" label */}
            <span className="text-4xl font-bold tabular-nums">{overall_score ?? "—"}</span>
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Match score</span>
          </div>
          <div className="flex-1 space-y-2">
            <Badge variant={apply ? "success" : "destructive"} className="text-sm">
              {apply ? "Recommendation: Apply" : "Recommendation: Do not apply"}
            </Badge>
            <p className="text-sm leading-relaxed">{recommendation_reasoning}</p>
          </div>
        </CardContent>
      </Card>

      {/* Scoring method — visible, not hidden behind a click */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">How this score was calculated</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {scoring_method_explanation}
          </p>
        </CardContent>
      </Card>

      {/* Six category breakdowns — always all six */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map(([key, label]) => {
          const cat = categories[key] || { matched: [], missing: [] };
          return (
            <Card key={key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-700">
                    Matched
                  </p>
                  <ChipList items={cat.matched} tone="matched" />
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-destructive">
                    Missing
                  </p>
                  <ChipList items={cat.missing} tone="missing" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
