// FE-11: Login/signup UI (FE-14: styled to match the app's Card/Tabs/
// Alert/Spinner conventions -- see ResumeInput.jsx for the reference
// pattern).
import { useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";

export default function AuthPage() {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const { login, signup } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await signup(email, password);
      }
      // No navigation needed here -- AuthContext's isAuthenticated flips to
      // true on success, and App.jsx's route guard re-renders accordingly.
    } catch (err) {
      setError(err.detail || `Could not ${mode === "login" ? "log in" : "sign up"}.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Resume &amp; Job Match Tracker</CardTitle>
          <CardDescription>Sign in to your account, or create a new one.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={mode}
            onValueChange={(next) => {
              setMode(next);
              setError(null);
            }}
          >
            <TabsList>
              <TabsTrigger value="login">Log in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>

            <TabsContent value={mode}>
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="auth-email">Email</Label>
                  <Input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="auth-password">Password</Label>
                  <Input
                    id="auth-password"
                    type="password"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    required
                    minLength={mode === "signup" ? 8 : undefined}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {mode === "signup" && (
                    <p className="text-xs text-muted-foreground">At least 8 characters.</p>
                  )}
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertTitle>{mode === "login" ? "Login failed" : "Sign up failed"}</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? <Spinner className="text-primary-foreground" /> : null}
                  {submitting ? "Please wait..." : mode === "login" ? "Log in" : "Sign up"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
