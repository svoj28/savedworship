# Saved Worship Music Tool

A React Native + Expo mobile app for managing chord lists, lyrics, and worship music setlists with offline support and real-time sync.

## Tech Stack

- **Frontend**: React Native with Expo managed workflow
- **Local DB**: WatermelonDB (SQLite)
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Storage)
- **Audio**: Expo AV
- **Notifications**: Expo Push Notifications (ready for integration)
- **Navigation**: React Navigation (Tab + Stack)
- **Language**: TypeScript

## Project Structure

```
SavedWorshipMusicTool/
├── App.tsx                      # Root component with auth & navigation
├── index.ts                     # App entry point
├── package.json                 # Dependencies
├── tsconfig.json               # TypeScript config
│
├── db/
│   ├── index.ts               # Database initialization
│   ├── schema.ts              # WatermelonDB schema definition
│   ├── models.ts              # WatermelonDB model classes
│
├── lib/
│   ├── supabase.ts            # Supabase client setup
│   ├── auth.ts                # Authentication utilities (email, Google)
│   ├── sync.ts                # Sync adapter (pull/push to Supabase)
│   ├── transpose.ts           # Pure chord transposition logic
│
├── screens/
│   ├── SignInScreen.tsx       # Email + Google login
│   ├── SignUpScreen.tsx       # Email registration
│   ├── ChordListsHomeScreen.tsx # Browse chord lists
│   ├── ChordListScreen.tsx    # View/edit song with transpose & toggle
│   ├── AddSongScreen.tsx      # Add new song to chord list
│   ├── MetronomeScreen.tsx    # BPM slider + tap tempo + audio click
│   ├── PersonalNotesScreen.tsx # Private user-only chord lists
│
├── assets/
│   ├── sounds/
│   │   └── click.wav          # Metronome click sound (add this)
│
└── .env (create this)
    SUPABASE_URL=...
    SUPABASE_ANON_KEY=...
```

## Key Features

### 1. Chord Lists with Lyrics/Chords Toggle
- **Display Modes**:
  - `Lyrics only` - hide all chords
  - `Chords only` - show chords list
  - `Both` - show lyrics with embedded chords
- **Transpose**: Shift all chords up/down by semitones
- **Format**: Chords in `[chord]` format, e.g., `[G]Amazing [D]grace`

### 2. Auto-Transpose Utility
Pure function (no external library needed):
- `transposeChord("G", 2)` → `"A"`
- `transposeText("[G]Song", -3)` → `"[Eb]Song"`
- Handles sharps/flats, minor chords, extended chords
- 12-note chromatic scale with wraparound

### 3. Metronome
- BPM slider (40-300)
- Tap tempo with averaging
- Audio click using Expo AV
- Preset tempos (60, 90, 120, 140, 160)
- Visual beat indicator

### 4. WatermelonDB Offline Sync
**Local-first approach**:
- All reads/writes go to WatermelonDB (local SQLite)
- UI never queries Supabase directly
- Sync adapter pushes/pulls changes to Supabase
- `_synced` boolean tracks sync status

**Tables**:
- `artists` - group chord lists by artist
- `chord_lists` - collections of songs
- `songs` - individual songs with lyrics+chords
- `lineups` - shared setlists
- `lineup_items` - songs in a lineup (ordered)
- `messages` - real-time chat

### 5. Auth (Supabase)
- Email + password sign up/sign in
- Google OAuth (Expo setup required)
- Persistent sessions (AsyncStorage)
- Auth state listener for reactive UI

### 6. Personal Notes
- Private chord lists (only visible to logged-in user)
- Created via modal on PersonalNotesScreen
- User-scoped queries using `user_id`

## Setup Instructions

### 1. Prerequisites
```bash
npm install -g expo-cli
node --version  # Ensure Node 16+
```

### 2. Install Dependencies
```bash
cd SavedWorshipMusicTool
npm install
```

**Note**: WatermelonDB may require additional setup for iOS. See: https://nozbe.github.io/WatermelonDB/Installation.html

### 3. Configure Supabase
1. Create project at https://supabase.com
2. Set environment variables in `supabase.ts` or use `.env`:
   ```
   SUPABASE_URL=your_project_url
   SUPABASE_ANON_KEY=your_anon_key
   ```

3. Create tables in Supabase (matching schema):
   ```sql
   CREATE TABLE artists (
     id UUID PRIMARY KEY,
     name TEXT NOT NULL,
     user_id UUID NOT NULL,
     created_at TIMESTAMP DEFAULT NOW(),
     updated_at TIMESTAMP DEFAULT NOW(),
     _synced BOOLEAN DEFAULT false
   );

   CREATE TABLE chord_lists (
     id UUID PRIMARY KEY,
     title TEXT NOT NULL,
     artist_id UUID REFERENCES artists(id),
     user_id UUID NOT NULL,
     is_private BOOLEAN DEFAULT false,
     created_at TIMESTAMP DEFAULT NOW(),
     updated_at TIMESTAMP DEFAULT NOW(),
     _synced BOOLEAN DEFAULT false
   );

   CREATE TABLE songs (
     id UUID PRIMARY KEY,
     chord_list_id UUID REFERENCES chord_lists(id),
     title TEXT NOT NULL,
     content TEXT,
     key TEXT,
     created_at TIMESTAMP DEFAULT NOW(),
     updated_at TIMESTAMP DEFAULT NOW(),
     _synced BOOLEAN DEFAULT false
   );

   CREATE TABLE lineups (
     id UUID PRIMARY KEY,
     title TEXT NOT NULL,
     user_id UUID NOT NULL,
     description TEXT,
     created_at TIMESTAMP DEFAULT NOW(),
     updated_at TIMESTAMP DEFAULT NOW(),
     _synced BOOLEAN DEFAULT false
   );

   CREATE TABLE lineup_items (
     id UUID PRIMARY KEY,
     lineup_id UUID REFERENCES lineups(id),
     song_id UUID REFERENCES songs(id),
     position INTEGER,
     created_at TIMESTAMP DEFAULT NOW(),
     _synced BOOLEAN DEFAULT false
   );

   CREATE TABLE messages (
     id UUID PRIMARY KEY,
     sender_id UUID NOT NULL,
     receiver_id UUID NOT NULL,
     text TEXT NOT NULL,
     created_at TIMESTAMP DEFAULT NOW(),
     _synced BOOLEAN DEFAULT false
   );
   ```

4. Enable Auth:
   - Go to Authentication → Providers
   - Enable Email (for sign up/sign in)
   - Configure Google OAuth (requires Google Cloud project)

### 4. Add Metronome Audio
Place a click sound at `assets/sounds/click.wav` or generate programmatically in MetronomeScreen.

### 5. Run the App
```bash
npm start              # Expo dev server
npm run android        # Android emulator
npm run ios           # iOS simulator
npm run web           # Web browser
```

## Sync Strategy

### Push (Local → Supabase)
```typescript
// Pushes all records where _synced = false
await syncPushToSupabase(userId)
```

### Pull (Supabase → Local)
```typescript
// Fetches updated records from server
await syncPullFromSupabase(userId, lastSyncTime)
```

### Full Sync
```typescript
// Pull first (get server state), then push local changes
await fullSync(userId)
```

### Real-time Subscription
```typescript
// Listen for changes from other users/clients
const unsubscribe = subscribeToChanges(userId, () => {
  // Refetch when changes arrive
})
```

## Usage Examples

### Transposing a Song
```typescript
import { transposeText, transposeChord } from './lib/transpose'

// Single chord
const newChord = transposeChord('Dm', 2)  // → "Em"

// Entire lyrics block
const newLyrics = transposeText(
  "[G]Amazing [D]grace how [A]sweet",
  3  // Transpose up 3 semitones
)
// → "[Bb]Amazing [F]grace how [C]sweet"
```

### Creating a Song
```typescript
const songCollection = database.get('songs')
await database.write(async () => {
  await songCollection.create((song) => {
    song.chordListId = 'list-123'
    song.title = 'Amazing Grace'
    song.content = '[G]Amazing [D]grace how [A]sweet'
    song.key = 'G'
    song.createdAt = Date.now()
    song.synced = false
  })
})
```

### Syncing with Supabase
```typescript
import { fullSync } from './lib/sync'

// When user goes online
await fullSync(userId)

// Listen for real-time updates
const unsubscribe = subscribeToChanges(userId, () => {
  // Refresh UI after changes
})
```

## Common Tasks

### Query Songs by Chord List
```typescript
const songs = await database
  .get('songs')
  .query()
  .where('chord_list_id', chordListId)
  .fetch()
```

### Get Personal Notes (Private Lists)
```typescript
const myNotes = await database
  .get('chord_lists')
  .query()
  .where('user_id', userId)
  .where('is_private', true)
  .fetch()
```

### Listen for Auth Changes
```typescript
import { onAuthStateChange } from './lib/auth'

onAuthStateChange((user) => {
  if (user) {
    console.log('Logged in:', user.email)
    // Trigger sync
    await fullSync(user.id)
  } else {
    console.log('Logged out')
  }
})
```

## Deployment (EAS Build)

```bash
# Configure for iOS/Android
eas build --platform ios
eas build --platform android

# Submit to App Store / Google Play
eas submit --platform ios
eas submit --platform android
```

## Future Features

- [ ] Song lyrics search
- [ ] Playlist creation
- [ ] Social sharing (lineups)
- [ ] Real-time chat (Supabase Realtime)
- [ ] Push notifications for shared updates
- [ ] Audio recording for practice
- [ ] Chord diagram visualizations
- [ ] Dark mode support

## Troubleshooting

### Database Not Syncing
- Check `_synced` field in WatermelonDB
- Verify Supabase connection and RLS policies
- Check console for sync errors in `lib/sync.ts`

### Auth Session Lost
- Verify AsyncStorage is configured in supabase.ts
- Check Supabase dashboard for active sessions

### Metronome Audio Not Playing
- Ensure `assets/sounds/click.wav` exists
- Check Audio permissions in app.json
- Test with Expo Go first

### Transpose Not Working
- Verify chord format in database matches `[chord]` pattern
- Check transpose.ts for supported note formats

## References

- [WatermelonDB Docs](https://nozbe.github.io/WatermelonDB/)
- [Supabase Docs](https://supabase.com/docs)
- [React Navigation](https://reactnavigation.org/)
- [Expo AV](https://docs.expo.dev/versions/latest/sdk/av/)
- [EAS Build](https://docs.expo.dev/build/setup/)
