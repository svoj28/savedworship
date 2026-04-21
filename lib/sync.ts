// lib/sync.ts
import { supabase } from './supabase'
import { query, execute, transaction } from '../db/index'
import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Comprehensive Sync System for expo-sqlite and Supabase
 * 
 * Features:
 * - Bidirectional sync (push & pull)
 * - Offline queue with automatic retry
 * - Conflict resolution (server-side timestamps win)
 * - Real-time subscriptions
 * - Sync status tracking
 * - All entity types: artists, chord_lists, songs, lineups, messages, contacts, user profiles, etc.
 */

const TABLES = [
  'artists',
  'chord_lists',
  'songs',
  'lineups',
  'lineup_items',
  'messages',
  'file_droppers',
  'important_announcements',
  'version_droppers',
  'contacts',
  'user_profiles',
  'playlists',
  'playlist_items'
]

interface SyncOptions {
  includeOffline?: boolean
  maxRetries?: number
  conflictResolution?: 'server-wins' | 'client-wins'
}

interface SyncStatus {
  isSyncing: boolean
  lastSyncTime: number
  syncError: string | null
  pendingChanges: number
}

// Global sync status
let syncStatus: SyncStatus = {
  isSyncing: false,
  lastSyncTime: 0,
  syncError: null,
  pendingChanges: 0,
}

// Sync status listeners
const syncListeners: Set<(status: SyncStatus) => void> = new Set()

interface SyncLog {
  table: string
  lastSyncedAt: number
  recordsCount: number
}

/**
 * Register listener for sync status changes
 */
export function onSyncStatusChange(listener: (status: SyncStatus) => void): () => void {
  syncListeners.add(listener)
  return () => syncListeners.delete(listener)
}

/**
 * Get current sync status
 */
export function getSyncStatus(): SyncStatus {
  return { ...syncStatus }
}

/**
 * Notify all listeners of sync status change
 */
function notifySyncStatusChange() {
  syncListeners.forEach(listener => listener({ ...syncStatus }))
}

/**
 * Update sync status
 */
function updateSyncStatus(partial: Partial<SyncStatus>) {
  syncStatus = { ...syncStatus, ...partial }
  notifySyncStatusChange()
}

/**
 * Check if there are unsynced records for a given table and user
 */
async function countUnsyncedRecords(tableName: string, userId: string): Promise<number> {
  try {
    const results = await query(
      `SELECT COUNT(*) as count FROM ${tableName} WHERE _synced = 0 AND user_id = ?`,
      [userId]
    )
    return results[0]?.count || 0
  } catch (err) {
    console.error(`Error counting unsynced records in ${tableName}:`, err)
    return 0
  }
}

/**
 * Count total pending changes across all tables
 */
export async function countPendingChanges(userId: string): Promise<number> {
  let total = 0
  for (const tableName of TABLES) {
    total += await countUnsyncedRecords(tableName, userId)
  }
  return total
}

/**
 * Push local changes to Supabase
 * Sends all records where _synced = 0
 */
export async function syncPushToSupabase(userId: string, options: SyncOptions = {}) {
  const { maxRetries = 3, conflictResolution = 'server-wins' } = options

  try {
    for (const tableName of TABLES) {
      const unsyncedRecords: any[] = await query(
        `SELECT * FROM ${tableName} WHERE _synced = 0 AND user_id = ?`,
        [userId]
      )

      if (unsyncedRecords.length === 0) continue

      for (const record of unsyncedRecords) {
        let retries = 0
        let success = false

        while (retries < maxRetries && !success) {
          try {
            // Convert snake_case to camelCase for Supabase
            const data = convertToCamelCase(record)
            
            // Use BIGINT timestamp, not ISO string
            const timestamp = record.updated_at || Date.now()

            // Use upsert: insert if not exists, update if exists
            const { error } = await supabase.from(tableName).upsert(
              {
                ...data,
                user_id: userId,
                updated_at: timestamp,
                updated_at_iso: new Date(timestamp).toISOString(),
                _synced: true,
              },
              { onConflict: 'id' }
            )

            if (error) {
              console.warn(`Attempt ${retries + 1}: Failed to sync ${tableName}/${record.id}:`, error)
              retries++
              if (retries < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * retries)) // Exponential backoff
              }
            } else {
              // Mark as synced in local database
              await execute(
                `UPDATE ${tableName} SET _synced = 1 WHERE id = ?`,
                [record.id]
              )
              success = true
            }
          } catch (err) {
            console.error(`Error syncing ${tableName}/${record.id}:`, err)
            retries++
            if (retries < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000 * retries))
            }
          }
        }

        if (!success) {
          console.error(`Failed to sync ${tableName}/${record.id} after ${maxRetries} retries`)
        }
      }
    }
  } catch (err) {
    console.error('Error in syncPushToSupabase:', err)
    updateSyncStatus({ syncError: String(err) })
  }
}

/**
 * Pull changes from Supabase and update local database
 * Fetches records updated after the last sync time
 */
export async function syncPullFromSupabase(userId: string, lastSyncTime: number = 0, options: SyncOptions = {}) {
  const { conflictResolution = 'server-wins' } = options

  try {
    for (const tableName of TABLES) {
      try {
        // Build query with proper user_id filter
        let query = supabase
          .from(tableName)
          .select('*')
          .eq('user_id', userId)

        // Only filter by updated_at if we have a lastSyncTime
        if (lastSyncTime > 0) {
          const lastSyncIso = new Date(lastSyncTime).toISOString()
          query = query.gt('updated_at_iso', lastSyncIso)
        }

        const { data, error } = await query

        if (error) {
          console.error(`Failed to fetch ${tableName}:`, error)
          continue
        }

        if (!data || data.length === 0) continue

        // Batch write to database
        await transaction(async () => {
          for (const serverRecord of data) {
            try {
              // Check if record exists locally
              const localRecord: any = await query(
                `SELECT * FROM ${tableName} WHERE id = ?`,
                [serverRecord.id]
              )

              const snakeCaseRecord = convertToSnakeCase(serverRecord)

              if (localRecord && localRecord.length > 0) {
                // Check for conflicts based on timestamps
                const localTime = localRecord[0].updated_at || 0
                const serverTime = serverRecord.updated_at || 0

                if (conflictResolution === 'server-wins' || serverTime >= localTime) {
                  // Update existing record (server wins on conflicts)
                  const updates = Object.keys(snakeCaseRecord)
                    .map((key) => `${key} = ?`)
                    .join(', ')
                  const values = Object.values(snakeCaseRecord)

                  await execute(
                    `UPDATE ${tableName} SET ${updates}, _synced = 1 WHERE id = ?`,
                    [...values, serverRecord.id]
                  )
                }
              } else {
                // Create new record
                const columns = Object.keys(snakeCaseRecord).join(', ')
                const placeholders = Object.keys(snakeCaseRecord).map(() => '?').join(', ')
                const values = Object.values(snakeCaseRecord)

                await execute(
                  `INSERT INTO ${tableName} (${columns}, _synced) VALUES (${placeholders}, 1)`,
                  values
                )
              }
            } catch (err) {
              console.error(`Error upserting ${tableName}/${serverRecord.id}:`, err)
            }
          }
        })
      } catch (err) {
        console.error(`Error pulling ${tableName}:`, err)
      }
    }
  } catch (err) {
    console.error('Error in syncPullFromSupabase:', err)
    updateSyncStatus({ syncError: String(err) })
  }
}

/**
 * Full sync cycle: pull first, then push
 * Optimized to minimize conflicts
 */
export async function fullSync(userId: string, options: SyncOptions = {}): Promise<boolean> {
  if (syncStatus.isSyncing) {
    console.warn('Sync already in progress')
    return false
  }

  try {
    updateSyncStatus({ isSyncing: true, syncError: null })
    console.log('Starting full sync...')

    // Pull first to get latest server state
    const lastSync = await getLastSyncTime()
    await syncPullFromSupabase(userId, lastSync, options)

    // Then push local changes
    await syncPushToSupabase(userId, options)

    // Update last sync time
    await setLastSyncTime(Date.now())

    // Count pending changes
    const pending = await countPendingChanges(userId)
    updateSyncStatus({
      isSyncing: false,
      lastSyncTime: Date.now(),
      pendingChanges: pending,
      syncError: null
    })

    console.log('Full sync completed successfully')
    return true
  } catch (err) {
    const errorMsg = String(err)
    console.error('Error in fullSync:', err)
    updateSyncStatus({
      isSyncing: false,
      syncError: errorMsg
    })
    return false
  }
}

/**
 * Sync specific entity type
 */
export async function syncTable(tableName: string, userId: string, options: SyncOptions = {}): Promise<boolean> {
  if (!TABLES.includes(tableName)) {
    console.error(`Unknown table: ${tableName}`)
    return false
  }

  try {
    updateSyncStatus({ isSyncing: true, syncError: null })

    // Pull changes from server
    const lastSync = await getLastSyncTime()
    let query = supabase
      .from(tableName)
      .select('*')
      .eq('user_id', userId)

    if (lastSync > 0) {
      const lastSyncIso = new Date(lastSync).toISOString()
      query = query.gt('updated_at_iso', lastSyncIso)
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    // Update local records
    if (data && data.length > 0) {
      await transaction(async () => {
        for (const serverRecord of data) {
          const snakeCaseRecord = convertToSnakeCase(serverRecord)
          const localRecord: any = await query(`SELECT id FROM ${tableName} WHERE id = ?`, [serverRecord.id])

          if (localRecord && localRecord.length > 0) {
            const updates = Object.keys(snakeCaseRecord).map(key => `${key} = ?`).join(', ')
            const values = Object.values(snakeCaseRecord)
            await execute(
              `UPDATE ${tableName} SET ${updates}, _synced = 1 WHERE id = ?`,
              [...values, serverRecord.id]
            )
          } else {
            const columns = Object.keys(snakeCaseRecord).join(', ')
            const placeholders = Object.keys(snakeCaseRecord).map(() => '?').join(', ')
            const values = Object.values(snakeCaseRecord)
            await execute(
              `INSERT INTO ${tableName} (${columns}, _synced) VALUES (${placeholders}, 1)`,
              values
            )
          }
        }
      })
    }

    // Push local changes
    const unsyncedRecords: any[] = await query(
      `SELECT * FROM ${tableName} WHERE _synced = 0 AND user_id = ?`,
      [userId]
    )

    for (const record of unsyncedRecords) {
      const data = convertToCamelCase(record)
      const timestamp = record.updated_at || Date.now()
      
      const { error } = await supabase.from(tableName).upsert(
        {
          ...data,
          user_id: userId,
          updated_at: timestamp,
          updated_at_iso: new Date(timestamp).toISOString(),
          _synced: true
        },
        { onConflict: 'id' }
      )
      if (!error) {
        await execute(`UPDATE ${tableName} SET _synced = 1 WHERE id = ?`, [record.id])
      }
    }

    updateSyncStatus({ isSyncing: false })
    return true
  } catch (err) {
    console.error(`Error syncing ${tableName}:`, err)
    updateSyncStatus({ isSyncing: false, syncError: String(err) })
    return false
  }
}

/**
 * Listen for real-time changes from Supabase using Realtime subscriptions
 * This keeps local DB in sync without requiring manual syncs
 */
export function subscribeToChanges(userId: string, onUpdate: () => void) {
  const channels: any[] = []

  for (const tableName of TABLES) {
    const channel = supabase
      .channel(`${tableName}-changes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tableName,
          filter: `user_id=eq.${userId}`,
        },
        async () => {
          // When changes arrive, pull from server
          await syncPullFromSupabase(userId, Date.now() - 60000)
          onUpdate()
        }
      )
      .subscribe()

    channels.push(channel)
  }

  // Return unsubscribe function
  return () => {
    channels.forEach((ch) => supabase.removeChannel(ch))
  }
}

/**
 * Periodic sync - call this from app startup or on a timer
 */
export async function startPeriodicSync(userId: string, intervalMs: number = 60000) {
  // Initial sync
  await fullSync(userId)

  // Periodic sync
  const syncInterval = setInterval(async () => {
    await fullSync(userId)
  }, intervalMs)

  // Return cleanup function
  return () => clearInterval(syncInterval)
}

/**
 * Get all unsynced records for a specific table
 */
export async function getUnsyncedRecords(tableName: string, userId: string): Promise<any[]> {
  try {
    return await query(
      `SELECT * FROM ${tableName} WHERE _synced = 0 AND user_id = ?`,
      [userId]
    )
  } catch (err) {
    console.error(`Error getting unsynced records from ${tableName}:`, err)
    return []
  }
}

/**
 * Manually mark record as unsynced (after local modification)
 */
export async function markAsUnsynced(tableName: string, recordId: string): Promise<void> {
  try {
    await execute(
      `UPDATE ${tableName} SET _synced = 0, updated_at = ? WHERE id = ?`,
      [Date.now(), recordId]
    )
  } catch (err) {
    console.error(`Error marking ${tableName}/${recordId} as unsynced:`, err)
  }
}

/**
 * Clear sync status errors
 */
export function clearSyncError(): void {
  updateSyncStatus({ syncError: null })
}

/**
 * Helper: Convert snake_case to camelCase
 */
function convertToCamelCase(obj: any): any {
  const result: any = {}
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase())
    result[camelKey] = value
  }
  return result
}

/**
 * Helper: Convert camelCase to snake_case
 */
function convertToSnakeCase(obj: any): any {
  const result: any = {}
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
    result[snakeKey] = value
  }
  return result
}

/**
 * Store last sync time in AsyncStorage
 */
export async function getLastSyncTime(): Promise<number> {
  try {
    const time = await AsyncStorage.getItem('lastSyncTime')
    return time ? parseInt(time) : 0
  } catch (err) {
    console.error('Error getting lastSyncTime:', err)
    return 0
  }
}

export async function setLastSyncTime(time: number) {
  try {
    await AsyncStorage.setItem('lastSyncTime', time.toString())
  } catch (err) {
    console.error('Error setting lastSyncTime:', err)
  }
}
