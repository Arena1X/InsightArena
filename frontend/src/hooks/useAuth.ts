"use client";

import { useState, useEffect, useCallback } from "react";
import type { AuthUser, UseAuthReturn } from "@/types/auth";

const TOKEN_KEY = "ia_token";
const USER_KEY = "ia_user";
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" && Date.now() / 1000 > payload.exp;
  } catch {
    return true;
  }
}

export function useAuth(): UseAuthReturn {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);

    if (storedToken && storedUser) {
      if (isTokenExpired(storedToken)) {
        logout();
      } else {
        try {
          setToken(storedToken);
          setUser(JSON.parse(storedUser) as AuthUser);
          setIsAuthenticated(true);
        } catch {
          logout();
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setIsAuthenticated(false);
    setUser(null);
    setToken(null);
    window.location.href = "/";
  }, []);

  const authenticate = useCallback(
    async (
      address: string,
      signMessage: (msg: string) => Promise<string | null>
    ): Promise<boolean> => {
      setIsAuthenticating(true);
      setError(null);

      try {
        // Step 1: request challenge
        const challengeRes = await fetch(`${API_BASE}/api/auth/challenge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stellar_address: address }),
        });

        if (!challengeRes.ok) {
          setError("Failed to generate challenge");
          return false;
        }

        const { challenge } = (await challengeRes.json()) as { challenge: string };

        // Step 2: sign challenge
        const signature = await signMessage(challenge);
        if (!signature) {
          setError("Signing was rejected");
          return false;
        }

        // Step 3: verify signature
        const verifyRes = await fetch(`${API_BASE}/api/auth/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stellar_address: address, signed_challenge: signature }),
        });

        if (!verifyRes.ok) {
          setError("Signature verification failed");
          return false;
        }

        const { access_token, user: authUser } = (await verifyRes.json()) as {
          access_token: string;
          user: AuthUser;
        };

        // Step 4: persist and update state
        localStorage.setItem(TOKEN_KEY, access_token);
        localStorage.setItem(USER_KEY, JSON.stringify(authUser));
        setToken(access_token);
        setUser(authUser);
        setIsAuthenticated(true);
        return true;
      } catch {
        setError("Authentication failed. Please try again.");
        return false;
      } finally {
        setIsAuthenticating(false);
      }
    },
    []
  );

  return { isAuthenticating, isAuthenticated, user, token, error, authenticate, logout };
}
