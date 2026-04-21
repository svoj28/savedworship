// db/index.ts
/**
 * Database initialization using expo-sqlite instead of WatermelonDB native modules
 * WatermelonDB requires native module linking which doesn't work in Expo managed workflow
 * This simplified approach provides SQLite persistence compatible with Expo
 */

import * as SQLite from 'expo-sqlite'
import { Artist, ChordList, Song, Lineup, LineupItem, Message, FileDropper, ImportantAnnouncement, VersionDropper } from './models'

let dbInstance: SQLite.SQLiteDatabase | null = null

export async function initializeDatabase() {
  try {
    // Open database (creates if doesn't exist)
    dbInstance = await SQLite.openDatabaseAsync('savedworshipmusictool.db')
    
    // Create tables
    await dbInstance.execAsync(`
      PRAGMA journal_mode = WAL;
      
      CREATE TABLE IF NOT EXISTS artists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at INTEGER,
        updated_at INTEGER,
        _synced INTEGER DEFAULT 0
      );
      
      CREATE TABLE IF NOT EXISTS chord_lists (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        artist_id TEXT,
        user_id TEXT NOT NULL,
        is_private INTEGER DEFAULT 0,
        created_at INTEGER,
        updated_at INTEGER,
        _synced INTEGER DEFAULT 0
      );
      
      CREATE TABLE IF NOT EXISTS songs (
        id TEXT PRIMARY KEY,
        chord_list_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        key TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        _synced INTEGER DEFAULT 0
      );
      
      CREATE TABLE IF NOT EXISTS lineups (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        user_id TEXT NOT NULL,
        description TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        _synced INTEGER DEFAULT 0
      );
      
      CREATE TABLE IF NOT EXISTS lineup_items (
        id TEXT PRIMARY KEY,
        lineup_id TEXT NOT NULL,
        song_id TEXT NOT NULL,
        position INTEGER,
        created_at INTEGER,
        _synced INTEGER DEFAULT 0
      );
      
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        receiver_id TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at INTEGER,
        updated_at INTEGER,
        is_deleted INTEGER DEFAULT 0,
        edited_at INTEGER,
        _synced INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS file_droppers (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        user_id TEXT NOT NULL,
        file_url TEXT NOT NULL,
        description TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        _synced INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS important_announcements (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER,
        updated_at INTEGER,
        _synced INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS version_droppers (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        user_id TEXT NOT NULL,
        youtube_url TEXT NOT NULL,
        description TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        _synced INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        contact_user_id TEXT NOT NULL,
        contact_email TEXT,
        contact_name TEXT,
        status TEXT DEFAULT 'pending',
        created_at INTEGER,
        updated_at INTEGER,
        _synced INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS user_profiles (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        nickname TEXT,
        bio TEXT,
        avatar_url TEXT,
        instruments TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        _synced INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS playlists (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        _synced INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS playlist_items (
        id TEXT PRIMARY KEY,
        playlist_id TEXT NOT NULL,
        chord_list_id TEXT,
        song_id TEXT,
        position INTEGER,
        created_at INTEGER,
        _synced INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_artists_user_id ON artists(user_id);
      CREATE INDEX IF NOT EXISTS idx_chord_lists_user_id ON chord_lists(user_id);
      CREATE INDEX IF NOT EXISTS idx_chord_lists_artist_id ON chord_lists(artist_id);
      CREATE INDEX IF NOT EXISTS idx_songs_chord_list_id ON songs(chord_list_id);
      CREATE INDEX IF NOT EXISTS idx_lineups_user_id ON lineups(user_id);
      CREATE INDEX IF NOT EXISTS idx_lineup_items_lineup_id ON lineup_items(lineup_id);
      CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
      CREATE INDEX IF NOT EXISTS idx_file_droppers_user_id ON file_droppers(user_id);
      CREATE INDEX IF NOT EXISTS idx_announcements_user_id ON important_announcements(user_id);
      CREATE INDEX IF NOT EXISTS idx_version_droppers_user_id ON version_droppers(user_id);
      CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
      CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON playlists(user_id);
      CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist_id ON playlist_items(playlist_id);
      CREATE INDEX IF NOT EXISTS idx_contacts_contact_user_id ON contacts(contact_user_id);
      CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
    `)

    // Add content column to chord_lists if it doesn't exist (for personal notes)
    try {
      await dbInstance.execAsync(`
        ALTER TABLE chord_lists ADD COLUMN content TEXT;
      `)
    } catch (e) {
      // Column already exists, ignore error
    }

    // Add missing columns to messages table for edit/delete functionality
    try {
      await dbInstance.execAsync(`
        ALTER TABLE messages ADD COLUMN updated_at INTEGER;
      `)
    } catch (e) {
      // Column already exists, ignore error
    }

    try {
      await dbInstance.execAsync(`
        ALTER TABLE messages ADD COLUMN is_deleted INTEGER DEFAULT 0;
      `)
    } catch (e) {
      // Column already exists, ignore error
    }

    try {
      await dbInstance.execAsync(`
        ALTER TABLE messages ADD COLUMN edited_at INTEGER;
      `)
    } catch (e) {
      // Column already exists, ignore error
    }

    // Add user_id columns for sync support
    try {
      await dbInstance.execAsync(`
        ALTER TABLE songs ADD COLUMN user_id TEXT DEFAULT '';
      `)
    } catch (e) {
      // Column already exists, ignore error
    }

    try {
      await dbInstance.execAsync(`
        ALTER TABLE lineup_items ADD COLUMN user_id TEXT DEFAULT '';
      `)
    } catch (e) {
      // Column already exists, ignore error
    }

    try {
      await dbInstance.execAsync(`
        ALTER TABLE messages ADD COLUMN user_id TEXT DEFAULT '';
      `)
    } catch (e) {
      // Column already exists, ignore error
    }

    try {
      await dbInstance.execAsync(`
        ALTER TABLE playlist_items ADD COLUMN user_id TEXT DEFAULT '';
      `)
    } catch (e) {
      // Column already exists, ignore error
    }

    // Add updated_at columns for proper sync
    try {
      await dbInstance.execAsync(`
        ALTER TABLE lineup_items ADD COLUMN updated_at INTEGER;
      `)
    } catch (e) {
      // Column already exists, ignore error
    }

    try {
      await dbInstance.execAsync(`
        ALTER TABLE playlist_items ADD COLUMN updated_at INTEGER;
      `)
    } catch (e) {
      // Column already exists, ignore error
    }

    console.log('Database initialized successfully')
    return dbInstance
  } catch (err) {
    console.error('Error initializing database:', err)
    throw err
  }
}

export function getDatabase() {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initializeDatabase() first.')
  }
  return dbInstance
}

// Simple query helpers
export async function query(sql: string, params: any[] = []) {
  try {
    const db = getDatabase()
    if (!db) {
      throw new Error('Database is not initialized')
    }
    const result = await db.getAllAsync(sql, params)
    return result || []
  } catch (err) {
    console.error('Query error:', sql, params, err)
    throw err
  }
}

export async function queryOne(sql: string, params: any[] = []) {
  try {
    const db = getDatabase()
    if (!db) {
      throw new Error('Database is not initialized')
    }
    const result = await db.getFirstAsync(sql, params)
    return result || null
  } catch (err) {
    console.error('QueryOne error:', sql, params, err)
    throw err
  }
}

export async function execute(sql: string, params: any[] = []) {
  try {
    const db = getDatabase()
    if (!db) {
      throw new Error('Database is not initialized')
    }
    return await db.runAsync(sql, params)
  } catch (err) {
    console.error('Execute error:', sql, params, err)
    throw err
  }
}

export async function transaction(callback: (tx: SQLite.SQLiteDatabase) => Promise<void>) {
  try {
    const db = getDatabase()
    if (!db) {
      throw new Error('Database is not initialized')
    }
    await db.execAsync('BEGIN TRANSACTION')
    await callback(db)
    await db.execAsync('COMMIT')
  } catch (err) {
    try {
      const db = getDatabase()
      if (db) {
        await db.execAsync('ROLLBACK')
      }
    } catch (rollbackErr) {
      console.error('Rollback error:', rollbackErr)
    }
    throw err
  }
}

// Export model types for TypeScript
export type { Artist, ChordList, Song, Lineup, LineupItem, Message }
