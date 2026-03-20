import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  getCurrentSession,
  onAuthStateChange,
  signInWithPassword,
  signOut as signOutFromSupabase,
  signUpWithPassword,
} from "@/src/lib/auth";
import { loadAppBootstrap, type MembershipSummary } from "@/src/lib/bootstrap";
import type { Profile } from "@/src/types/domain";

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  memberships: MembershipSummary[];
  isLoading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { fullName: string; email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function getReadableError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Nao foi possivel carregar os dados da sessao.";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<MembershipSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function hydrate(incomingSession?: Session | null) {
    setIsLoading(true);
    setError(null);

    try {
      const resolvedSession =
        typeof incomingSession === "undefined" ? await getCurrentSession() : incomingSession;
      const bootstrap = await loadAppBootstrap(resolvedSession);

      setSession(resolvedSession);
      setProfile(bootstrap.profile);
      setMemberships(bootstrap.memberships);
    } catch (nextError) {
      setError(getReadableError(nextError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void hydrate();

    const subscription = onAuthStateChange((incomingSession) => {
      startTransition(() => {
        void hydrate(incomingSession);
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    session,
    profile,
    memberships,
    isLoading,
    error,
    signIn: async (email, password) => {
      await signInWithPassword(email, password);
    },
    signUp: async (input) => {
      await signUpWithPassword(input);
    },
    signOut: async () => {
      await signOutFromSupabase();
    },
    refresh: async () => {
      await hydrate(session);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}
