// screens/ChordListsHomeScreen.tsx
import React, { useState, useEffect } from 'react'
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  FlatList,
  StatusBar,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { getCurrentUser } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { query, execute } from '../db/index'
import {
  getPlaylistsByUserId,
  createPlaylist,
  deletePlaylist,
  getPlaylistItems,
  addToPlaylist,
  removeFromPlaylist,
  updatePlaylistItemPosition,
} from '../db/queries'
import { PlaylistSongViewerModal } from '../components/PlaylistSongViewerModal'
import { useRole } from '../lib/useRole'
import { onTableChange } from '../lib/sync'

interface Props {
  navigation: any
}

interface Playlist {
  id: string
  userId: string
  title: string
  description?: string
  createdAt: number
  updatedAt: number
  synced: boolean
}

interface PlaylistItem {
  id: string
  playlistId: string
  chordListId?: string
  songId?: string
  position: number
  createdAt: number
  synced: boolean
}

interface ArtistBrowseItem {
  id: string
  title: string
  kind: 'song' | 'chord_list'
  chordListId: string
  songId?: string
}

export default function ChordListsHomeScreen({ navigation }: Props) {
  const [activeTab, setActiveTab] = useState<'artists' | 'playlists'>('artists')
  const [artists, setArtists] = useState<any[]>([])
  const [expandedArtists, setExpandedArtists] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null)
  const [playlistItems, setPlaylistItems] = useState<PlaylistItem[]>([])
  // Map of songId/chordListId -> resolved title for playlist display
  const [playlistItemTitles, setPlaylistItemTitles] = useState<Record<string, string>>({})
  const [showCreatePlaylistModal, setShowCreatePlaylistModal] = useState(false)
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('')
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('')
  const [showAddSongModal, setShowAddSongModal] = useState(false)
  const [userId, setUserId] = useState<string>('')
  const [addSongExpandedArtists, setAddSongExpandedArtists] = useState<Set<string>>(new Set())
  const [showSongViewer, setShowSongViewer] = useState(false)
  const [viewerStartIndex, setViewerStartIndex] = useState(0)
  const [viewerSongs, setViewerSongs] = useState<any[]>([])
  // artistItems holds songs (or chord lists) per artist, used for both browsing and Add Song modal
  const [artistItems, setArtistItems] = useState<{ [key: string]: ArtistBrowseItem[] }>({})
  const { canManageChords } = useRole()

  useFocusEffect(
    React.useCallback(() => {
      loadData()
    }, [])
  )

  useEffect(() => {
    const u1 = onTableChange('artists', () => loadData())
    const u2 = onTableChange('chord_lists', () => loadData())
    const u3 = onTableChange('songs', () => loadData())
    const u4 = onTableChange('playlists', () => loadData())
    const u5 = onTableChange('playlist_items', () => loadData())
    return () => { u1(); u2(); u3(); u4(); u5() }
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const user = await getCurrentUser()
      if (user) {
        setUserId(user.id)
        await Promise.all([loadArtists(), loadPlaylists(user.id)])
      }
    } catch (err) {
      console.error('Error loading data:', err)
      Alert.alert('Error', 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const loadArtists = async () => {
    try {
      const [{ data: artistRows, error: artistError }, { data: chordListRows, error: clError }] =
        await Promise.all([
          supabase.from('artists').select('id, name').order('name'),
          supabase
            .from('chord_lists')
            .select('id, title, artist_id')
            .or('is_private.eq.0,is_private.is.null')
            .order('title'),
        ])

      if (artistError || clError) throw artistError || clError

      const normalizedArtists = artistRows || []
      const publicChordLists = chordListRows || []
      const itemMap: { [key: string]: ArtistBrowseItem[] } = {}

      for (const artist of normalizedArtists) {
        const artistChordLists = publicChordLists.filter(r => r.artist_id === artist.id)
        const chordListIds = artistChordLists.map(r => r.id)

        let songRows: any[] = []
        if (chordListIds.length > 0) {
          const { data } = await supabase
            .from('songs')
            .select('id, title, chord_list_id')
            .in('chord_list_id', chordListIds)
            .order('title')
          songRows = data || []
        }

        if (songRows.length > 0) {
          itemMap[artist.id] = songRows.map(row => ({
            id: row.id,
            title: row.title,
            kind: 'song',
            chordListId: row.chord_list_id,
            songId: row.id,
          }))
        } else {
          itemMap[artist.id] = artistChordLists.map(row => ({
            id: row.id,
            title: row.title,
            kind: 'chord_list',
            chordListId: row.id,
          }))
        }
      }

      setArtists(normalizedArtists)
      setArtistItems(itemMap)
    } catch (err) {
      console.error('Error loading artists from Supabase:', err)
      // Local fallback
      const rows: any[] = await query('SELECT DISTINCT id, name FROM artists ORDER BY name')
      setArtists(rows || [])
      const itemMap: { [key: string]: ArtistBrowseItem[] } = {}
      for (const artist of rows || []) {
        const songRows: any[] = await query(
          `SELECT s.id, s.title, s.chord_list_id FROM songs s
           JOIN chord_lists cl ON s.chord_list_id = cl.id
           WHERE cl.artist_id = ? AND cl.is_private = 0
           ORDER BY s.title`,
          [artist.id]
        )
        if (songRows && songRows.length > 0) {
          itemMap[artist.id] = songRows.map(row => ({
            id: row.id,
            title: row.title,
            kind: 'song',
            chordListId: row.chord_list_id,
            songId: row.id,
          }))
        } else {
          const clRows: any[] = await query(
            `SELECT * FROM chord_lists WHERE artist_id = ? AND is_private = 0 ORDER BY title`,
            [artist.id]
          )
          itemMap[artist.id] = clRows.map(row => ({
            id: row.id,
            title: row.title,
            kind: 'chord_list',
            chordListId: row.id,
          }))
        }
      }
      setArtistItems(itemMap)
    }
  }

  const loadPlaylists = async (uid: string) => {
    try {
      const userPlaylists = await getPlaylistsByUserId(uid)
      setPlaylists(userPlaylists)
    } catch (err) {
      console.error('Error loading playlists:', err)
    }
  }

  /**
   * Resolve a song title: try local SQLite first, fall back to Supabase.
   */
  const resolveSongTitle = async (songId: string): Promise<string> => {
    try {
      const rows: any[] = await query('SELECT title FROM songs WHERE id = ?', [songId])
      if (rows[0]?.title) return rows[0].title
    } catch {}
    // Supabase fallback — catches songs not yet synced locally
    try {
      const { data } = await supabase.from('songs').select('title').eq('id', songId).single()
      if (data?.title) return data.title
    } catch {}
    return `Song ${songId.substring(0, 8)}`
  }

  /**
   * Resolve a chord list title: try local SQLite first, fall back to Supabase.
   */
  const resolveChordListTitle = async (chordListId: string): Promise<string> => {
    try {
      const rows: any[] = await query('SELECT title FROM chord_lists WHERE id = ?', [chordListId])
      if (rows[0]?.title) return rows[0].title
    } catch {}
    try {
      const { data } = await supabase.from('chord_lists').select('title').eq('id', chordListId).single()
      if (data?.title) return data.title
    } catch {}
    return `Chord List ${chordListId.substring(0, 8)}`
  }

  /**
   * Fetch full song row: try local SQLite first, fall back to Supabase.
   */
  const fetchSongRow = async (songId: string): Promise<any | null> => {
    try {
      const rows: any[] = await query('SELECT * FROM songs WHERE id = ?', [songId])
      if (rows[0]) return rows[0]
    } catch {}
    try {
      const { data } = await supabase.from('songs').select('*').eq('id', songId).single()
      if (data) {
        // Normalize snake_case columns to camelCase so the viewer works
        return {
          id: data.id,
          chordListId: data.chord_list_id,
          title: data.title,
          content: data.content,
          key: data.key,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          synced: Boolean(data._synced),
          userId: data.user_id ?? '',
          youtubeUrl: data.youtube_url,
        }
      }
    } catch {}
    return null
  }

  /**
   * Load playlist items and resolve each item's display title.
   * Uses SQLite first, Supabase as fallback — so newly added songs always resolve.
   */
  const loadPlaylistItems = async (playlistId: string) => {
    try {
      const items = await getPlaylistItems(playlistId)
      setPlaylistItems(items)

      const titleMap: Record<string, string> = {}
      await Promise.all(
        items.map(async item => {
          if (item.songId) {
            titleMap[item.id] = await resolveSongTitle(item.songId)
          } else if (item.chordListId) {
            titleMap[item.id] = await resolveChordListTitle(item.chordListId)
          }
        })
      )
      setPlaylistItemTitles(titleMap)
    } catch (err) {
      console.error('Error loading playlist items:', err)
    }
  }

  const handleOpenSongViewer = async (startIndex: number) => {
    try {
      const songs = await Promise.all(
        playlistItems.map(async item => {
          if (!item.songId) return null
          return fetchSongRow(item.songId)
        })
      )
      setViewerSongs(songs.filter(Boolean))
      setViewerStartIndex(startIndex)
      setShowSongViewer(true)
    } catch (err) {
      Alert.alert('Error', 'Failed to load songs')
    }
  }

  const toggleArtistExpand = (artistId: string) => {
    setExpandedArtists(prev => {
      const next = new Set(prev)
      next.has(artistId) ? next.delete(artistId) : next.add(artistId)
      return next
    })
  }

  const handleSelectSong = (song: ArtistBrowseItem) => {
    navigation.navigate('ChordList', { chordListId: song.chordListId })
  }

  const handleSelectChordList = (chordListId: string) => {
    navigation.navigate('ChordList', { chordListId })
  }

  const handleCreatePlaylist = async () => {
    if (!newPlaylistTitle.trim()) {
      Alert.alert('Error', 'Please enter a playlist name')
      return
    }
    try {
      await createPlaylist({
        userId,
        title: newPlaylistTitle.trim(),
        description: newPlaylistDesc.trim(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        synced: false,
      })
      setNewPlaylistTitle('')
      setNewPlaylistDesc('')
      setShowCreatePlaylistModal(false)
      await loadPlaylists(userId)
    } catch {
      Alert.alert('Error', 'Failed to create playlist')
    }
  }

  const handleDeletePlaylist = (playlistId: string) => {
    Alert.alert('Delete Playlist', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePlaylist(playlistId)
            await loadPlaylists(userId)
            if (selectedPlaylist?.id === playlistId) setSelectedPlaylist(null)
          } catch {
            Alert.alert('Error', 'Failed to delete playlist')
          }
        },
      },
    ])
  }

  const handleSelectPlaylist = async (playlist: Playlist) => {
    setSelectedPlaylist(playlist)
    await loadPlaylistItems(playlist.id)
  }

  const handleMoveItemUp = async (index: number) => {
    if (index === 0 || !selectedPlaylist) return
    try {
      const cur = playlistItems[index]
      const prev = playlistItems[index - 1]
      await updatePlaylistItemPosition(cur.id, prev.position)
      await updatePlaylistItemPosition(prev.id, cur.position)
      await loadPlaylistItems(selectedPlaylist.id)
    } catch {
      Alert.alert('Error', 'Failed to reorder')
    }
  }

  const handleMoveItemDown = async (index: number) => {
    if (index >= playlistItems.length - 1 || !selectedPlaylist) return
    try {
      const cur = playlistItems[index]
      const next = playlistItems[index + 1]
      await updatePlaylistItemPosition(cur.id, next.position)
      await updatePlaylistItemPosition(next.id, cur.position)
      await loadPlaylistItems(selectedPlaylist.id)
    } catch {
      Alert.alert('Error', 'Failed to reorder')
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0A0A0A" />
        <Text style={styles.loadingText}>Loading library…</Text>
      </View>
    )
  }

  const visibleArtists = artists.filter(a => (artistItems[a.id] || []).length > 0)

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />

      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.headerLogo}>♩</Text>
        <Text style={styles.headerTitle}>Chord Library</Text>
      </View>

      {/* TAB BAR */}
      <View style={styles.tabBar}>
        {(['artists', 'playlists'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
              {tab === 'artists' ? 'Artists' : 'Playlists'}
            </Text>
            {activeTab === tab && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* ─── ARTISTS TAB ─── */}
      {activeTab === 'artists' && (
        <>
          {visibleArtists.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="No artists yet"
              subtitle="Create a public chord list to get started"
            />
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.sectionLabel}>{visibleArtists.length} ARTISTS</Text>
              {visibleArtists.map((artist, artistIdx) => {
                const isExpanded = expandedArtists.has(artist.id)
                const items = artistItems[artist.id] || []
                return (
                  <View key={artist.id} style={[styles.artistBlock, artistIdx === 0 && { marginTop: 0 }]}>
                    <TouchableOpacity
                      style={styles.artistRow}
                      onPress={() => toggleArtistExpand(artist.id)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.artistMonogram, isExpanded && styles.artistMonogramActive]}>
                        <Text style={[styles.artistMonogramText, isExpanded && styles.artistMonogramTextActive]}>
                          {artist.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.artistMeta}>
                        <Text style={styles.artistName}>{artist.name}</Text>
                        <Text style={styles.artistSongCount}>
                          {items.length} {items.length === 1 ? 'item' : 'items'}
                        </Text>
                      </View>
                      <View style={styles.chevronWrap}>
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={15}
                          color={isExpanded ? '#0A0A0A' : '#C4C4C4'}
                        />
                      </View>
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.songList}>
                        {items.map((item, idx) => (
                          <View
                            key={item.id}
                            style={[styles.songRow, idx < items.length - 1 && styles.songRowBorder]}
                          >
                            <TouchableOpacity
                              style={styles.songRowInner}
                              onPress={() =>
                                item.kind === 'song'
                                  ? handleSelectSong(item)
                                  : handleSelectChordList(item.chordListId)
                              }
                              activeOpacity={0.6}
                            >
                              <Text style={styles.songIndex}>{idx + 1}</Text>
                              <Text style={styles.songTitle}>{item.title}</Text>
                              <Ionicons name="chevron-forward" size={13} color="#D0D0D0" />
                            </TouchableOpacity>

                            {selectedPlaylist && (
                              <TouchableOpacity
                                style={styles.addBtn}
                                onPress={async () => {
                                  try {
                                    const maxPos =
                                      playlistItems.length > 0
                                        ? Math.max(...playlistItems.map(i => i.position)) + 1
                                        : 0
                                    await addToPlaylist({
                                      playlistId: selectedPlaylist.id,
                                      songId: item.kind === 'song' ? item.songId : undefined,
                                      chordListId: item.chordListId,
                                      position: maxPos,
                                      createdAt: Date.now(),
                                      synced: false,
                                      userId,
                                    })
                                    await loadPlaylistItems(selectedPlaylist.id)
                                    Alert.alert('Added', `"${item.title}" added to playlist`)
                                  } catch {
                                    Alert.alert('Error', 'Failed to add song')
                                  }
                                }}
                              >
                                <Ionicons name="add" size={18} color="#0A0A0A" />
                              </TouchableOpacity>
                            )}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )
              })}
            </ScrollView>
          )}
          {canManageChords && <FAB onPress={() => navigation.navigate('AddSong', {})} icon="add" />}
        </>
      )}

      {/* ─── PLAYLISTS TAB ─── */}
      {activeTab === 'playlists' && (
        <>
          {!selectedPlaylist ? (
            <>
              {playlists.length === 0 ? (
                <EmptyState
                  icon="musical-note-outline"
                  title="No playlists yet"
                  subtitle="Tap + to create your first playlist"
                />
              ) : (
                <ScrollView
                  style={styles.list}
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.sectionLabel}>{playlists.length} PLAYLISTS</Text>
                  {playlists.map((playlist, idx) => (
                    <TouchableOpacity
                      key={playlist.id}
                      style={styles.playlistCard}
                      onPress={() => handleSelectPlaylist(playlist)}
                      activeOpacity={0.72}
                    >
                      <View style={styles.playlistNumberBox}>
                        <Text style={styles.playlistNumber}>{idx + 1}</Text>
                      </View>
                      <View style={styles.playlistCardContent}>
                        <Text style={styles.playlistTitle}>{playlist.title}</Text>
                        {playlist.description ? (
                          <Text style={styles.playlistDesc} numberOfLines={1}>
                            {playlist.description}
                          </Text>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        onPress={() => handleDeletePlaylist(playlist.id)}
                        style={styles.deleteBtn}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="trash-outline" size={16} color="#C4C4C4" />
                      </TouchableOpacity>
                      <Ionicons name="chevron-forward" size={15} color="#D4D4D4" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <FAB onPress={() => setShowCreatePlaylistModal(true)} icon="add" />
            </>
          ) : (
            /* ─── PLAYLIST DETAIL ─── */
            <View style={styles.flex1}>
              <TouchableOpacity
                style={styles.detailHeader}
                onPress={() => setSelectedPlaylist(null)}
                activeOpacity={0.7}
              >
                <View style={styles.detailBackBtn}>
                  <Ionicons name="arrow-back" size={16} color="#0A0A0A" />
                </View>
                <View style={styles.detailHeaderMeta}>
                  <Text style={styles.detailHeaderLabel}>PLAYLIST</Text>
                  <Text style={styles.detailHeaderTitle}>{selectedPlaylist.title}</Text>
                </View>
                <View style={styles.detailBadge}>
                  <Text style={styles.detailBadgeText}>{playlistItems.length}</Text>
                </View>
              </TouchableOpacity>

              {playlistItems.length === 0 ? (
                <EmptyState
                  icon="musical-notes-outline"
                  title="No songs yet"
                  subtitle="Tap + to add songs to this playlist"
                />
              ) : (
                <FlatList
                  data={playlistItems}
                  keyExtractor={item => item.id}
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item, index }) => {
                    const title = playlistItemTitles[item.id] ?? '…'
                    const isFirst = index === 0
                    const isLast = index === playlistItems.length - 1
                    return (
                      <TouchableOpacity
                        style={styles.playlistItemRow}
                        onPress={() => handleOpenSongViewer(index)}
                        activeOpacity={0.65}
                      >
                        <Text style={styles.itemIndex}>{index + 1}</Text>
                        <Text style={styles.itemTitle}>{title}</Text>

                        {/* Reorder buttons */}
                        <View style={styles.reorderBtns}>
                          <TouchableOpacity
                            style={[styles.reorderBtn, isFirst && styles.reorderBtnDisabled]}
                            onPress={() => handleMoveItemUp(index)}
                            disabled={isFirst}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Ionicons name="chevron-up" size={14} color={isFirst ? '#D4D4D4' : '#555'} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.reorderBtn, isLast && styles.reorderBtnDisabled]}
                            onPress={() => handleMoveItemDown(index)}
                            disabled={isLast}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Ionicons name="chevron-down" size={14} color={isLast ? '#D4D4D4' : '#555'} />
                          </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                          onPress={async e => {
                            try {
                              await removeFromPlaylist(item.id)
                              await loadPlaylistItems(selectedPlaylist.id)
                            } catch {
                              Alert.alert('Error', 'Failed to remove item')
                            }
                          }}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          style={styles.removeBtn}
                        >
                          <Ionicons name="close" size={16} color="#B0B0B0" />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    )
                  }}
                />
              )}

              <FAB onPress={() => setShowAddSongModal(true)} icon="add" />
            </View>
          )}
        </>
      )}

      {/* ─── CREATE PLAYLIST MODAL ─── */}
      <Modal visible={showCreatePlaylistModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHead}>
              <TouchableOpacity onPress={() => setShowCreatePlaylistModal(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>New Playlist</Text>
              <TouchableOpacity onPress={handleCreatePlaylist} style={styles.modalActionBtn}>
                <Text style={styles.modalAction}>Create</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.fieldLabel}>NAME</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Untitled playlist"
                placeholderTextColor="#C4C4C4"
                value={newPlaylistTitle}
                onChangeText={setNewPlaylistTitle}
                autoFocus
              />
              <Text style={[styles.fieldLabel, { marginTop: 22 }]}>DESCRIPTION</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Optional note or description"
                placeholderTextColor="#C4C4C4"
                value={newPlaylistDesc}
                onChangeText={setNewPlaylistDesc}
                multiline
                numberOfLines={3}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── ADD SONG MODAL ─── */}
      {/* Uses artistItems (already loaded) — sorted by artist, then song title */}
      <Modal visible={showAddSongModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: '82%' }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHead}>
              <TouchableOpacity onPress={() => setShowAddSongModal(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Add Song</Text>
              <View style={{ width: 54 }} />
            </View>

            <ScrollView style={styles.modalScrollBody} showsVerticalScrollIndicator={false}>
              {artists
                .filter(a => (artistItems[a.id] || []).length > 0)
                .map(artist => (
                  <View key={artist.id}>
                    <TouchableOpacity
                      style={styles.modalArtistRow}
                      onPress={() => {
                        setAddSongExpandedArtists(prev => {
                          const next = new Set(prev)
                          next.has(artist.id) ? next.delete(artist.id) : next.add(artist.id)
                          return next
                        })
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.modalArtistMonogram}>
                        <Text style={styles.modalArtistMonogramText}>
                          {artist.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.modalArtistName}>{artist.name}</Text>
                      <Ionicons
                        name={addSongExpandedArtists.has(artist.id) ? 'chevron-up' : 'chevron-down'}
                        size={15}
                        color="#C4C4C4"
                      />
                    </TouchableOpacity>

                    {addSongExpandedArtists.has(artist.id) && (
                      <View style={styles.modalSongGroup}>
                        {(artistItems[artist.id] || []).map((item, idx) => (
                          <TouchableOpacity
                            key={item.id}
                            style={[
                              styles.modalSongRow,
                              idx < (artistItems[artist.id] || []).length - 1 &&
                                styles.modalSongRowBorder,
                            ]}
                            onPress={async () => {
                              if (!selectedPlaylist) return
                              try {
                                const maxPos =
                                  playlistItems.length > 0
                                    ? Math.max(...playlistItems.map(i => i.position)) + 1
                                    : 0
                                await addToPlaylist({
                                  playlistId: selectedPlaylist.id,
                                  songId: item.kind === 'song' ? item.songId : undefined,
                                  chordListId: item.chordListId,
                                  position: maxPos,
                                  createdAt: Date.now(),
                                  synced: false,
                                  userId,
                                })
                                await loadPlaylistItems(selectedPlaylist.id)
                                setShowAddSongModal(false)
                                Alert.alert('Added', `"${item.title}" added`)
                              } catch {
                                Alert.alert('Error', 'Failed to add song')
                              }
                            }}
                            activeOpacity={0.6}
                          >
                            <Text style={styles.modalSongTitle}>{item.title}</Text>
                            <View style={styles.addCircle}>
                              <Ionicons name="add" size={14} color="#FAFAFA" />
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <PlaylistSongViewerModal
        visible={showSongViewer}
        songs={viewerSongs}
        startIndex={viewerStartIndex}
        onClose={() => setShowSongViewer(false)}
      />
    </View>
  )
}

/* ─── SHARED COMPONENTS ─── */

function EmptyState({ icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name={icon} size={28} color="#B0B0B0" />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
  )
}

function FAB({ onPress, icon }: { onPress: () => void; icon: any }) {
  return (
    <TouchableOpacity style={styles.fab} onPress={onPress} activeOpacity={0.82}>
      <Ionicons name={icon} size={24} color="#FAFAFA" />
    </TouchableOpacity>
  )
}

/* ─── STYLES ─── */
const styles = StyleSheet.create({
  flex1: { flex: 1 },
  container: { flex: 1, backgroundColor: '#FAFAFA' },

  loadingContainer: { flex: 1, backgroundColor: '#FAFAFA', justifyContent: 'center', alignItems: 'center', gap: 14 },
  loadingText: { fontSize: 12, letterSpacing: 1.4, color: '#ADADAD', textTransform: 'uppercase', fontWeight: '600' },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, backgroundColor: '#FAFAFA', gap: 10 },
  headerLogo: { fontSize: 22, color: '#0A0A0A', lineHeight: 28 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#0A0A0A', letterSpacing: -0.5 },

  tabBar: { flexDirection: 'row', backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: '#EBEBEB', paddingHorizontal: 20 },
  tab: { paddingVertical: 13, marginRight: 28, position: 'relative' },
  tabActive: {},
  tabLabel: { fontSize: 13, fontWeight: '600', color: '#C0C0C0', letterSpacing: 0.3 },
  tabLabelActive: { color: '#0A0A0A' },
  tabUnderline: { position: 'absolute', bottom: -1, left: 0, right: 0, height: 2, backgroundColor: '#0A0A0A', borderRadius: 1 },

  sectionLabel: { fontSize: 10, fontWeight: '700', color: '#C0C0C0', letterSpacing: 1.8, marginBottom: 12, marginTop: 4 },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 100 },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, paddingBottom: 80 },
  emptyIconWrap: { width: 60, height: 60, borderRadius: 18, backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', letterSpacing: -0.2 },
  emptySubtitle: { fontSize: 13, color: '#B0B0B0', letterSpacing: 0.1 },

  artistBlock: { marginTop: 10, borderRadius: 16, overflow: 'hidden', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EBEBEB' },
  artistRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  artistMonogram: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#F2F2F2', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E8E8E8' },
  artistMonogramActive: { backgroundColor: '#0A0A0A', borderColor: '#0A0A0A' },
  artistMonogramText: { fontSize: 15, fontWeight: '800', color: '#666', letterSpacing: -0.3 },
  artistMonogramTextActive: { color: '#FAFAFA' },
  artistMeta: { flex: 1, gap: 2 },
  artistName: { fontSize: 15, fontWeight: '700', color: '#0A0A0A', letterSpacing: -0.2 },
  artistSongCount: { fontSize: 11, color: '#B8B8B8', fontWeight: '500', letterSpacing: 0.2 },
  chevronWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },

  songList: { borderTopWidth: 1, borderTopColor: '#F2F2F2', backgroundColor: '#FCFCFC' },
  songRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  songRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F4F4F4' },
  songRowInner: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 10 },
  songIndex: { fontSize: 11, fontWeight: '700', color: '#D4D4D4', minWidth: 18 },
  songTitle: { fontSize: 13.5, color: '#333', flex: 1, fontWeight: '500', letterSpacing: 0.1 },
  addBtn: { width: 32, height: 32, borderRadius: 9, backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },

  playlistCard: { flexDirection: 'row', alignItems: 'center', marginTop: 10, backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#EBEBEB', paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  playlistNumberBox: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#F2F2F2', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E8E8E8' },
  playlistNumber: { fontSize: 14, fontWeight: '800', color: '#888' },
  playlistCardContent: { flex: 1, gap: 3 },
  playlistTitle: { fontSize: 15, fontWeight: '700', color: '#0A0A0A', letterSpacing: -0.2 },
  playlistDesc: { fontSize: 12, color: '#B8B8B8', fontWeight: '400' },
  deleteBtn: { width: 30, height: 30, justifyContent: 'center', alignItems: 'center' },

  detailHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#EBEBEB', gap: 12 },
  detailBackBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F2F2F2', justifyContent: 'center', alignItems: 'center' },
  detailHeaderMeta: { flex: 1, gap: 2 },
  detailHeaderLabel: { fontSize: 9, fontWeight: '700', color: '#C0C0C0', letterSpacing: 2 },
  detailHeaderTitle: { fontSize: 15, fontWeight: '800', color: '#0A0A0A', letterSpacing: -0.3 },
  detailBadge: { backgroundColor: '#0A0A0A', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 4, minWidth: 28, alignItems: 'center' },
  detailBadgeText: { fontSize: 12, fontWeight: '800', color: '#FAFAFA' },

  // Playlist item row with inline reorder
  playlistItemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', marginTop: 8, borderRadius: 13, borderWidth: 1, borderColor: '#EBEBEB', paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  itemIndex: { fontSize: 11, fontWeight: '800', color: '#D4D4D4', minWidth: 20 },
  itemTitle: { flex: 1, fontSize: 14, color: '#1A1A1A', fontWeight: '600', letterSpacing: -0.1 },
  reorderBtns: { flexDirection: 'column', gap: 2 },
  reorderBtn: { width: 24, height: 24, borderRadius: 6, backgroundColor: '#F2F2F2', justifyContent: 'center', alignItems: 'center' },
  reorderBtnDisabled: { opacity: 0.35 },
  removeBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },

  fab: { position: 'absolute', bottom: 28, right: 20, width: 54, height: 54, borderRadius: 17, backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingBottom: 36 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E0E0E0', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  modalTitle: { fontSize: 15, fontWeight: '800', color: '#0A0A0A', letterSpacing: -0.3 },
  modalCancel: { fontSize: 14, color: '#ADADAD', fontWeight: '500', minWidth: 54 },
  modalActionBtn: { backgroundColor: '#0A0A0A', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, minWidth: 54, alignItems: 'center' },
  modalAction: { fontSize: 13, fontWeight: '700', color: '#FAFAFA' },
  modalBody: { paddingHorizontal: 20, paddingTop: 22 },
  modalScrollBody: { paddingHorizontal: 20, paddingTop: 10 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: '#C0C0C0', letterSpacing: 2, marginBottom: 9, textTransform: 'uppercase' },
  textInput: { backgroundColor: '#F7F7F7', borderRadius: 13, borderWidth: 1.5, borderColor: '#EBEBEB', paddingHorizontal: 15, paddingVertical: 14, fontSize: 15, color: '#0A0A0A', fontWeight: '500' },
  textArea: { minHeight: 82, textAlignVertical: 'top' },

  modalArtistRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 10 },
  modalArtistMonogram: { width: 32, height: 32, borderRadius: 9, backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center' },
  modalArtistMonogramText: { fontSize: 13, fontWeight: '800', color: '#666' },
  modalArtistName: { flex: 1, fontSize: 14, fontWeight: '700', color: '#0A0A0A', letterSpacing: -0.1 },
  modalSongGroup: { backgroundColor: '#FCFCFC', marginLeft: 12, borderLeftWidth: 2, borderLeftColor: '#EBEBEB', paddingLeft: 12, marginBottom: 4 },
  modalSongRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  modalSongRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F4F4F4' },
  modalSongTitle: { flex: 1, fontSize: 13.5, color: '#333', fontWeight: '500' },
  addCircle: { width: 26, height: 26, borderRadius: 8, backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center' },
})