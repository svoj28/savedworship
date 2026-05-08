// lib/supabaseKeepAlive.ts
// Simple daily keep‑alive ping for Supabase to avoid inactivity timeouts.
// It inserts a temporary row into a lightweight table and deletes it
// once per calendar day per user.

import { supabase } from './supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'
import uuid from 'react-native-uuid'

// Table used for the ping – version_droppers is cheap and has the needed columns.
const PING_TABLE = 'version_droppers'
const STORAGE_KEY = 'supabase_keepalive_last_date'

/**
 * Insert a temporary row and immediately delete it.
 * The operation is performed only once per day per user.
 */
export async function pingSupabaseOncePerDay(userId: string): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10) // YYYY‑MM‑DD
    const last = await AsyncStorage.getItem(STORAGE_KEY)
    if (last === today) return // already pinged today

    // Create a dummy row
    const id = uuid.v4()
    const now = Date.now()
    const payload = {
      id,
      title: 'keepalive',
      user_id: userId,
      youtube_url: '',
      description: '',
      created_at: now,
      updated_at: now,
    }
    // Insert
    const { error: insertErr } = await supabase.from(PING_TABLE).insert(payload)
    if (insertErr) {
      console.warn('Supabase keepalive insert failed:', insertErr)
      return
    }
    // Delete
    const { error: deleteErr } = await supabase.from(PING_TABLE).delete().eq('id', id)
    if (deleteErr) {
      console.warn('Supabase keepalive delete failed:', deleteErr)
    }
    // Record that we pinged today
    await AsyncStorage.setItem(STORAGE_KEY, today)
  } catch (e) {
    console.warn('Supabase keepalive error:', e)
  }
}
