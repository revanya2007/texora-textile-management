import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { type Profile, type UserRole, isValidRole } from '../types/auth';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: UserRole | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, portal: 'export' | 'domestic', role?: UserRole) => Promise<{ error: string | null }>;
  signInWithGoogle: (portal?: 'export' | 'domestic') => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasAccessToPortal: (portal?: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const EXPORT_ROLES: readonly UserRole[] = ['admin', 'export_manager', 'export_staff'] as const;
const DOMESTIC_ROLES: readonly UserRole[] = ['admin', 'domestic_manager', 'domestic_staff', 'subcontractor'] as const;

// Helper to fetch or safely resolve profile
async function fetchUserProfile(currentUser: User): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .maybeSingle();

    if (error) {
      console.warn('Could not fetch profile from table:', error.message);
    }

    if (data && isValidRole(data.role)) {
      // If user metadata has admin or higher role, sync and apply
      const metaRole = currentUser.user_metadata?.role;
      if (metaRole === 'admin' && data.role !== 'admin') {
        data.role = 'admin';
        try {
          await supabase.from('profiles').update({ role: 'admin' }).eq('id', currentUser.id);
        } catch (_) {}
      }
      return data as Profile;
    }

    // Fallback: Validate role from user metadata
    const rawRole = currentUser.user_metadata?.role;
    const metaRole: UserRole = isValidRole(rawRole) 
      ? rawRole 
      : (currentUser.user_metadata?.portal === 'export' ? 'export_staff' : 'domestic_staff');

    const fallbackProfile: Profile = {
      id: currentUser.id,
      email: currentUser.email || '',
      first_name: currentUser.user_metadata?.first_name || null,
      last_name: currentUser.user_metadata?.last_name || null,
      role: metaRole,
      created_at: currentUser.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Auto-heal / upsert profile row if table exists
    try {
      await supabase.from('profiles').upsert([
        {
          id: currentUser.id,
          email: currentUser.email || '',
          role: metaRole,
        }
      ], { onConflict: 'id' });
    } catch (upsertErr) {
      console.warn('Profile auto-heal skipped:', upsertErr);
    }

    return fallbackProfile;
  } catch (err) {
    console.error('Error in fetchUserProfile:', err);
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSessionAndProfile = useCallback(async () => {
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        const userProfile = await fetchUserProfile(currentSession.user);
        setProfile(userProfile);
      } else {
        setProfile(null);
      }
    } catch (err) {
      console.error('Error loading session:', err);
      setSession(null);
      setUser(null);
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessionAndProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        const userProfile = await fetchUserProfile(newSession.user);
        setProfile(userProfile);
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadSessionAndProfile]);

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: error.message };
      }

      if (data.user) {
        const userProfile = await fetchUserProfile(data.user);
        setProfile(userProfile);
      }

      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'An unexpected error occurred during sign in.' };
    }
  };

  const signUp = async (
    email: string, 
    password: string, 
    portal: 'export' | 'domestic',
    role?: UserRole
  ): Promise<{ error: string | null }> => {
    try {
      const assignedRole: UserRole = (role && isValidRole(role)) 
        ? role 
        : (portal === 'export' ? 'export_staff' : 'domestic_staff');

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            portal,
            role: assignedRole,
          },
        },
      });

      if (error) {
        return { error: error.message };
      }

      if (data.user) {
        const userProfile = await fetchUserProfile(data.user);
        setProfile(userProfile);
      }

      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'An unexpected error occurred during sign up.' };
    }
  };

  const signInWithGoogle = async (portal: 'export' | 'domestic' = 'export'): Promise<{ error: string | null }> => {
    try {
      const redirectUrl = `${window.location.origin}/${portal}/dashboard`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Failed to initialize Google authentication.' };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error signing out:', err);
    } finally {
      setSession(null);
      setUser(null);
      setProfile(null);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      const updatedProfile = await fetchUserProfile(user);
      setProfile(updatedProfile);
    }
  };

  // Safely resolve active role
  const role: UserRole | null = profile?.role 
    ? profile.role 
    : (isValidRole(user?.user_metadata?.role) ? user.user_metadata.role : null);

  const hasAccessToPortal = (portal?: string): boolean => {
    if (!role) return false;
    if (role === 'admin') return true;

    if (portal === 'export') {
      return EXPORT_ROLES.includes(role);
    }
    if (portal === 'domestic') {
      return DOMESTIC_ROLES.includes(role);
    }
    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        isLoading,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
        refreshProfile,
        hasAccessToPortal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
