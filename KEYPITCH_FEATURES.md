# Key/Pitch Changer - Enhanced Features

## Overview
The Key/Pitch Changer screen has been significantly enhanced with new features for local audio management, key detection, and improved user experience.

## New Features

### 1. **Local Audio Import & Storage**
- Import audio files directly from your device
- Audio files are automatically saved locally on your device
- No cloud uploads - complete privacy
- Files are stored in the app's document directory
- Metadata about original key and pitch shifts are saved with each file

**How it works:**
```
Device Audio → Import → Local Storage (Encrypted)
                     ↓
                  Playback & Analysis
```

### 2. **Automatic Key Detection**
The app attempts to detect the original key of your audio file using audio analysis:
- Uses autocorrelation algorithm for pitch detection
- Shows confidence level (0-100%)
- Can be overridden manually if detection isn't accurate

**Key Detection Process:**
1. Audio file is analyzed
2. Dominant frequencies are extracted
3. Pitch is calculated and mapped to nearest musical note
4. Confidence score indicates accuracy

### 3. **Audio Playback Controls**
- **Play/Pause Button**: Start or pause playback
- **Stop Button**: Stop playback and reset
- **Progress Slider**: Seek to any position in the audio
- **Time Display**: Current position / Total duration
- Real-time position updates during playback

### 4. **Pitch Shift Management**
- Select from 12 musical notes (C, C#, D, D#, E, F, F#, G, G#, A, A#, B)
- Adjust pitch using semitone slider (-12 to +12 semitones)
- Quick preset buttons for common transpositions:
  - Down 1 Octave (-12 semitones)
  - Down Perfect 5th (-7 semitones)
  - Down Perfect 4th (-5 semitones)
  - Down Major 2nd (-2 semitones)
  - Original (0 semitones)
  - Up Major 2nd (+2 semitones)
  - Up Perfect 4th (+5 semitones)
  - Up Perfect 5th (+7 semitones)
  - Up 1 Octave (+12 semitones)

### 5. **Real-time Key Transition Preview**
- Visual display showing current key → target key
- Automatic calculation of target key based on semitone shift
- Easy to understand representation

## File Structure

### New Utility Files Created

#### `lib/keyDetection.ts`
Provides key and pitch detection functionality:
- `autoCorrelate()` - Detects pitch from audio buffer using autocorrelation
- `frequencyToNote()` - Converts frequency to musical note
- `frequencyToMidi()` - Converts frequency to MIDI note number
- `detectKeyFromFrequency()` - Identifies key and confidence level
- `transposeNote()` - Calculates target note after transposition
- `getSemitonesBetweenNotes()` - Calculates semitone difference

#### `lib/audioFileManager.ts`
Manages local audio file storage:
- `saveAudioFileLocally()` - Saves imported audio files locally
- `getAllAudioFiles()` - Retrieves all saved audio files
- `deleteAudioFile()` - Removes audio file
- `updateAudioFileMetadata()` - Stores pitch shift information
- `getAudioFileMetadata()` - Retrieves stored information
- `saveToMediaLibrary()` - Optional export to device media library

#### `lib/audioPlayer.ts`
Provides audio playback functionality:
- `AudioPlayer` class for managing playback
- Play, pause, stop, seek controls
- Status updates and callbacks
- Playback rate adjustment

### Enhanced Components

#### `screens/KeyPitchChangerScreen.tsx`
Complete redesign with:
- Modern UI with improved layout
- Audio import with local saving
- Key detection with confidence display
- Playback controls and progress tracking
- Enhanced pitch adjustment interface
- Feature showcase section
- Better documentation and instructions

## Usage Workflow

### Step 1: Import Audio
1. Tap "Import Audio File" button
2. Select an audio file from your device (MP3, WAV, etc.)
3. File is automatically saved locally
4. App begins key detection analysis

### Step 2: Review Detected Key
- View the detected key with confidence percentage
- Press OK to accept or manually select your desired key
- Key detection runs automatically but can be overridden

### Step 3: Preview Audio
1. Tap Play button to listen to the audio
2. Use the progress slider to jump to specific points
3. Tap Stop to end playback

### Step 4: Adjust Pitch
1. Select the original key (if different from detected)
2. Adjust using the slider or preset buttons
3. Watch the key transition display update in real-time
4. Target key shows what the song will sound like when transposed

### Step 5: Save Settings
1. Tap "Save Pitch Settings" button
2. Pitch shift information is saved with the audio file
3. Use external tools to actually process the audio

## Data Storage

### Local File Structure
```
DocumentDirectory/
  ├── audio-files/
  │   ├── audio-1704067200000.mp3
  │   ├── audio-1704067300000.wav
  │   └── .metadata.json
```

### Metadata Storage
Pitch shift information is stored in a `.metadata.json` file:
```json
{
  "audio-1704067200000": {
    "originalKey": "C",
    "targetKey": "D",
    "pitchShift": 2
  }
}
```

## Processing Workflow

### For Actual Audio Processing

The app provides pitch shift calculations but requires external tools for actual audio processing:

**Desktop Options:**
- **Audacity**: Free, open-source audio editor
  - Effect → Change Pitch
  - Supports semitone and frequency adjustments
  
- **GarageBand**: macOS/iOS native tool
  - Built-in pitch and time shift capabilities
  - Professional quality results

**Online Options:**
- Various web-based pitch shifters
- Cloud-based audio processing services
- Specialized music production tools

## Technical Details

### Key Detection Algorithm
The system uses autocorrelation-based pitch detection:
1. Audio buffer is analyzed for periodic patterns
2. Autocorrelation function finds repeating frequencies
3. Fundamental frequency is extracted
4. Frequency is mapped to nearest musical note
5. Confidence is calculated based on signal strength

### Audio Format Support
- MP3 (MPEG Audio)
- WAV (Waveform Audio)
- Other standard audio formats supported by device

### Storage Limitations
- Files stored in app document directory
- Subject to available device storage
- Can be managed through app or device file manager
- Private to the app (encrypted by OS)

## Dependencies

### New Packages Added
```json
{
  "expo-file-system": "Latest",
  "expo-media-library": "Latest",
  "react-native-progress": "Latest"
}
```

### Existing Packages Used
- `expo-av` - Audio playback
- `expo-document-picker` - File selection
- `@expo/vector-icons` - UI icons
- `react-native` - Core components

## Future Enhancements

Potential improvements for future versions:
1. Real-time audio waveform visualization
2. Key detection accuracy improvements with ML models
3. Built-in audio pitch shifting (with native modules)
4. Audio trimming and editing capabilities
5. Batch file processing
6. Audio file format conversion
7. Integration with cloud music services
8. Chord detection and progression analysis
9. Tempo detection and adjustment
10. Audio effects and EQ adjustments

## Troubleshooting

### Key Detection Not Accurate
- Ensure audio has clear pitched content
- Background noise may reduce accuracy
- Manually select the correct key if needed
- Monophonic audio (single note) works best

### Audio Playback Issues
- Check device volume settings
- Verify audio file format is supported
- Ensure sufficient device storage
- Restart app if playback stops

### File Storage Issues
- Clear app cache if running out of space
- Check device storage availability
- Delete unused audio files
- Use file manager to manage stored files

## Notes for Users

- Always verify detected keys before making adjustments
- Save pitch settings before closing the app
- Use recommended external tools for actual audio processing
- Consider audio quality when choosing processing tools
- Test with small portion of audio first
- Create backups of important audio files
