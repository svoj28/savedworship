# Database Sync System - Complete Guide

## Overview

The SavedWorshipMusicTool now has a comprehensive, bidirectional sync system that automatically synchronizes all database changes between your local device and the cloud (Supabase). This enables:

- **Offline-first functionality**: Work without internet, sync when online
- **Real-time collaboration**: Changes sync automatically across devices
- **Conflict resolution**: Server timestamps win (last-write-wins strategy)
- **Automatic retry**: Failed syncs retry with exponential backoff
- **Periodic sync**: Regular background syncing every 60 seconds
- **Real-time subscriptions**: Instant updates when others make changes

## What Gets Synced

All of the following entity types are automatically synced:

### Core Data
- **Artists**: Song artist information
- **Chord Lists**: Collections of songs with chords
- **Songs**: Individual song details and chord content
- **User Profiles**: Nickname, bio, avatar, instruments

### Organization
- **Lineups**: Service/performance lineups
- **Lineup Items**: Songs in a lineup with position
- **Playlists**: Custom music playlists
- **Playlist Items**: Songs/chords in a playlist

### Communication & Sharing
- **Messages**: Direct messages between users
- **Contacts**: User connections and contact management
- **File Droppers**: Shared files and resources
- **Important Announcements**: Announcements from organizers
- **Version Droppers**: Video versions (YouTube links)

## How It Works

### The Sync Cycle

1. **Pull Phase** (Fetch from cloud)
   - Checks Supabase for any records modified since last sync
   - Compares with local records
   - Updates local database with newer server data
   - Handles conflicts using last-write-wins (server timestamps win)

2. **Push Phase** (Send to cloud)
   - Finds all local records marked as `_synced = 0`
   - Sends them to Supabase using upsert (insert or update)
   - Marks records as synced when successful
   - Retries failed records up to 3 times with exponential backoff

3. **Status Update**
   - Updates last sync time
   - Counts pending changes
   - Notifies listeners of sync status

### Sync Markers

Every record in the database has a `_synced` column:
- `_synced = 0`: Local changes not yet synced to cloud
- `_synced = 1`: Record is in sync with cloud

When you create or modify any record, it's automatically marked as `_synced = 0` and will be synced on the next sync cycle.

## Using the Sync System

### Automatic Sync (Recommended)

The app automatically syncs every 60 seconds when a user is logged in. No additional code needed!

```typescript
// App.tsx already handles this:
// - Periodic sync starts when user logs in
// - Sync runs every 60 seconds
// - Real-time subscriptions listen for server changes
// - Cleanup happens when user logs out
```

### Manual Sync from Components

Use the `useSyncManager` hook in any component:

```typescript
import { useSyncManager } from '../lib/useSyncManager'

export function MyComponent() {
  const userId = 'user-123'
  
  const {
    isSyncing,
    syncError,
    pendingChanges,
    lastSyncTime,
    sync,
    syncTable,
    clearError
  } = useSyncManager({
    userId,
    autoSync: true,        // Enable automatic sync
    syncInterval: 60000,   // Sync every 60 seconds
    enableRealtime: true   // Real-time subscriptions
  })

  return (
    <View>
      {isSyncing && <Text>Syncing...</Text>}
      {syncError && (
        <View>
          <Text>Sync Error: {syncError}</Text>
          <Button title="Retry" onPress={() => sync()} />
          <Button title="Clear Error" onPress={() => clearError()} />
        </View>
      )}
      <Text>Pending Changes: {pendingChanges}</Text>
      <Text>Last Synced: {new Date(lastSyncTime).toLocaleString()}</Text>
      <Button title="Sync Now" onPress={() => sync()} />
      <Button title="Sync Chords" onPress={() => syncTable('chord_lists')} />
    </View>
  )
}
```

### Direct Sync Functions

For fine-grained control, use sync functions directly:

```typescript
import {
  fullSync,
  syncTable,
  countPendingChanges,
  getSyncStatus,
  getUnsyncedRecords,
  markAsUnsynced
} from '../lib/sync'

// Full sync (pull + push)
const success = await fullSync(userId)

// Sync specific table
await syncTable('messages', userId)

// Count pending changes
const pending = await countPendingChanges(userId)

// Get sync status
const status = getSyncStatus()
console.log(status.isSyncing, status.lastSyncTime, status.syncError)

// Get unsynced records
const unsyncedMessages = await getUnsyncedRecords('messages', userId)

// Manually mark record as unsynced (after local modification outside normal flow)
await markAsUnsynced('songs', songId)
```

### Working with Database Queries

All database queries automatically mark records as unsynced on create/update:

```typescript
import { 
  createChordList, 
  updateChordList,
  createSong,
  updateSong,
  createMessage,
  editMessage,
  deleteMessage
} from '../db/queries'

// Create - automatically _synced = 0
const chordList = await createChordList({
  title: 'Amazing Grace',
  userId: 'user-123',
  artistId: 'artist-456',
  isPrivate: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  synced: false
})

// Update - automatically _synced = 0 + updated_at set to now
await updateChordList(chordListId, {
  title: 'Amazing Grace (Arranged)',
  isPrivate: true
})

// Create song
const song = await createSong({
  chordListId,
  title: 'Amazing Grace',
  content: '[G] Amazing grace...',
  key: 'G',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  synced: false
})

// Update song
await updateSong(songId, {
  content: '[G] Amazing grace, how sweet the sound...',
  key: 'G'
})

// Messages with special handling
const message = await createMessage({
  senderId: 'user-123',
  receiverId: 'user-456',
  text: 'Check this out!',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  isDeleted: false,
  synced: false
})

// Edit message
await editMessage(messageId, 'Check this OUT!')

// Delete message (soft delete - marked as deleted but preserved)
await deleteMessage(messageId)
```

## Sync Status Hook

Monitor sync status in real-time:

```typescript
import { useSyncStatus } from '../lib/useSyncManager'

export function SyncIndicator() {
  const { isSyncing, syncError, lastSyncTime } = useSyncStatus('chord_lists')

  return (
    <View>
      {isSyncing && <ActivityIndicator />}
      {syncError && <Text style={{ color: 'red' }}>Sync failed</Text>}
      <Text>Last sync: {new Date(lastSyncTime).toLocaleTimeString()}</Text>
    </View>
  )
}
```

## Account Details & Profile Sync

User profile changes are automatically synced:

```typescript
import { updateUserProfile } from '../db/queries'

// Update user profile - automatically synced
await updateUserProfile(userId, {
  nickname: 'Grace',
  bio: 'Worship leader',
  avatarUrl: 'https://...',
  instruments: 'Piano, Guitar'
})

// Profile will be synced to Supabase in the next sync cycle
```

## Handling Sync Errors

The system has built-in error handling and retry logic:

```typescript
import { useSyncManager } from '../lib/useSyncManager'

function ErrorBoundary() {
  const { sync, syncError, clearError } = useSyncManager({
    userId: 'user-123',
    autoSync: true
  })

  if (syncError) {
    return (
      <View>
        <Text>Sync Error: {syncError}</Text>
        <Button 
          title="Retry Sync"
          onPress={async () => {
            clearError()
            await sync()
          }}
        />
      </View>
    )
  }

  return null
}
```

## Offline Behavior

The system handles offline scenarios gracefully:

1. **Changes are saved locally** even without internet
2. **Local changes are marked as unsynced** (`_synced = 0`)
3. **When online, sync resumes automatically**
4. **Conflicts are resolved** with server timestamps winning

## Sync Statistics

Get insights into your sync status:

```typescript
import { countPendingChanges, getSyncStatus } from '../lib/sync'

const status = getSyncStatus()
console.log({
  isSyncing: status.isSyncing,
  lastSyncTime: status.lastSyncTime,
  syncError: status.syncError,
  pendingChanges: status.pendingChanges
})

// Count specific pending changes
const pending = await countPendingChanges(userId)
console.log(`${pending} records need syncing`)

// Get unsynced records by table
const unsyncedChords = await getUnsyncedRecords('chord_lists', userId)
console.log(`${unsyncedChords.length} chord lists need syncing`)
```

## Conflict Resolution Strategy

### Last-Write-Wins (Default)

When the same record is modified both locally and on the server:
- The version with the later `updated_at` timestamp wins
- This is automatic during the pull phase
- Server timestamps are authoritative after sync completes

### Example

```
Local:    Song A - updated_at: 2024-01-15 10:00 (GMT)
Server:   Song A - updated_at: 2024-01-15 10:05 (GMT)
Result:   Server version wins (newer timestamp)
```

## Performance Optimization

The sync system is optimized for performance:

1. **Batch operations**: Updates are batched in transactions
2. **Indexed queries**: Database indexes speed up finding unsynced records
3. **Incremental sync**: Only syncs records modified since last sync
4. **Exponential backoff**: Retries don't hammer the server
5. **Throttled updates**: Sync happens at intervals, not on every change

## Real-Time Subscriptions

Real-time subscriptions listen for changes from other devices/users:

```typescript
import { subscribeToChanges } from '../lib/sync'

// Automatically subscribed via useSyncManager with enableRealtime: true
// or manually:

const unsubscribe = subscribeToChanges(userId, () => {
  console.log('Data changed, pulling updates...')
  // Automatically pulls changes from server
})

// Clean up when done
unsubscribe()
```

## Testing Sync

To test the sync system:

```typescript
import { fullSync, countPendingChanges } from '../lib/sync'

async function testSync() {
  const userId = 'test-user-123'
  
  // Check pending changes
  let pending = await countPendingChanges(userId)
  console.log(`Pending: ${pending}`)
  
  // Run sync
  const success = await fullSync(userId)
  console.log(`Sync successful: ${success}`)
  
  // Check again
  pending = await countPendingChanges(userId)
  console.log(`Pending after sync: ${pending}`)
}
```

## Troubleshooting

### Sync not working
1. Check internet connection
2. Verify Supabase credentials in `lib/supabase.ts`
3. Check console logs for errors
4. Try manual sync: `await fullSync(userId)`

### Changes not appearing in cloud
1. Run `await countPendingChanges(userId)` to check if records are marked for sync
2. Check that `_synced = 0` in your local records
3. Try manual sync: `await fullSync(userId)`
4. Check Supabase dashboard for record presence

### Duplicate or conflicting records
1. This shouldn't happen with last-write-wins strategy
2. If it does, the server timestamp is authoritative
3. Re-sync to get the latest server state

## API Reference

### sync.ts

```typescript
// Status
getSyncStatus(): SyncStatus
onSyncStatusChange(listener: (status: SyncStatus) => void): () => void
clearSyncError(): void

// Sync Operations
fullSync(userId: string, options?: SyncOptions): Promise<boolean>
syncTable(tableName: string, userId: string, options?: SyncOptions): Promise<boolean>
syncPushToSupabase(userId: string, options?: SyncOptions): Promise<void>
syncPullFromSupabase(userId: string, lastSyncTime?: number, options?: SyncOptions): Promise<void>

// Monitoring
countPendingChanges(userId: string): Promise<number>
getUnsyncedRecords(tableName: string, userId: string): Promise<any[]>
markAsUnsynced(tableName: string, recordId: string): Promise<void>

// Advanced
subscribeToChanges(userId: string, onUpdate: () => void): () => void
startPeriodicSync(userId: string, intervalMs?: number): Promise<() => void>
getLastSyncTime(): Promise<number>
setLastSyncTime(time: number): Promise<void>
```

### useSyncManager Hook

```typescript
useSyncManager(options: UseSyncManagerOptions): {
  isSyncing: boolean
  lastSyncTime: number
  syncError: string | null
  pendingChanges: number
  isOnline: boolean
  sync(): Promise<boolean>
  syncTable(tableName: string): Promise<boolean>
  clearError(): void
}

useSyncStatus(tableName: string): {
  isSyncing: boolean
  syncError: string | null
  lastSyncTime: number
}
```

## Summary

The database sync system is now fully implemented and handles:

✅ All entity types (chords, messages, profiles, lineups, etc.)
✅ Bidirectional sync (local ↔ cloud)
✅ Automatic periodic sync every 60 seconds
✅ Real-time subscriptions for instant updates
✅ Conflict resolution with last-write-wins
✅ Automatic retry with exponential backoff
✅ Offline-first design
✅ React hooks for easy integration
✅ Fine-grained sync control

Start using it immediately - sync happens automatically! 🎵
