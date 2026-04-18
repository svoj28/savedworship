// lib/sync.ts
import { supabase } from './supabase'
import { query, execute, transaction } from '../db/index'
import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Sync Adapter for expo-sqlite and Supabase
 * 
 * Strategy:
 * 1. Pull: Fetch unsynced records from Supabase, create/update locally
 * 2. Push: Send local unsynced records to Supabase, mark as synced
 * 3. Conflict resolution: Server-side timestamps win (last-write-wins)
 */

const TABLES = ['artists', 'chord_lists', 'songs', 'lineups', 'lineup_items', 'messages', 'file_droppers', 'important_announcements', 'version_droppers']

interface SyncLog {
  table: string
  lastSyncedAt: number
  recordsCount: number
}

/**
 * Push local changes to Supabase
 * Sends all records where _synced = 0
 */
export async function syncPushToSupabase(userId: string) {
  try {
    for (const tableName of TABLES) {
      const unsyncedRecords: any[] = await query(
        `SELECT * FROM ${tableName} WHERE _synced = 0 AND user_id = ?`,
        [userId]
      )

      if (unsyncedRecords.length === 0) continue

      for (const record of unsyncedRecords) {
        try {
          // Convert snake_case to camelCase for Supabase
          const data = convertToCamelCase(record)

          // Use upsert: insert if not exists, update if exists
          const { error } = await supabase.from(tableName).upsert(
            {
              ...data,
              user_id: userId,
              updated_at: Date.now(),
              _synced: true,
            },
            { onConflict: 'id' }
          )

          if (error) {
            console.error(`Failed to sync ${tableName}/${record.id}:`, error)
          } else {
            // Mark as synced in local database
            await execute(
              `UPDATE ${tableName} SET _synced = 1 WHERE id = ?`,
              [record.id]
            )
          }
        } catch (err) {
          console.error(`Error syncing ${tableName}/${record.id}:`, err)
        }
      }
    }
  } catch (err) {
    console.error('Error in syncPushToSupabase:', err)
  }
}

/**
 * Pull changes from Supabase and update local database
 * Fetches records updated after the last sync time
 */
export async function syncPullFromSupabase(userId: string, lastSyncTime: number = 0) {
  try {
    for (const tableName of TABLES) {
      try {
        // Fetch updated records from server
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .eq('user_id', userId)
          .gt('updated_at', lastSyncTime)

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
                `SELECT id FROM ${tableName} WHERE id = ?`,
                [serverRecord.id]
              )

              const snakeCaseRecord = convertToSnakeCase(serverRecord)

              if (localRecord && localRecord.length > 0) {
                // Update existing record (server wins on conflicts)
                const updates = Object.keys(snakeCaseRecord)
                  .map((key) => `${key} = ?`)
                  .join(', ')
                const values = Object.values(snakeCaseRecord)

                await execute(
                  `UPDATE ${tableName} SET ${updates}, _synced = 1 WHERE id = ?`,
                  [...values, serverRecord.id]
                )
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
  }
}

/**
 * Full sync cycle: pull first, then push
 * Optimized to minimize conflicts
 */
export async function fullSync(userId: string) {
  try {
    console.log('Starting full sync...')

    // Pull first to get latest server state
    const lastSync = await getLastSyncTime()
    await syncPullFromSupabase(userId, lastSync)

    // Then push local changes
    await syncPushToSupabase(userId)

    // Update last sync time
    await setLastSyncTime(Date.now())

    console.log('Full sync completed')
  } catch (err) {
    console.error('Error in fullSync:', err)
  }
}

/**
 * Listen for real-time changes from Supabase using Realtime subscriptions
 * This keeps local DB in sync without requiring manual syncs
 */
export function subscribeToChanges(userId: string, onUpdate: () => void) {
  const channels = []

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
async function getLastSyncTime(): Promise<number> {
  try {
    const time = await AsyncStorage.getItem('lastSyncTime')
    return time ? parseInt(time) : 0
  } catch (err) {
    console.error('Error getting lastSyncTime:', err)
    return 0
  }
}

async function setLastSyncTime(time: number) {
  try {
    await AsyncStorage.setItem('lastSyncTime', time.toString())
  } catch (err) {
    console.error('Error setting lastSyncTime:', err)
  }
}
