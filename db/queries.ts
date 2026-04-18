// db/queries.ts
/**
 * Database query helpers for easier CRUD operations
 * Provides a familiar interface similar to WatermelonDB
 */

import { getDatabase, execute, query, queryOne, transaction } from './index'
import { Artist, ChordList, Song, Lineup, LineupItem, Message } from './models'
import uuid from 'react-native-uuid'

// Artist queries
export async function createArtist(data: Omit<Artist, 'id'>): Promise<Artist> {
  const id = uuid.v4()
  const artist = { id, ...data }
  await execute(
    'INSERT INTO artists (id, name, user_id, created_at, updated_at, _synced) VALUES (?, ?, ?, ?, ?, ?)',
    [artist.id, artist.name, artist.userId, artist.createdAt, artist.updatedAt, artist.synced ? 1 : 0]
  )
  return artist
}

export async function getArtistById(id: string): Promise<Artist | null> {
  const result = await queryOne('SELECT * FROM artists WHERE id = ?', [id])
  return result ? mapArtist(result) : null
}

export async function getArtistsByUserId(userId: string): Promise<Artist[]> {
  const results = await query('SELECT * FROM artists WHERE user_id = ? ORDER BY name', [userId])
  return results.map(mapArtist)
}

// Chord List queries
export async function createChordList(data: Omit<ChordList, 'id'>): Promise<ChordList> {
  const id = uuid.v4()
  const list = { id, ...data }
  await execute(
    'INSERT INTO chord_lists (id, title, artist_id, user_id, is_private, created_at, updated_at, _synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [list.id, list.title, list.artistId, list.userId, list.isPrivate ? 1 : 0, list.createdAt, list.updatedAt, list.synced ? 1 : 0]
  )
  return list
}

export async function getChordListById(id: string): Promise<ChordList | null> {
  const result = await queryOne('SELECT * FROM chord_lists WHERE id = ?', [id])
  return result ? mapChordList(result) : null
}

export async function getChordListsByUserId(userId: string): Promise<ChordList[]> {
  const results = await query('SELECT * FROM chord_lists WHERE user_id = ? ORDER BY title', [userId])
  return results.map(mapChordList)
}

export async function getPrivateChordLists(userId: string): Promise<ChordList[]> {
  const results = await query(
    'SELECT * FROM chord_lists WHERE user_id = ? AND is_private = 1 ORDER BY title',
    [userId]
  )
  return results.map(mapChordList)
}

export async function updateChordList(id: string, data: Partial<ChordList>): Promise<void> {
  const updates = Object.entries(data)
    .map(([key]) => `${camelToSnake(key)} = ?`)
    .join(', ')
  const values = Object.values(data)
  
  await execute(
    `UPDATE chord_lists SET ${updates}, updated_at = ? WHERE id = ?`,
    [...values, Date.now(), id]
  )
}

export async function deleteChordList(id: string): Promise<void> {
  await transaction(async () => {
    // Delete associated songs
    await execute('DELETE FROM songs WHERE chord_list_id = ?', [id])
    // Delete chord list
    await execute('DELETE FROM chord_lists WHERE id = ?', [id])
  })
}

// Song queries
export async function createSong(data: Omit<Song, 'id'>): Promise<Song> {
  const id = uuid.v4()
  const song = { id, ...data }
  await execute(
    'INSERT INTO songs (id, chord_list_id, title, content, key, created_at, updated_at, _synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [song.id, song.chordListId, song.title, song.content, song.key, song.createdAt, song.updatedAt, song.synced ? 1 : 0]
  )
  return song
}

export async function getSongById(id: string): Promise<Song | null> {
  const result = await queryOne('SELECT * FROM songs WHERE id = ?', [id])
  return result ? mapSong(result) : null
}

export async function getSongsByChordListId(chordListId: string): Promise<Song[]> {
  const results = await query('SELECT * FROM songs WHERE chord_list_id = ? ORDER BY title', [chordListId])
  return results.map(mapSong)
}

export async function updateSong(id: string, data: Partial<Song>): Promise<void> {
  const updates = Object.entries(data)
    .map(([key]) => `${camelToSnake(key)} = ?`)
    .join(', ')
  const values = Object.values(data)
  
  await execute(
    `UPDATE songs SET ${updates}, updated_at = ? WHERE id = ?`,
    [...values, Date.now(), id]
  )
}

export async function deleteSong(id: string): Promise<void> {
  await execute('DELETE FROM songs WHERE id = ?', [id])
}

// Lineup queries
export async function createLineup(data: Omit<Lineup, 'id'>): Promise<Lineup> {
  const id = uuid.v4()
  const lineup = { id, ...data }
  await execute(
    'INSERT INTO lineups (id, title, user_id, description, created_at, updated_at, _synced) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [lineup.id, lineup.title, lineup.userId, lineup.description || '', lineup.createdAt, lineup.updatedAt, lineup.synced ? 1 : 0]
  )
  return lineup
}

export async function getLineupById(id: string): Promise<Lineup | null> {
  const result = await queryOne('SELECT * FROM lineups WHERE id = ?', [id])
  return result ? mapLineup(result) : null
}

export async function getLineupsByUserId(userId: string): Promise<Lineup[]> {
  const results = await query('SELECT * FROM lineups WHERE user_id = ? ORDER BY created_at DESC', [userId])
  return results.map(mapLineup)
}

export async function deleteLineup(id: string): Promise<void> {
  await transaction(async () => {
    await execute('DELETE FROM lineup_items WHERE lineup_id = ?', [id])
    await execute('DELETE FROM lineups WHERE id = ?', [id])
  })
}

// Message queries
export async function createMessage(data: Omit<Message, 'id'>): Promise<Message> {
  const id = uuid.v4()
  const message = { id, ...data }
  await execute(
    'INSERT INTO messages (id, sender_id, receiver_id, text, created_at, _synced) VALUES (?, ?, ?, ?, ?, ?)',
    [message.id, message.senderId, message.receiverId, message.text, message.createdAt, message.synced ? 1 : 0]
  )
  return message
}

export async function getUnsyncedRecords(table: string): Promise<any[]> {
  const results = await query(`SELECT * FROM ${table} WHERE _synced = 0`)
  return results
}

// Helper functions
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function mapArtist(row: any): Artist {
  return {
    id: row.id,
    name: row.name,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    synced: Boolean(row._synced),
  }
}

function mapChordList(row: any): ChordList {
  return {
    id: row.id,
    title: row.title,
    artistId: row.artist_id,
    userId: row.user_id,
    isPrivate: Boolean(row.is_private),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    synced: Boolean(row._synced),
  }
}

function mapSong(row: any): Song {
  return {
    id: row.id,
    chordListId: row.chord_list_id,
    title: row.title,
    content: row.content,
    key: row.key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    synced: Boolean(row._synced),
  }
}

function mapLineup(row: any): Lineup {
  return {
    id: row.id,
    title: row.title,
    userId: row.user_id,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    synced: Boolean(row._synced),
  }
}

function mapLineupItem(row: any): LineupItem {
  return {
    id: row.id,
    lineupId: row.lineup_id,
    songId: row.song_id,
    position: row.position,
    createdAt: row.created_at,
    synced: Boolean(row._synced),
  }
}

function mapMessage(row: any): Message {
  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    text: row.text,
    createdAt: row.created_at,
    synced: Boolean(row._synced),
  }
}
