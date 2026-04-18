// db/models.ts
/**
 * TypeScript types for database models
 * Simple interface-based models for expo-sqlite compatibility
 */

export interface Artist {
  id: string
  name: string
  userId: string
  createdAt: number
  updatedAt: number
  synced: boolean
}

export interface ChordList {
  id: string
  title: string
  artistId: string
  userId: string
  isPrivate: boolean
  createdAt: number
  updatedAt: number
  synced: boolean
}

export interface Song {
  id: string
  chordListId: string
  title: string
  content: string
  key: string
  createdAt: number
  updatedAt: number
  synced: boolean
}

export interface Lineup {
  id: string
  title: string
  userId: string
  description?: string
  createdAt: number
  updatedAt: number
  synced: boolean
}

export interface LineupItem {
  id: string
  lineupId: string
  songId: string
  position: number
  createdAt: number
  synced: boolean
}

export interface Message {
  id: string
  senderId: string
  receiverId: string
  text: string
  createdAt: number
  synced: boolean
}
