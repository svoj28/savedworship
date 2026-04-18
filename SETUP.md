# Environment Setup Guide

## 1. Supabase Configuration

Create `.env` or directly update `lib/supabase.ts`:

```typescript
// lib/supabase.ts
const SUPABASE_URL = 'https://[YOUR-PROJECT].supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOi...' // From Supabase Settings → API
```

To find these values:
1. Go to https://app.supabase.com
2. Select your project
3. Settings → API
4. Copy `Project URL` and `anon` key

## 2. Google OAuth Setup

### A. Google Cloud Console
1. Go to https://console.cloud.google.com
2. Create a new project or select existing
3. Enable Google+ API
4. Go to Credentials → Create OAuth 2.0 Client ID
5. Configure OAuth consent screen:
   - User type: External
   - Add required scopes: `email`, `profile`, `openid`
   - Add test users (your Gmail)
6. Create credential:
   - Type: iOS/Android (or Web for testing)
   - Download credentials JSON

### B. Supabase OAuth Configuration
1. Go to Supabase Dashboard → Authentication → Providers
2. Enable Google
3. Enter:
   - Client ID: from Google Cloud Credentials
   - Client Secret: from Google Cloud Credentials
4. Authorized redirect URIs (add in Google Cloud):
   ```
   https://[YOUR-PROJECT].supabase.co/auth/v1/callback
   ```

### C. Deep Link Configuration (for OAuth callback)
Update `app.json`:

```json
{
  "expo": {
    "scheme": "savedworshipmusictool",
    "plugins": [
      [
        "expo-auth-session/with-auth-session",
        {
          "redirectUrl": "savedworshipmusictool://auth/callback"
        }
      ]
    ]
  }
}
```

## 3. Supabase Database Schema

Run these SQL migrations in Supabase SQL Editor:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Artists table
CREATE TABLE artists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  _synced BOOLEAN DEFAULT false,
  CONSTRAINT user_artist_unique UNIQUE(user_id, name)
);

-- Chord Lists table
CREATE TABLE chord_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  artist_id UUID REFERENCES artists(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_private BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  _synced BOOLEAN DEFAULT false,
  CONSTRAINT user_list_unique UNIQUE(user_id, title)
);

-- Songs table
CREATE TABLE songs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chord_list_id UUID NOT NULL REFERENCES chord_lists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  key TEXT DEFAULT 'C',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  _synced BOOLEAN DEFAULT false
);

-- Lineups table (shared setlists)
CREATE TABLE lineups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  _synced BOOLEAN DEFAULT false
);

-- Lineup Items table
CREATE TABLE lineup_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lineup_id UUID NOT NULL REFERENCES lineups(id) ON DELETE CASCADE,
  song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  _synced BOOLEAN DEFAULT false,
  CONSTRAINT unique_position UNIQUE(lineup_id, position)
);

-- Messages table (for chat)
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  _synced BOOLEAN DEFAULT false
);

-- Enable Row Level Security (RLS)
ALTER TABLE artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE chord_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineup_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for artists
CREATE POLICY "Users can view their own artists"
  ON artists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own artists"
  ON artists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own artists"
  ON artists FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for chord_lists
CREATE POLICY "Users can view their private lists and public lists"
  ON chord_lists FOR SELECT
  USING (auth.uid() = user_id OR is_private = false);

CREATE POLICY "Users can insert their own chord lists"
  ON chord_lists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chord lists"
  ON chord_lists FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for songs
CREATE POLICY "Users can view songs from their accessible lists"
  ON songs FOR SELECT
  USING (
    chord_list_id IN (
      SELECT id FROM chord_lists
      WHERE auth.uid() = user_id OR is_private = false
    )
  );

CREATE POLICY "Users can insert songs to their chord lists"
  ON songs FOR INSERT
  WITH CHECK (
    chord_list_id IN (
      SELECT id FROM chord_lists WHERE auth.uid() = user_id
    )
  );

-- Similar policies for other tables...
-- (Create READ, INSERT, UPDATE for lineups, lineup_items, messages)
```

## 4. app.json Configuration

Update your `app.json` with:

```json
{
  "expo": {
    "name": "Saved Worship Music Tool",
    "slug": "savedworshipmusictool",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "scheme": "savedworshipmusictool",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "updates": {
      "fallbackToCacheTimeout": 0
    },
    "assetBundlePatterns": [
      "**/*"
    ],
    "ios": {
      "supportsTabletMode": true,
      "bundleIdentifier": "com.worshipmusictool"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "package": "com.worshipmusictool"
    },
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "plugins": [
      [
        "expo-auth-session/with-auth-session"
      ]
    ]
  }
}
```

## 5. Metronome Audio Setup

Add a click sound file:
1. Generate or download a metronome click (.wav format)
2. Place at: `assets/sounds/click.wav`
3. Or programmatically generate in MetronomeScreen.tsx using tone synthesis

## 6. Build & Deployment

### Local Development
```bash
npm install
npm start
```

### EAS Build (Production)
```bash
eas build --platform ios
eas build --platform android
eas submit --platform ios
eas submit --platform android
```

## 7. Testing Checklist

- [ ] Sign in with email works
- [ ] Sign in with Google works
- [ ] Can create chord lists
- [ ] Transpose works (test multiple keys)
- [ ] Lyrics/chords toggle works
- [ ] Metronome plays audio
- [ ] Tap tempo calculates BPM
- [ ] Personal notes only show to logged-in user
- [ ] Offline: app works without internet
- [ ] Sync: changes appear after going online
- [ ] Real-time: chat/updates appear live (with Realtime enabled)

## Troubleshooting

### "Module not found: @nozbe/watermelondb"
```bash
npm install @nozbe/watermelondb
cd node_modules/@nozbe/watermelondb
npm install
```

### "Supabase connection failed"
- Check SUPABASE_URL and SUPABASE_ANON_KEY are correct
- Verify Supabase project is running
- Check internet connection

### "Audio not playing"
- Ensure `assets/sounds/click.wav` exists
- Check app permissions in app.json
- Test in Expo Go first

### "RLS policy blocking data"
- Check RLS policies are created
- Verify auth.uid() matches user_id in database
- Try disabling RLS for testing (not for production)
