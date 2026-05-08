# Saved Worship Music Tool

A React Native + Expo mobile app for managing chord lists, lyrics, and worship music setlists with offline support and real-time sync.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React Native + Expo |
| Local DB | WatermelonDB (SQLite) |
| Backend | Supabase (PostgreSQL, Auth, Realtime) |
| Audio | Expo AV |
| Navigation | React Navigation (Tab + Stack) |
| Language | TypeScript |

---

## Project Structure

```
SavedWorshipMusicTool/
├── App.tsx                          # Root component with auth & navigation
├── index.ts                         # App entry point
├── package.json                     # Dependencies
├── tsconfig.json                    # TypeScript config
│
├── assets/
│   ├── SavedLOGO.png               # App logo
│   └── sounds/
│       └── click.wav               # Metronome click sound
│
├── db/
│   ├── index.ts                    # Database initialization
│   ├── schema.ts                   # WatermelonDB schema definition
│   └── models.ts                   # WatermelonDB model classes
│
├── lib/
│   ├── supabase.ts                 # Supabase client (DO NOT COMMIT)
│   ├── supabase.example.ts         # Supabase client template
│   ├── auth.ts                     # Authentication utilities
│   ├── sync.ts                     # Sync adapter (pull/push to Supabase)
│   └── transpose.ts                # Pure chord transposition logic
│
└── screens/
    ├── SignInScreen.tsx             # Email + Google login
    ├── SignUpScreen.tsx             # Email registration
    ├── ChordListsHomeScreen.tsx     # Browse chord lists
    ├── ChordListScreen.tsx          # View/edit song with transpose
    ├── AddSongScreen.tsx            # Add new song
    ├── MetronomeScreen.tsx          # BPM slider + tap tempo + audio
    ├── ManualTransposeScreen.tsx    # Manual chord transposition
    ├── PersonalNotesScreen.tsx      # Private user-only chord lists
    ├── ManagementScreen.tsx         # App management
    ├── ConversationScreen.tsx       # Real-time chat
    ├── AddContactsScreen.tsx        # Add contacts
    ├── EditAccountScreen.tsx        # Edit user profile
    └── AudioToolsScreen.tsx         # Audio utilities
```

---

## Features

### Chord Lists with Lyrics/Chords Toggle
- **Display Modes**: Lyrics only, Chords only, or Both
- **Transpose**: Shift all chords up/down by semitones
- **Format**: Chords embedded in `[chord]` format — e.g. `[G]Amazing [D]grace`

### Auto-Transpose Utility
- `transposeChord("G", 2)` → `"A"`
- `transposeText("[G]Song", -3)` → `"[Eb]Song"`
- Handles sharps/flats, minor chords, extended chords
- Full 12-note chromatic scale with wraparound

### Metronome
- BPM slider (40–300)
- Tap tempo with averaging
- Audio click via Expo AV
- Preset tempos: 60, 90, 120, 140, 160
- Visual beat indicator

### Offline Sync (WatermelonDB)
- All reads/writes go to local SQLite first
- UI never queries Supabase directly
- Sync adapter pushes/pulls changes in the background
- `_synced` boolean tracks sync status per record

### Auth (Supabase)
- Email + password sign up / sign in
- Google OAuth
- Persistent sessions via AsyncStorage
- Reactive auth state listener

### Personal Notes
- Private chord lists scoped to logged-in user
- Created via modal on PersonalNotesScreen

---

## Setup

### 1. Prerequisites
```bash
npm install -g expo-cli
node --version  # Node 16+ required
```

### 2. Install Dependencies
```bash
cd SavedWorshipMusicTool
npm install
```

### 3. Configure Supabase

Copy the example file and fill in your keys:
```bash
cp lib/supabase.example.ts lib/supabase.ts
```

Edit `lib/supabase.ts`:
```ts
const supabaseUrl = 'YOUR_SUPABASE_URL'
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY'
```

> ⚠️ `lib/supabase.ts` is gitignored. Never commit your real keys.

Get your keys from: [supabase.com](https://supabase.com) → Project → **Settings → API**

### 4. Create Supabase Tables

Run this SQL in your Supabase SQL editor:

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

### 5. Enable Auth Providers
- Supabase dashboard → **Authentication → Providers**
- Enable **Email**
- Configure **Google OAuth** (requires Google Cloud project)

### 6. Add Metronome Audio
Place a click sound at `assets/sounds/click.wav`.

### 7. Run the App
```bash
npm start           # Expo dev server
npm run android     # Android emulator
npm run ios         # iOS simulator
```

---

## Building an APK

```bash
# Make sure android/local.properties has your SDK path:
# sdk.dir=C\:/Users/YourName/AppData/Local/Android/Sdk

cd android
./gradlew assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

---

## Sync Strategy

```typescript
// Push local changes to Supabase
await syncPushToSupabase(userId)

// Pull server changes to local
await syncPullFromSupabase(userId, lastSyncTime)

// Full sync (pull first, then push)
await fullSync(userId)
```

---

## Usage Examples

```typescript
// Transpose a single chord
transposeChord('Dm', 2)  // → "Em"

// Transpose an entire lyrics block
transposeText("[G]Amazing [D]grace how [A]sweet", 3)
// → "[Bb]Amazing [F]grace how [C]sweet"

// Query songs by chord list
const songs = await database
  .get('songs')
  .query()
  .where('chord_list_id', chordListId)
  .fetch()

// Get private notes
const myNotes = await database
  .get('chord_lists')
  .query()
  .where('user_id', userId)
  .where('is_private', true)
  .fetch()
```

---

## Troubleshooting

**Database not syncing** — Check `_synced` field, verify Supabase connection, and review RLS policies.

**Auth session lost** — Verify AsyncStorage is configured in `supabase.ts` and check Supabase dashboard for active sessions.

**Metronome audio not playing** — Ensure `assets/sounds/click.wav` exists and audio permissions are set in `app.json`.

**Transpose not working** — Verify chord format uses `[chord]` pattern and check `lib/transpose.ts` for supported note formats.

**Android build fails (SDK not found)** — Make sure `android/local.properties` contains the correct `sdk.dir` path.

---

## Future Features

- [ ] Song lyrics search
- [ ] Playlist creation
- [ ] Social sharing (lineups)
- [ ] Push notifications for shared updates
- [ ] Audio recording for practice
- [ ] Chord diagram visualizations

---

## References

- [WatermelonDB Docs](https://nozbe.github.io/WatermelonDB/)
- [Supabase Docs](https://supabase.com/docs)
- [React Navigation](https://reactnavigation.org/)
- [Expo AV](https://docs.expo.dev/versions/latest/sdk/av/)
- [EAS Build](https://docs.expo.dev/build/setup/)