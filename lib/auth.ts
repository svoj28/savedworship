// lib/auth.ts
import { supabase } from './supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { isOnline } from './networkStatus'

export const OFFLINE_GUEST_USER_ID = 'offline-guest'

function createOfflineGuestUser(): AuthUser {
  return {
    id: OFFLINE_GUEST_USER_ID,
    email: 'offline@local',
    user_metadata: { offline: true },
  }
}

export interface AuthUser {
  id: string
  email: string
  user_metadata?: Record<string, any>
}

export interface AuthError {
  message: string
  code?: string
}

/**
 * Sign up with email and password
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<{ user: AuthUser | null; error: AuthError | null }> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
        },
      },
    })

    if (error) {
      return { user: null, error: { message: error.message, code: error.code } }
    }

    if (data.user) {
      // Create local profile with displayName as nickname
      try {
        const { createUserProfile } = await import('../db/queries')
        await createUserProfile({
          userId: data.user.id,
          nickname: displayName || '',  // ← displayName becomes nickname
          bio: '',
          avatarUrl: '',
          instruments: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          synced: false,
          role: 'user',
        })
      } catch (profileErr) {
        console.warn('Profile creation skipped:', profileErr)
      }

      return {
        user: {
          id: data.user.id,
          email: data.user.email || '',
          user_metadata: data.user.user_metadata,
        },
        error: null,
      }
    }

    return { user: null, error: { message: 'Sign up failed' } }
  } catch (err) {
    return {
      user: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' },
    }
  }
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<{ user: AuthUser | null; error: AuthError | null }> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return { user: null, error: { message: error.message, code: error.code } }
    }

    if (data.user) {
      return {
        user: {
          id: data.user.id,
          email: data.user.email || '',
          user_metadata: data.user.user_metadata,
        },
        error: null,
      }
    }

    return { user: null, error: { message: 'Sign in failed' } }
  } catch (err) {
    return {
      user: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' },
    }
  }
}

/**
 * Sign in with Google (Expo)
 * Note: For Google OAuth to work in React Native, you need to:
 * 1. Set up OAuth credentials in Google Cloud Console
 * 2. Configure Redirect URI in Supabase dashboard
 * 3. Use deeplink handling to capture auth callback
 */
export async function signInWithGoogle(): Promise<{
  user: AuthUser | null
  error: AuthError | null
}> {
  try {
    // This is a simplified version. In production, you'll need:
    // - expo-auth-session for proper OAuth flow
    // - deeplink handling for redirect URI
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'savedworshipmusictool://auth/callback',
      },
    })

    if (error) {
      return { user: null, error: { message: error.message } }
    }

    return { user: null, error: null } // Will complete via deeplink
  } catch (err) {
    return {
      user: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' },
    }
  }
}

/**
 * Sign out current user
 */
export async function signOut(): Promise<{ error: AuthError | null }> {
  try {
    const { error } = await supabase.auth.signOut()

    if (error) {
      return { error: { message: error.message } }
    }

    return { error: null }
  } catch (err) {
    return {
      error: { message: err instanceof Error ? err.message : 'Unknown error' },
    }
  }
}

/**
 * Get current authenticated user (from session)
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const { data, error } = await supabase.auth.getSession()

    if (error || !data.session?.user) {
      if (!(await isOnline())) {
        return createOfflineGuestUser()
      }
      return null
    }

    return {
      id: data.session.user.id,
      email: data.session.user.email || '',
      user_metadata: data.session.user.user_metadata,
    }
  } catch (err) {
    console.error('Error getting current user:', err)
    return null
  }
}

/**
 * Check if user is authenticated (check stored session)
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession()
    return !!data.session
  } catch {
    return false
  }
}

/**
 * Listen for auth state changes
 */
export function onAuthStateChange(
  callback: (user: AuthUser | null) => void
): () => void {
  const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      callback({
        id: session.user.id,
        email: session.user.email || '',
        user_metadata: session.user.user_metadata,
      })
    } else {
      callback((await isOnline()) ? null : createOfflineGuestUser())
    }
  })

  // Return unsubscribe function
  return () => {
    if (data?.subscription) {
      data.subscription.unsubscribe()
    }
  }
}

/**
 * Password reset - send reset link to email
 */
export async function resetPassword(email: string): Promise<{ error: AuthError | null }> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: 'savedworship://reset-password',
})

    if (error) {
      return { error: { message: error.message } }
    }

    return { error: null }
  } catch (err) {
    return {
      error: { message: err instanceof Error ? err.message : 'Unknown error' },
    }
  }
}
