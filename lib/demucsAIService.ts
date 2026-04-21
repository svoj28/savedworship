import * as FileSystem from 'expo-file-system/legacy'

export interface Stem {
  name: 'vocals' | 'drums' | 'bass' | 'other' | 'piano'
  base64: string
  level: number // 0-100 for mixing
}

export interface StemSession {
  sessionId: string
  stems: Stem[]
  createdAt: number
}

export class DemucsAIService {
  private apiBaseUrl: string
  private usageCount: number = 0
  private usageLimit: number = Infinity // Unlimited
  private sessionStems: Map<string, Stem[]> = new Map()

  constructor(apiBaseUrl: string = 'http://192.168.18.21:3000') {
    this.apiBaseUrl = apiBaseUrl
    this.loadUsageCount()
  }

  /**
   * Load usage count from storage
   */
  private async loadUsageCount() {
    try {
      const data = await FileSystem.readAsStringAsync(
        `${FileSystem.documentDirectory}demucs-usage.json`
      )
      const usage = JSON.parse(data)
      const now = Date.now()
      // Reset count if more than 24 hours have passed
      if (now - usage.lastReset > 24 * 60 * 60 * 1000) {
        this.usageCount = 0
        this.saveUsageCount()
      } else {
        this.usageCount = usage.count || 0
      }
    } catch (err) {
      this.usageCount = 0
    }
  }

  /**
   * Save usage count to storage
   */
  private async saveUsageCount() {
    try {
      await FileSystem.writeAsStringAsync(
        `${FileSystem.documentDirectory}demucs-usage.json`,
        JSON.stringify({
          count: this.usageCount,
          lastReset: Date.now(),
        })
      )
    } catch (err) {
      console.error('Failed to save usage count:', err)
    }
  }

  /**
   * Check if user has free processes remaining
   * Always returns true (unlimited)
   */
  canUseFreeAI(): boolean {
    return true // Unlimited AI usage
  }

  /**
   * Get usage info
   */
  getUsageInfo() {
    return {
      used: this.usageCount,
      limit: Infinity,
      remaining: Infinity,
      isUnlimited: true,
    }
  }

  /**
   * Separate audio into stems using Demucs AI
   */
  async separateStems(
    audioUri: string,
    progressCallback?: (msg: string) => void
  ): Promise<StemSession | null> {
    try {
      if (!this.canUseFreeAI()) {
        throw new Error(
          `Free AI limit reached (${this.usageLimit} per day). Please try again tomorrow or use EQ-based removal.`
        )
      }

      progressCallback?.('📤 Uploading audio to AI server...')

      // Create FormData
      const formData = new FormData()
      formData.append('audio', {
        uri: audioUri,
        type: 'audio/mp4',
        name: 'audio.m4a',
      } as any)

      // Send to Demucs API
      const url = `${this.apiBaseUrl}/api/ai/separate-stems`
      console.log('🤖 Sending to Demucs AI:', url)


    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    })


      progressCallback?.('⏳ AI is separating stems (1-2 minutes)...')

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        throw new Error(error.error || `HTTP ${response.status}`)
      }

      progressCallback?.('📥 Receiving stem data...')

      const data = await response.json()
      console.log('✅ Stems received:', data.stemNames)

      // Convert stems to our format
      const stems: Stem[] = data.stemNames.map((name: string, idx: number) => ({
        name,
        base64: data.stems[name],
        level: 100, // Default: full volume for all stems
      }))

      // Store session
      const sessionId = data.sessionId
      this.sessionStems.set(sessionId, stems)

      // Increment usage
      this.usageCount++
      await this.saveUsageCount()

      progressCallback?.('✅ Stems separated successfully!')

      return {
        sessionId,
        stems,
        createdAt: Date.now(),
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'AI separation failed'
      console.error('❌ Demucs error:', msg)
      throw error
    }
  }

  /**
   * Mix stems back together with custom levels
   */
  async mixStems(sessionId: string, stems: Stem[]): Promise<string> {
    try {
      console.log('🎵 Mixing stems...')

      const progressStems = stems.map(s => ({
        name: s.name,
        base64: s.base64,
        level: s.level,
      }))

      const response = await fetch(`${this.apiBaseUrl}/api/ai/mix-stems`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          stems: progressStems,
          sessionId: sessionId,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        throw new Error(error.error || `HTTP ${response.status}`)
      }

      const data = await response.json()
      console.log('✅ Mixed audio received')

      // Save mixed audio to cache
      const fileName = `${data.filename}.m4a`
      const filePath = `${FileSystem.cacheDirectory}${fileName}`

      await FileSystem.writeAsStringAsync(filePath, data.audioBase64, {
        encoding: FileSystem.EncodingType.Base64,
      })

      console.log('💾 Mixed audio saved to:', filePath)
      return filePath
    } catch (error) {
      console.error('Error mixing stems:', error)
      throw error
    }
  }

  /**
   * Save stem to file
   */
  async saveStem(stem: Stem, sessionId: string): Promise<string> {
    try {
      const fileName = `${stem.name}-${sessionId}.wav`
      const filePath = `${FileSystem.cacheDirectory}${fileName}`

      await FileSystem.writeAsStringAsync(filePath, stem.base64, {
        encoding: FileSystem.EncodingType.Base64,
      })

      console.log(`✅ Saved ${stem.name} stem to:`, filePath)
      return filePath
    } catch (error) {
      console.error(`Error saving ${stem.name} stem:`, error)
      throw error
    }
  }

  /**
   * Get AI model info
   */
  async getModelInfo() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/ai/info`)
      return await response.json()
    } catch (error) {
      console.error('Error fetching model info:', error)
      return null
    }
  }

  /**
   * AI Pitch Shift using stem separation (preserves tempo)
   * Separates audio → shifts each stem → mixes back
   * Result: Clean pitch shift without tempo changes
   */
  async pitchShift(
    audioUri: string,
    semitones: number,
    progressCallback?: (msg: string) => void
  ): Promise<string> {
    try {
      if (!this.canUseFreeAI()) {
        throw new Error(
          `Free AI limit reached (${this.usageLimit} per day). Please try again tomorrow.`
        )
      }

      if (semitones < -12 || semitones > 12) {
        throw new Error('Semitones must be between -12 and 12')
      }

      progressCallback?.('📤 Uploading audio to AI pitch shifter...')

      const formData = new FormData()
      formData.append('audio', {
        uri: audioUri,
        type: 'audio/mp4',
        name: 'audio.m4a',
      } as any)
      formData.append('semitones', semitones.toString())

      const url = `${this.apiBaseUrl}/api/ai/pitch-shift`
      console.log('🎹 Sending to AI Pitch Shifter:', url)



const response = await fetch(url, {
  method: 'POST',
  body: formData,
})


      progressCallback?.('⏳ AI is shifting pitch (1-2 minutes)...')

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        const details = error.details ? ` - ${error.details}` : ''
        throw new Error(`${error.error || `HTTP ${response.status}`}${details}`)
      }

      progressCallback?.('📥 Receiving pitch-shifted audio...')

      const data = await response.json()
      if (!data.audioBase64) {
        throw new Error('Server returned invalid response: missing audioBase64')
      }
      console.log('✅ Pitch shift complete:', data.message)

      // Save to cache
      const fileName = `pitch-shifted-${semitones}-${Date.now()}.wav`
      const filePath = `${FileSystem.cacheDirectory}${fileName}`

      await FileSystem.writeAsStringAsync(filePath, data.audioBase64, {
        encoding: FileSystem.EncodingType.Base64,
      })

      console.log('💾 Pitch-shifted audio saved to:', filePath)

      // Increment usage
      this.usageCount++
      await this.saveUsageCount()

      progressCallback?.(`✅ Pitch shifted ${semitones > 0 ? '+' : ''}${semitones} semitones!`)

      return filePath
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Pitch shift failed'
      console.error('❌ AI Pitch Shift error:', msg)
      throw error
    }
  }
}

export default new DemucsAIService()
