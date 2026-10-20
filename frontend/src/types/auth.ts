export interface AuthUser {
  id: string;
  stellar_address: string;
  username: string | null;
  avatar_url: string | null;
  reputation_score: number;
  role: string;
}

export interface UseAuthReturn {
  isAuthenticating: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  token: string | null;
  error: string | null;
  authenticate: (
    address: string,
    signMessage: (msg: string) => Promise<string | null>
  ) => Promise<boolean>;
  logout: () => void;
}
