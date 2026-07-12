// AuthContext (FE-11): the single source of truth for "is anyone logged in,
// and who." The access token is held ONLY in this component's React state
// -- never localStorage, never a cookie readable by JS. It is intentionally
// lost on every full page reload; see the silent-refresh effect below for
// how the app recovers from that without forcing a re-login.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as client from "@/api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  // Distinguishes "we don't know yet" (still doing the silent-refresh
  // check) from "we checked, and you're logged out" -- without this, the
  // app would flash the login page for a split second on every reload
  // even for an already-logged-in user.
  const [isLoading, setIsLoading] = useState(true);

  // Every place this component's own accessToken state changes, client.js's
  // module-level copy (used by authorizedRequest() for the resume/jobs
  // calls, FE-12) must be pushed the same value -- these two copies existing
  // at all is the tradeoff of keeping client.js a plain module rather than
  // a hook; helper keeps the two calls from ever drifting out of sync.
  const applyAccessToken = useCallback((token) => {
    setAccessToken(token);
    client.setAccessToken(token);
  }, []);

  const login = useCallback(
    async (email, password) => {
      const { access_token } = await client.login(email, password);
      applyAccessToken(access_token);
      const user = await client.getCurrentUser(access_token);
      setCurrentUser(user);
    },
    [applyAccessToken]
  );

  const signup = useCallback(
    async (email, password) => {
      const { access_token } = await client.signup(email, password);
      applyAccessToken(access_token);
      const user = await client.getCurrentUser(access_token);
      setCurrentUser(user);
    },
    [applyAccessToken]
  );

  const logout = useCallback(async () => {
    try {
      await client.logout();
    } finally {
      // Clear local state even if the network call fails -- the user
      // clicked logout, so the UI must reflect that regardless.
      applyAccessToken(null);
      setCurrentUser(null);
    }
  }, [applyAccessToken]);

  // Registered once, at mount: if client.js's authorizedRequest() ever
  // exhausts its single refresh attempt (the refresh cookie itself is
  // gone/expired), it calls this to tell React state to log the user out --
  // client.js is a plain module with no direct way to touch React state
  // otherwise. Safe to capture applyAccessToken/setCurrentUser here without
  // listing them as effect deps: both are stable across renders (useState
  // setters and a useCallback with an empty/stable dep chain).
  useEffect(() => {
    client.onAuthExpired(() => {
      applyAccessToken(null);
      setCurrentUser(null);
    });
  }, [applyAccessToken]);

  // Silent refresh on load: the access token was never persisted, so on a
  // fresh page load this component's state starts empty every time, even
  // for a user who logged in five minutes ago. This effect asks the
  // backend "does my refresh cookie still prove I'm logged in?" once, on
  // mount, and transparently restores the session if so.
  useEffect(() => {
    let cancelled = false;

    async function trySilentRefresh() {
      try {
        const { access_token } = await client.refreshAccessToken();
        const user = await client.getCurrentUser(access_token);
        if (!cancelled) {
          applyAccessToken(access_token);
          setCurrentUser(user);
        }
      } catch {
        // No valid refresh cookie (never logged in, or it expired) --
        // this is an expected outcome, not an error to surface anywhere.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    trySilentRefresh();
    return () => {
      cancelled = true;
    };
  }, [applyAccessToken]);

  const value = {
    accessToken,
    currentUser,
    isAuthenticated: currentUser !== null,
    isLoading,
    login,
    signup,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error("useAuth() must be called within an <AuthProvider>");
  }
  return ctx;
}
