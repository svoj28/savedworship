# Sync System - Quick Reference

## Automatic Sync (Running by Default)

✅ **Enabled automatically** when user logs in
✅ **Runs every 60 seconds** in the background
✅ **No code needed** - just works!
✅ **Real-time subscriptions** for instant updates from server

## Get Sync Status

```typescript
import { useSyncManager } from '../lib/useSyncManager'

const {
  isSyncing,
  syncError,
  pendingChanges,
  lastSyncTime,
  sync,
  syncTable,
  clearError
} = useSyncManager({ userId })
```

## Manual Sync

```typescript
// Sync everything
await sync()

// Sync specific table
await syncTable('chord_lists')
```

## What Gets Synced Automatically

| Category | Tables |
|----------|--------|
| **Core** | artists, chord_lists, songs |
| **Organization** | lineups, lineup_items, playlists, playlist_items |
| **Communication** | messages, contacts |
| **Sharing** | file_droppers, important_announcements, version_droppers |
| **Profile** | user_profiles |

## Create/Update Records

All database operations automatically mark records for sync:

```typescript
// Create - auto marked for sync
const artist = await createArtist({
  name: 'John Doe',
  userId,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  synced: false
})

// Update - auto marked for sync
await updateArtist(artistId, { name: 'Jane Doe' })

// Same for all entity types:
// createChordList, updateChordList
// createSong, updateSong
// createMessage, editMessage, deleteMessage
// createUserProfile, updateUserProfile
// createLineup, updateLineup
// createPlaylist, updatePlaylist
// addContact, updateContact
// createFileDropper, updateFileDropper
// etc.
```

## Check Pending Changes

```typescript
import { countPendingChanges, getUnsyncedRecords } from '../lib/sync'

// Total pending changes
const pending = await countPendingChanges(userId)

// Specific table
const unsyncedMessages = await getUnsyncedRecords('messages', userId)
```

## Handle Errors

```typescript
const { syncError, clearError, sync } = useSyncManager({ userId })

if (syncError) {
  console.error('Sync failed:', syncError)
  await sync() // Retry
  clearError()
}
```

## Offline Behavior

- Changes are saved locally immediately
- Records marked as unsynced
- Sync resumes automatically when online
- No data loss

## Real-Time Updates

- Subscribe to changes from other devices
- Enabled automatically via `useSyncManager`
- Instant updates when collaborators make changes

## Key Features

✅ Bidirectional sync (local ↔ cloud)
✅ Automatic retry with backoff
✅ Conflict resolution (server wins)
✅ Real-time subscriptions
✅ Offline-first design
✅ Status monitoring
✅ Zero configuration needed

## Files Modified/Created

- `lib/sync.ts` - Core sync engine
- `lib/useSyncManager.ts` - React hook
- `db/queries.ts` - Updated all CRUD to mark synced
- `App.tsx` - Added periodic sync initialization
- `SYNC_SYSTEM_GUIDE.md` - Full documentation

## No Breaking Changes

✅ All existing code continues to work
✅ Database schema unchanged
✅ All queries work as before
✅ Sync is transparent
✅ Backward compatible
