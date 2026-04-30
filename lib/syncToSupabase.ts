import { supabase } from './supabase'
import { Artist, ChordList, Song, Lineup, LineupItem, Message, FileDropper, ImportantAnnouncement, VersionDropper, Contact, UserProfile, Playlist, PlaylistItem } from '../db/models'
import { execute, query } from '../db/index'

type TableName =
  | 'artists'
  | 'chord_lists'
  | 'songs'
  | 'lineups'
  | 'lineup_items'
  | 'messages'
  | 'file_droppers'
  | 'important_announcements'
  | 'version_droppers'
  | 'contacts'
  | 'user_profiles'
  | 'playlists'
  | 'playlist_items'

type TableRow =
  | Artist
  | ChordList
  | Song
  | Lineup
  | LineupItem
  | Message
  | FileDropper
  | ImportantAnnouncement
  | VersionDropper
  | Contact
  | UserProfile
  | Playlist
  | PlaylistItem

// Strip local-only SQLite fields before sending to Supabase
function toSupabaseRow(row: TableRow) {
  const { _synced, ...rest } = row as any
  return rest
}

export async function syncRowToSupabase(table: TableName, row: TableRow) {
  const { error } = await supabase.from(table).upsert(toSupabaseRow(row), { onConflict: 'id' })
  if (error) throw error
  // Mark as synced locally
  await execute(`UPDATE ${table} SET _synced = 1 WHERE id = ?`, [row.id])
}

export async function deleteRowFromSupabase(table: TableName, id: string) {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw error
}

export async function syncAllUnsyncedRows() {
  const tables: TableName[] = [
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
    'playlist_items',
  ]
  for (const table of tables) {
    const unsynced = await query(`SELECT * FROM ${table} WHERE _synced = 0`) as TableRow[]
    for (const row of unsynced) {
      await syncRowToSupabase(table, row)
    }
  }
}