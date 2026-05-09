// lib/sync.ts
import { supabase } from './supabase'
import { query, execute, transaction } from '../db/index'
import AsyncStorage from '@react-native-async-storage/async-storage'

const TABLES = [
  'user_profiles',
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
  'playlists',
  'playlist_items'
]

interface SyncOptions {
  includeOffline?: boolean
  maxRetries?: number
  conflictResolution?: 'server-wins' | 'client-wins'
}

let isSyncRunning = false

async function guardedSync(userId: string, since: number) {
  if (isSyncRunning) return   // already syncing, skip
  isSyncRunning = true
  try {
    await syncPullFromSupabase(userId, since)
  } finally {
    isSyncRunning = false
  }
}

interface SyncStatus {
  isSyncing: boolean
  lastSyncTime: number
  syncError: string | null
  pendingChanges: number
}

let syncStatus: SyncStatus = {
  isSyncing: false,
  lastSyncTime: 0,
  syncError: null,
  pendingChanges: 0,
}

const syncListeners: Set<(status: SyncStatus) => void> = new Set()
const refreshListeners: Set<(table: string) => void> = new Set()

export function onDataRefresh(listener: (table: string) => void): () => void {
  refreshListeners.add(listener)
  return () => refreshListeners.delete(listener)
}

function notifyDataRefresh(table: string) {
  refreshListeners.forEach(l => l(table))
}

interface SyncLog {
  table: string
  lastSyncedAt: number
  recordsCount: number
}

export function onSyncStatusChange(listener: (status: SyncStatus) => void): () => void {
  syncListeners.add(listener)
  return () => syncListeners.delete(listener)
}

export function getSyncStatus(): SyncStatus {
  return { ...syncStatus }
}

function notifySyncStatusChange() {
  syncListeners.forEach(listener => listener({ ...syncStatus }))
}

function updateSyncStatus(partial: Partial<SyncStatus>) {
  syncStatus = { ...syncStatus, ...partial }
  notifySyncStatusChange()
}

function toSupabasePayload(record: any) {
  const { _synced, ...rest } = record
  return rest
}

async function countUnsyncedRecords(tableName: string, userId: string): Promise<number> {
  try {
    const results = await query(
      `SELECT COUNT(*) as count FROM ${tableName} WHERE _synced = 0 AND user_id = ?`,
      [userId]
    ) as { count: number }[]
    return results[0]?.count || 0
  } catch (err) {
    console.error(`Error counting unsynced records in ${tableName}:`, err)
    return 0
  }
}

export async function countPendingChanges(userId: string): Promise<number> {
  let total = 0
  for (const tableName of TABLES) {
    total += await countUnsyncedRecords(tableName, userId)
  }
  return total
}

export async function syncPushToSupabase(userId: string, options: SyncOptions = {}) {
  const { maxRetries = 3 } = options
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', userId)
    .single()

  if (!profile?.role) {
    console.warn('No role found for user — skipping push sync. Profile may not be initialized.')
    return
  }

  try {
    const unsyncedMessages: any[] = await query(
      `SELECT * FROM messages WHERE _synced = 0 AND sender_id = ?`,
      [userId]
    )
    for (const record of unsyncedMessages) {
      const payload = toSupabasePayload(record)
      const { error } = await supabase
        .from('messages')
        .upsert(convertToSnakeCase(payload), { onConflict: 'id' })
      if (!error) {
        await execute(`UPDATE messages SET _synced = 1 WHERE id = ?`, [record.id])
      } else {
        console.warn('Failed to push message:', error)
      }
    }

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
            const data = toSupabasePayload(record)
            const timestamp = record.updated_at || Date.now()
            const conflictColumn = tableName === 'user_profiles' ? 'user_id' : 'id'

            const { error } = await supabase.from(tableName).upsert(
              {
                ...convertToSnakeCase(data),
                user_id: userId,
                updated_at: timestamp,
                updated_at_iso: new Date(timestamp).toISOString(),
              },
              { onConflict: conflictColumn }
            )

            if (error) {
              console.warn(`Attempt ${retries + 1}: Failed to sync ${tableName}/${record.id}:`, error)
              retries++
              if (retries < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * retries))
              }
            } else {
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

export async function syncPullFromSupabase(userId: string, lastSyncTime: number = 0, options: SyncOptions = {}) {
  const { conflictResolution = 'server-wins' } = options

  try {
    for (const tableName of TABLES) {
      try {

        // ─── MESSAGES ─────────────────────────────────────────────────────
        if (tableName === 'messages') {
          const { data: sentMessages } = await supabase
            .from('messages')
            .select('*')
            .eq('sender_id', userId)

          const { data: receivedMessages } = await supabase
            .from('messages')
            .select('*')
            .eq('receiver_id', userId)

          const { data: overallMessages } = await supabase
            .from('messages')
            .select('*')
            .eq('receiver_id', 'overall-chat')

          const combined = [
            ...(sentMessages || []),
            ...(receivedMessages || []),
            ...(overallMessages || []),
          ]

          const seen = new Set()
          const data = combined.filter(row => {
            if (seen.has(row.id)) return false
            seen.add(row.id)
            return true
          })

          if (data.length > 0) {
            for (const serverRecord of data) {
              try {
                const localRecord: any = await query(
                  `SELECT * FROM messages WHERE id = ?`,
                  [serverRecord.id]
                )
                const snakeCaseRecord = convertToSnakeCase(serverRecord)

                if (localRecord && localRecord.length > 0) {
                  const localTime = localRecord[0].updated_at || 0
                  const serverTime = serverRecord.updated_at || 0
                  if (conflictResolution === 'server-wins' || serverTime >= localTime) {
                    const updates = Object.keys(snakeCaseRecord).map(k => `${k} = ?`).join(', ')
                    await execute(
                      `UPDATE messages SET ${updates}, _synced = 1 WHERE id = ?`,
                      [...Object.values(snakeCaseRecord), serverRecord.id]
                    )
                  }
                } else {
                  const columns = Object.keys(snakeCaseRecord).join(', ')
                  const placeholders = Object.keys(snakeCaseRecord).map(() => '?').join(', ')
                  await execute(
                    `INSERT INTO messages (${columns}, _synced) VALUES (${placeholders}, 1)`,
                    Object.values(snakeCaseRecord)
                  )
                }
              } catch (err) {
                console.error(`Error upserting messages/${serverRecord.id}:`, err)
              }
            }
          }
          continue
        }

        // ─── CONTACTS ─────────────────────────────────────────────────────
        if (tableName === 'contacts') {
          const { data: sentContacts } = await supabase
            .from('contacts')
            .select('*')
            .eq('user_id', userId)

          const { data: receivedContacts } = await supabase
            .from('contacts')
            .select('*')
            .eq('contact_user_id', userId)

          const combined = [
            ...(sentContacts || []),
            ...(receivedContacts || []),
          ]

          const seen = new Set()
          const data = combined.filter(row => {
            if (seen.has(row.id)) return false
            seen.add(row.id)
            return true
          })

          if (data.length > 0) {
            for (const serverRecord of data) {
              try {
                const localRecord: any = await query(
                  `SELECT * FROM contacts WHERE id = ?`,
                  [serverRecord.id]
                )
                const snakeCaseRecord = convertToSnakeCase(serverRecord)

                if (localRecord && localRecord.length > 0) {
                  const localTime = localRecord[0].updated_at || 0
                  const serverTime = serverRecord.updated_at || 0
                  if (conflictResolution === 'server-wins' || serverTime >= localTime) {
                    const updates = Object.keys(snakeCaseRecord).map(k => `${k} = ?`).join(', ')
                    await execute(
                      `UPDATE contacts SET ${updates}, _synced = 1 WHERE id = ?`,
                      [...Object.values(snakeCaseRecord), serverRecord.id]
                    )
                  }
                } else {
                  const columns = Object.keys(snakeCaseRecord).join(', ')
                  const placeholders = Object.keys(snakeCaseRecord).map(() => '?').join(', ')
                  await execute(
                    `INSERT INTO contacts (${columns}, _synced) VALUES (${placeholders}, 1)`,
                    Object.values(snakeCaseRecord)
                  )
                }
              } catch (err) {
                console.error(`Error upserting contacts/${serverRecord.id}:`, err)
              }
            }
          }
          continue
        }

        // ─── USER_PROFILES ────────────────────────────────────────────────
        if (tableName === 'user_profiles') {
          const { data, error } = await supabase
            .from('user_profiles')
            .select('*')

          if (error) {
            console.error(`Failed to fetch user_profiles:`, error)
            continue
          }

          if (!data || data.length === 0) continue

          for (const serverRecord of data) {
            try {
              const localRecord: any = await query(
                `SELECT * FROM user_profiles WHERE user_id = ?`,
                [serverRecord.user_id]
              )
              const snakeCaseRecord = convertToSnakeCase(serverRecord)

              if (localRecord && localRecord.length > 0) {
                const localTime = localRecord[0].updated_at || 0
                const serverTime = serverRecord.updated_at || 0
                if (conflictResolution === 'server-wins' || serverTime >= localTime) {
                  const updates = Object.keys(snakeCaseRecord).map(k => `${k} = ?`).join(', ')
                  await execute(
                    `UPDATE user_profiles SET ${updates}, _synced = 1 WHERE user_id = ?`,
                    [...Object.values(snakeCaseRecord), serverRecord.user_id]
                  )
                }
              } else {
                const columns = Object.keys(snakeCaseRecord).join(', ')
                const placeholders = Object.keys(snakeCaseRecord).map(() => '?').join(', ')
                await execute(
                  `INSERT OR REPLACE INTO user_profiles (${columns}, _synced) VALUES (${placeholders}, 1)`,
                  Object.values(snakeCaseRecord)
                )
              }
            } catch (err) {
              console.error(`Error upserting user_profiles/${serverRecord.id}:`, err)
            }
          }
          continue
        }

        // ─── ALL OTHER TABLES ─────────────────────────────────────────────
        let supabaseQuery = supabase
          .from(tableName)
          .select('*')
          .eq('user_id', userId)

        if (lastSyncTime > 0) {
          const lastSyncIso = new Date(lastSyncTime).toISOString()
          supabaseQuery = supabaseQuery.gt('updated_at_iso', lastSyncIso)
        }

        const { data, error } = await supabaseQuery

        if (error) {
          console.error(`Failed to fetch ${tableName}:`, error)
          continue
        }

        if (!data || data.length === 0) continue

        for (const serverRecord of data) {
          try {
            const localRecord: any = await query(
              `SELECT * FROM ${tableName} WHERE id = ?`,
              [serverRecord.id]
            )
            const snakeCaseRecord = convertToSnakeCase(serverRecord)

            if (localRecord && localRecord.length > 0) {
              const localTime = localRecord[0].updated_at || 0
              const serverTime = serverRecord.updated_at || 0
              if (conflictResolution === 'server-wins' || serverTime >= localTime) {
                const updates = Object.keys(snakeCaseRecord).map(k => `${k} = ?`).join(', ')
                await execute(
                  `UPDATE ${tableName} SET ${updates}, _synced = 1 WHERE id = ?`,
                  [...Object.values(snakeCaseRecord), serverRecord.id]
                )
              }
            } else {
              const columns = Object.keys(snakeCaseRecord).join(', ')
              const placeholders = Object.keys(snakeCaseRecord).map(() => '?').join(', ')
              await execute(
                `INSERT INTO ${tableName} (${columns}, _synced) VALUES (${placeholders}, 1)`,
                Object.values(snakeCaseRecord)
              )
            }
          } catch (err) {
            console.error(`Error upserting ${tableName}/${serverRecord.id}:`, err)
          }
        }

      } catch (err) {
        console.error(`Error pulling ${tableName}:`, err)
      }
    }
  } catch (err) {
    console.error('Error in syncPullFromSupabase:', err)
    updateSyncStatus({ syncError: String(err) })
  }
}

export async function fullSync(userId: string, options: SyncOptions = {}): Promise<boolean> {
  if (isSyncRunning) {
    console.warn('Sync already in progress')
    return false
  }
  isSyncRunning = true
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    console.warn('No Supabase session found, skipping push sync')
    return false
  }

  try {
    updateSyncStatus({ isSyncing: true, syncError: null })
    console.log('Starting full sync...')

    const lastSync = await getLastSyncTime()
    await syncPullFromSupabase(userId, lastSync, options)
    await syncPushToSupabase(userId, options)

    await setLastSyncTime(Date.now())

    let pending = 0
    try {
      pending = await countPendingChanges(userId)
    } catch (err) {
      console.warn('Could not count pending changes, defaulting to 0:', err)
    }
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
    updateSyncStatus({ isSyncing: false, syncError: errorMsg })
    return false
  }
}

export async function syncTable(tableName: string, userId: string, options: SyncOptions = {}): Promise<boolean> {
  if (!TABLES.includes(tableName)) {
    console.error(`Unknown table: ${tableName}`)
    return false
  }

  try {
    updateSyncStatus({ isSyncing: true, syncError: null })

    const lastSync = await getLastSyncTime()
    let supabaseQuery = supabase
      .from(tableName)
      .select('*')
      .eq('user_id', userId)

    if (lastSync > 0) {
      const lastSyncIso = new Date(lastSync).toISOString()
      supabaseQuery = supabaseQuery.gt('updated_at_iso', lastSyncIso)
    }

    const { data, error } = await supabaseQuery
    if (error) throw error

    if (data && data.length > 0) {
      for (const serverRecord of data) {
        const snakeCaseRecord = convertToSnakeCase(serverRecord)
        const localRecord: any = await query(
          `SELECT id FROM ${tableName} WHERE id = ?`,
          [serverRecord.id]
        )

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
    }

    const unsyncedRecords: any[] = await query(
      `SELECT * FROM ${tableName} WHERE _synced = 0 AND user_id = ?`,
      [userId]
    )

    for (const record of unsyncedRecords) {
      const data = toSupabasePayload(record)
      const timestamp = record.updated_at || Date.now()
      const conflictColumn = tableName === 'user_profiles' ? 'user_id' : 'id'

      const { error } = await supabase.from(tableName).upsert(
        {
          ...convertToSnakeCase(data),
          user_id: userId,
          updated_at: timestamp,
          updated_at_iso: new Date(timestamp).toISOString(),
        },
        { onConflict: conflictColumn }
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

// ─── Sync Queue ───────────────────────────────────────────────────────────────


export function subscribeToChanges(userId: string, onUpdate: () => void) {
  const channels: any[] = []
  const stamp = Date.now()

  for (const tableName of TABLES) {
    const channel = supabase
      .channel(`${tableName}-changes-${stamp}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tableName,
          filter: `user_id=eq.${userId}`,
        },
      async () => {
        notifyDataRefresh(tableName)
        await guardedSync(userId, Date.now() - 60000)
        notifyDataRefresh(tableName)
        onUpdate()
      }
      )
      .subscribe()
    channels.push(channel)
  }

  // Incoming contact requests
  const incomingContactsChannel = supabase
    .channel(`contacts-incoming-changes-${stamp}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'contacts',
        filter: `contact_user_id=eq.${userId}`,
      },
      async () => {
        notifyDataRefresh('contacts')
        
         await guardedSync(userId, Date.now() - 60000)
          notifyDataRefresh('contacts')
          onUpdate()

      }
    )
    .subscribe()
  channels.push(incomingContactsChannel)

  // Incoming direct messages
  const incomingMessagesChannel = supabase
    .channel(`messages-incoming-${stamp}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${userId}`,
      },
      async () => {
        notifyDataRefresh('messages')
       
          await guardedSync(userId, Date.now() - 60000)
          notifyDataRefresh('messages')
          onUpdate()
  
      }
    )
    .subscribe()
  channels.push(incomingMessagesChannel)

  // Overall chat messages
  const overallChatChannel = supabase
    .channel(`messages-overall-${stamp}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.overall-chat`,
      },
      async () => {
        notifyDataRefresh('messages')
     
          await guardedSync(userId, Date.now() - 60000)
          notifyDataRefresh('messages')
          onUpdate()
   
      }
    )
    .subscribe()
  channels.push(overallChatChannel)

  return () => {
    channels.forEach((ch) => supabase.removeChannel(ch))
  }
}

export async function startPeriodicSync(userId: string, intervalMs: number = 60000) {
  await fullSync(userId)

  const syncInterval = setInterval(async () => {
    await fullSync(userId)
  }, intervalMs)

  return () => clearInterval(syncInterval)
}

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

export function clearSyncError(): void {
  updateSyncStatus({ syncError: null })
}

function convertToCamelCase(obj: any): any {
  const result: any = {}
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase())
    result[camelKey] = value
  }
  return result
}

function convertToSnakeCase(obj: any): any {
  const result: any = {}
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
    result[snakeKey] = value
  }
  return result
}

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

export async function stampUserIdOnUnsyncedRows(userId: string) {
  for (const tableName of TABLES) {
    try {
      await execute(
        `UPDATE ${tableName} SET user_id = ? WHERE user_id IS NULL OR user_id = ''`,
        [userId]
      )
    } catch (err) {
      console.error(`Failed to stamp user_id on ${tableName}:`, err)
    }
  }
}

export async function removeOrphanedUnsyncedRows(userId: string) {
  for (const tableName of TABLES) {
    try {
      await execute(
        `DELETE FROM ${tableName} WHERE _synced = 0 AND user_id != ? AND user_id != ''`,
        [userId]
      )
    } catch (err) {
      console.error(`Failed to clean orphaned rows in ${tableName}:`, err)
    }
  }

  try {
    await execute(
      `DELETE FROM messages WHERE _synced = 0 AND sender_id != ? AND sender_id != ''`,
      [userId]
    )
  } catch (err) {
    console.error('Failed to clean orphaned messages:', err)
  }
}