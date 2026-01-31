import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock user for testing with valid UUID
const mockUser: User = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@lcstudio.com',
  user_metadata: { display_name: 'Director Test' },
  app_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
} as User;

const mockSession: Session = {
  access_token: 'test-token',
  refresh_token: 'test-refresh',
  expires_in: 3600,
  expires_at: Date.now() / 1000 + 3600,
  token_type: 'bearer',
  user: mockUser
} as Session;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(mockUser);
  const [session, setSession] = useState<Session | null>(mockSession);
  const [loading, setLoading] = useState(false); // No loading for testing

  const signIn = async (email: string, password: string) => {
    // Mock login success
    setUser(mockUser);
    setSession(mockSession);
    return { error: null };
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    // Mock signup success
    setUser(mockUser);
    setSession(mockSession);
    return { error: null };
  };

  const signOut = async () => {
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}