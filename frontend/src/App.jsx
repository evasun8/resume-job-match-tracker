import { useState } from "react";
import ResumeInput from "@/components/ResumeInput/ResumeInput";
import JobDescriptionForm from "@/components/JobDescriptionForm/JobDescriptionForm";
import MatchResultView from "@/components/MatchResultView/MatchResultView";
import SuggestedBullets from "@/components/SuggestedBullets/SuggestedBullets";
import KanbanBoard from "@/components/KanbanBoard/KanbanBoard";
import AuthPage from "@/components/Auth/AuthPage";
import SettingsPage from "@/components/Settings/SettingsPage";
import { useAuth } from "@/auth/AuthContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export default function App() {
  const { isLoading, isAuthenticated, currentUser, logout } = useAuth();
  const [view, setView] = useState("analyze"); // "analyze" | "board" | "settings"
  // Latest POST /api/jobs response: { job, match_result, match_error }
  const [analysis, setAnalysis] = useState(null);

  // While the silent-refresh-on-load check (AuthContext) is in flight, we
  // genuinely don't know yet whether the user is logged in -- show a
  // neutral loading state rather than flashing the login page first.
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage />;
  }

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
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{currentUser?.email}</span>
            <Button variant="outline" size="sm" onClick={() => setView("settings")}>
              Settings
            </Button>
            <Button variant="outline" size="sm" onClick={logout}>
              Log out
            </Button>
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
                      <div className="flex flex-wrap gap-2">
                        {/* BE-12's "no API key configured" failure is actionable —
                            route the user straight to the fix. */}
                        {analysis.match_error?.includes("OpenAI API key") && (
                          <Button variant="outline" size="sm" onClick={() => setView("settings")}>
                            Go to Settings
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => setView("board")}>
                          View it on the board
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </section>
            )}
          </TabsContent>

          <TabsContent value="board">
            <KanbanBoard />
          </TabsContent>

          {/* No TabsTrigger for this — reached via the header's Settings
              button; the minimal Tabs impl renders any matching content. */}
          <TabsContent value="settings">
            <SettingsPage />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
