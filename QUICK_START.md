# Quick Start Guide

## Installation

```bash
cd SavedWorshipMusicTool
npm install
```

## Running the App

```bash
# Start Expo dev server
npm start

# On Android emulator
npm run android

# On iOS simulator
npm run ios

# On web browser
npm run web
```

## First-Time Setup

### 1. Create Supabase Project
1. Go to https://supabase.com
2. Click "New Project"
3. Enter project details
4. Wait for it to be ready
5. Go to Settings → API
6. Copy `Project URL` and `anon key`

### 2. Update Supabase Credentials
Edit `lib/supabase.ts`:

```typescript
const SUPABASE_URL = 'https://[YOUR-PROJECT].supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOi...'  // from Supabase
```

### 3. Create Database Schema
1. Go to Supabase Dashboard
2. SQL Editor
3. Copy/paste SQL from [SETUP.md](./SETUP.md)
4. Run the queries

### 4. Seed Test Data (Optional)
In App.tsx, after auth:

```typescript
import { seedDatabase } from './lib/seedData'

// After user is authenticated:
await seedDatabase(userId)
```

### 5. Test the App
- [ ] Sign up with email
- [ ] Try transposing a chord
- [ ] Use metronome
- [ ] Add personal notes

## Project Structure

```
SavedWorshipMusicTool/
├── db/               # WatermelonDB models & schema
├── lib/              # Business logic & utilities
├── screens/          # React Native screens
├── App.tsx           # Root navigation & auth
├── README.md         # Full documentation
├── SETUP.md          # Detailed setup instructions
└── QUICK_START.md    # This file
```

## Key Files to Know

| File | Purpose |
|------|---------|
| `lib/transpose.ts` | Chord transposition math |
| `lib/auth.ts` | Supabase auth (email, Google) |
| `lib/sync.ts` | WatermelonDB ↔ Supabase sync |
| `screens/ChordListScreen.tsx` | Main chord viewer with transpose |
| `screens/MetronomeScreen.tsx` | Metronome with BPM & tap tempo |
| `screens/PersonalNotesScreen.tsx` | User-private chord lists |

## Common Commands

### Adding a New Screen
1. Create file in `screens/`
2. Add to navigation in `App.tsx`
3. Import required utilities from `lib/`

### Working with WatermelonDB
```typescript
// Read
const songs = await database.get('songs').query().fetch()

// Create
await database.write(async () => {
  await database.get('songs').create((song) => {
    song.title = 'Amazing Grace'
    song.key = 'G'
  })
})

// Update
await database.write(async () => {
  await song.update(() => {
    song.title = 'New Title'
  })
})

// Delete
await database.write(async () => {
  await song.destroyPermanently()
})
```

### Transposing Chords
```typescript
import { transposeText, transposeChord } from './lib'

// Single chord
transposeChord('G', 2)  // → 'A'

// Song content
transposeText('[G]Song [D]title', -2)  // → '[F]Song [C]title'
```

### Syncing with Supabase
```typescript
import { fullSync } from './lib'

// When user goes online
await fullSync(userId)
```

## Troubleshooting

### "Can't find module 'lib/supabase'"
- Check you have `lib/supabase.ts` with Supabase credentials
- Run `npm install` again

### "Database locked" error
- WatermelonDB is writing in background
- Wait a moment or restart app
- Check `await database.write()` usage

### "Auth not working"
- Verify Supabase credentials in `lib/supabase.ts`
- Check Supabase project is running
- Clear app cache/storage

### "Metronome has no sound"
- Add `assets/sounds/click.wav`
- Check audio permissions in `app.json`
- Test with Expo Go first

### "Personal notes show all users' data"
- RLS policies not enabled in Supabase
- Run SQL from SETUP.md to create policies
- Verify `auth.uid()` matches `user_id` in database

## Development Tips

### Debug WatermelonDB Queries
```typescript
// Add logging before query
const songs = await database
  .get('songs')
  .query()
  .where('chord_list_id', chordListId)
  .fetch()

console.log('Fetched songs:', songs.length)
```

### Test Auth State
```typescript
import { getCurrentUser } from './lib'

const user = await getCurrentUser()
console.log('Current user:', user)
```

### Monitor Sync Status
```typescript
// Check _synced field
const unsyncedSongs = await database
  .get('songs')
  .query()
  .where('_synced', false)
  .fetch()

console.log('Unsynced:', unsyncedSongs.length)
```

### Test Metronome Without Running App
```typescript
import { transposeChord } from './lib'

// Test transpose logic directly
console.log(transposeChord('Dm', 5))  // Should print 'Gm'
```

## Next Steps

1. **Configure Supabase** - Follow [SETUP.md](./SETUP.md)
2. **Test Basic Flow** - Sign up, create chord list, add song
3. **Test Transpose** - Change chords, verify they shift correctly
4. **Test Sync** - Go offline, make changes, go online
5. **Build for Production** - Use `eas build` for iOS/Android
6. **Deploy** - Submit to App Store and Google Play

## Resources

- [WatermelonDB Docs](https://nozbe.github.io/WatermelonDB/)
- [Supabase Docs](https://supabase.com/docs)
- [React Navigation](https://reactnavigation.org/)
- [Expo Docs](https://docs.expo.dev)
- [React Native](https://reactnative.dev)

## Getting Help

Check the console for errors:
```bash
# With Expo
npm start

# Watch for console output
# Errors will appear in terminal and in-app overlay
```

Common error patterns:
- `Cannot find module` → Run `npm install`
- `Database locked` → Wait or restart
- `RLS policy violation` → Check Supabase SQL policies
- `Auth failed` → Verify credentials in `lib/supabase.ts`

---

**Ready to go!** Start with `npm start` and test the app. 🎵
