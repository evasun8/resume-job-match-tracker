import { useState } from "react";
import ResumeInput from "@/components/ResumeInput/ResumeInput";
import JobDescriptionForm from "@/components/JobDescriptionForm/JobDescriptionForm";
import MatchResultView from "@/components/MatchResultView/MatchResultView";
import SuggestedBullets from "@/components/SuggestedBullets/SuggestedBullets";
import KanbanBoard from "@/components/KanbanBoard/KanbanBoard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function App() {
  const [view, setView] = useState("analyze"); // "analyze" | "board"
  // Latest POST /api/jobs response: { job, match_result, match_error }
  const [analysis, setAnalysis] = useState(null);

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Resume &amp; Job Match Tracker</h1>
            <p className="text-sm text-muted-foreground">
              Analyze job descriptions against your resume, then track applications.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <Tabs value={view} onValueChange={setView}>
          <TabsList>
            <TabsTrigger value="analyze">Add Job / Analyze</TabsTrigger>
            <TabsTrigger value="board">Board</TabsTrigger>
          </TabsList>

          <TabsContent value="analyze" className="space-y-6">
            <ResumeInput />
            <JobDescriptionForm onResult={setAnalysis} />

            {analysis && (
              <section className="space-y-4">
                <h2 className="text-base font-semibold">
                  Analysis result
                  {analysis.job?.title || analysis.job?.company
                    ? ` — ${analysis.job.title || analysis.job.company}`
                    : ""}
                </h2>

                {analysis.match_result ? (
                  <>
                    <MatchResultView matchResult={analysis.match_result} />
                    <SuggestedBullets
                      suggestedBullets={analysis.match_result.suggested_bullets}
                    />
                  </>
                ) : (
                  // Job saved but LLM analysis failed — expected, never crash.
                  <Alert variant="warning">
                    <AlertTitle>Job saved, but analysis failed</AlertTitle>
                    <AlertDescription className="space-y-2">
                      <p>
                        {analysis.match_error ||
                          "The match analysis could not be completed. Your job was still saved to the board."}
                      </p>
                      <Button variant="outline" size="sm" onClick={() => setView("board")}>
                        View it on the board
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
              </section>
            )}
          </TabsContent>

          <TabsContent value="board">
            <KanbanBoard />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
