// PlayerAuthContext ? Player Portal authentication context.
// COMPLETELY SEPARATE from CRM useAuth / AuthProvider.
// Uses player-auth Edge Function. Never exposes internal_email.
// Never grants CRM access. Player JWT stays isolated.
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { callPlayerAuth, callForgotPassword } from '../lib/playerAuth'

const PlayerAuthContext = createContext(null)

export function PlayerAuthProvider({ children }) {
  // undefined = still resolving, null = signed out, object = signed in
  const [session,  setSession]  = useState(undefined)
  const [user,     setUser]     = useState(null)
  const [profile,  setProfile]  = useState(null)
  const [isPlayer, setIsPlayer] = useState(false)
  const [loading,  setLoading]  = useState(true)

  // Prevent double-verification races
  const verifyingRef = useRef(false)

  // -- Verify + load profile for a session ----------------------------------
  const verifyAndLoad = useCallback(async (s) => {
    if (!s) {
      setSession(null)
      setUser(null)
      setProfile(null)
      setIsPlayer(false)
      setLoading(false)
      return
    }

    if (verifyingRef.current) return
    verifyingRef.current = true

    try {
      // Guard: confirm this is a genuine player session (not a CRM user)
      const { data: isP, error: guardErr } = await supabase.rpc('is_player_auth')

      if (guardErr || !isP) {
        console.warn('[PlayerAuth] Non-player session detected ? signing out.')
        await supabase.auth.signOut()
        setSession(null)
        setUser(null)
        setProfile(null)
        setIsPlayer(false)
        setLoading(false)
        return
      }

      // Load portal profile
      const { data: profileData, error: profileErr } = await supabase.rpc('get_my_portal_profile')

      if (profileErr) {
        console.warn('[PlayerAuth] get_my_portal_profile error:', profileErr.message)
      }

      setSession(s)
      setUser(s.user)
      setIsPlayer(true)
      setProfile(profileData ?? null)
    } catch (err) {
      console.error('[PlayerAuth] verifyAndLoad error:', err)
      setSession(null)
      setUser(null)
      setProfile(null)
      setIsPlayer(false)
    } finally {
      verifyingRef.current = false
      setLoading(false)
    }
  }, [])

  // -- Bootstrap: restore persisted session ---------------------------------
  useEffect(() => {
    let mounted = true

    ;(async () => {
      const { data: { session: existing } } = await supabase.auth.getSession()
      if (!mounted) return
      await verifyAndLoad(existing)
    })()

    // Listen for auth state changes (token refresh, sign-out from another tab, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return
      // Only re-verify if the session actually changed
      if (newSession?.access_token !== session?.access_token) {
        verifyAndLoad(newSession)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // -- login(username, password) ? { error: string | null } -----------------
  const login = useCallback(async (username, password) => {
    setLoading(true)
    try {
      // Step 1: Call player-auth Edge Function
      const { session: rawSession, error: authErr } = await callPlayerAuth(username, password)
      if (authErr) {
        setLoading(false)
        return { error: authErr }
      }

      // Step 2: Install session into Supabase client
      const { error: sessionErr } = await supabase.auth.setSession({
        access_token:  rawSession.access_token,
        refresh_token: rawSession.refresh_token,
      })
      if (sessionErr) {
        setLoading(false)
        return { error: 'Could not establish session. Please try again.' }
      }

      // Step 3: Verify player + load profile (called automatically via onAuthStateChange,
      //         but we also call directly to ensure state is set before redirect)
      const { data: { session: installedSession } } = await supabase.auth.getSession()
      await verifyAndLoad(installedSession)

      // Step 4: Final player check (verifyAndLoad signs out non-players automatically)
      if (!isPlayer) {
        // Will have been signed out already in verifyAndLoad
        return { error: 'This account does not have player access.' }
      }

      return { error: null }
    } catch (err) {
      console.error('[PlayerAuth] login error:', err)
      setLoading(false)
      return { error: 'Something went wrong. Please try again.' }
    }
  }, [verifyAndLoad, isPlayer])

  // -- logout() -------------------------------------------------------------
  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setUser(null)
    setProfile(null)
    setIsPlayer(false)
  }, [])

  // -- forgotPassword(username, email) ? { error: string | null } -----------
  const forgotPassword = useCallback(async (username, email) => {
    const result = await callForgotPassword(username, email)
    if (result.error) return { error: result.error }
    return { error: null }
  }, [])

  // -- Refresh profile (e.g. after a profile update) -------------------------
  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.rpc('get_my_portal_profile')
    setProfile(data ?? null)
  }, [])

  const value = {
    session,
    user,
    profile,
    loading,
    isAuthenticated: !!session && isPlayer,
    isPlayer,
    login,
    logout,
    forgotPassword,
    refreshProfile,
  }

  return (
    <PlayerAuthContext.Provider value={value}>
      {children}
    </PlayerAuthContext.Provider>
  )
}

export function usePlayerAuth() {
  const ctx = useContext(PlayerAuthContext)
  if (!ctx) throw new Error('usePlayerAuth must be used inside <PlayerAuthProvider>')
  return ctx
}
