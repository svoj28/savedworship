// lib/supabaseKeepAlive.ts
// Simple daily keep-alive ping for Supabase to avoid inactivity timeouts.
// It performs a cheap authenticated read once per calendar day per user.

import { supabase } from './supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { isOnline } from './networkStatus'

// Table used for the ping – this already has an RLS policy in the app.
const PING_TABLE = 'metronome_presets'
const STORAGE_KEY = (userId: string) => `supabase_keepalive_last_date:${userId}`

/**
 * Perform a cheap authenticated read.
 * The operation is performed only once per day per user.
 */
export async function pingSupabaseOncePerDay(userId: string): Promise<void> {
  try {
    if (!(await isOnline())) return

    const today = new Date().toISOString().slice(0, 10) // YYYY‑MM‑DD
    const last = await AsyncStorage.getItem(STORAGE_KEY(userId))
    if (last === today) return // already pinged today

    const { error } = await supabase
      .from(PING_TABLE)
      .select('id')
      .eq('user_id', userId)
      .limit(1)

    if (error) {
      console.warn('Supabase keepalive query failed:', error)
      return
    }

    // Record that we pinged today
    await AsyncStorage.setItem(STORAGE_KEY(userId), today)
  } catch (e) {
    console.warn('Supabase keepalive error:', e)
  }
}
