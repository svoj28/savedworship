import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  Switch,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import * as ImagePicker from 'expo-image-picker'
import { getCurrentUser } from '../lib/auth'
import { getUserProfileByUserId, createUserProfile, updateUserProfile } from '../db/queries'
import { UserProfile } from '../db/models'
import { uploadAvatar } from '../lib/uploadAvatar'

const ROLES = [
  'Vocals',
  'Drums',
  'Keyboard',
  'Bass',
  'Electric Guitar',
  'Acoustic Guitar',
  'Song Leader',
]

interface FormData {
  nickname: string
  bio: string
  avatarUrl: string
  roles: string
  isPrivate: boolean
}

export default function EditAccountScreen() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<FormData>({
    nickname: '',
    bio: '',
    avatarUrl: '',
    roles: '',
    isPrivate: false,
  })

  useEffect(() => {
    loadUserProfile()
  }, [])

  const loadUserProfile = async () => {
    try {
      setLoading(true)
      const currentUser = await getCurrentUser()
      if (currentUser) {
        setUser(currentUser)
        const userProfile = await getUserProfileByUserId(currentUser.id)
        if (userProfile) {
          setProfile(userProfile)
          const rawBio = userProfile.bio || ''
          const isPrivate = rawBio.startsWith('[private]')
          const cleanBio = rawBio.replace('[private]', '').trim()
          setFormData({
            nickname: userProfile.nickname || '',
            bio: cleanBio,
            avatarUrl: userProfile.avatarUrl || '',
            roles: userProfile.instruments || '',
            isPrivate,
          })
        } else {
          const newProfile = await createUserProfile({
            userId: currentUser.id,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            synced: false,
          })
          setProfile(newProfile)
        }
      }
    } catch (err) {
      console.error('Error loading profile:', err)
      Alert.alert('Error', 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!user) return
    try {
      setSaving(true)
      // Prepend [private] marker to bio if privacy is on
      const bioToSave = formData.isPrivate
        ? `[private]${formData.bio}`
        : formData.bio

      await updateUserProfile(user.id, {
        nickname: formData.nickname,
        bio: bioToSave,
        avatarUrl: formData.avatarUrl,
        instruments: formData.roles,
        updatedAt: Date.now(),
        synced: false,
      })
      Alert.alert('Success', 'Profile updated successfully')
    } catch (err) {
      console.error('Error saving profile:', err)
      Alert.alert('Error', 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  const handlePickImage = async () => {
    if (!user) return
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      })

      if (!result.canceled && result.assets[0]) {
        const localUri = result.assets[0].uri
        setSaving(true)
        const publicUrl = await uploadAvatar(user.id, localUri)
        if (publicUrl) {
          await updateUserProfile(user.id, { avatarUrl: publicUrl })
          setFormData({ ...formData, avatarUrl: publicUrl })
        } else {
          Alert.alert('Error', 'Failed to upload avatar')
        }
        setSaving(false)
      }
    } catch (err) {
      console.error('Error picking image:', err)
      Alert.alert('Error', 'Failed to pick image')
      setSaving(false)
    }
  }

  const handleChangePassword = () => {
    Alert.alert(
      'Change Password',
      'Password change functionality would require backend implementation.\n\nFor now, use Supabase dashboard or implement via auth flow.'
    )
  }

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all data. This action cannot be undone.',
      [
        { text: 'Cancel' },
        {
          text: 'Delete',
          onPress: () => {
            Alert.alert('Confirm Delete', 'Type your email to confirm deletion:', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete My Account',
                onPress: () => {
                  Alert.alert(
                    'Account Deletion',
                    'Account deletion would require backend implementation.\n\nPlease contact support to delete your account.'
                  )
                },
                style: 'destructive',
              },
            ])
          },
          style: 'destructive',
        },
      ]
    )
  }

  const toggleInstrument = (instrument: string) => {
    const instruments = formData.roles.split(',').map(i => i.trim()).filter(i => i)
    if (instruments.includes(instrument)) {
      setFormData({ ...formData, roles: instruments.filter(i => i !== instrument).join(', ') })
    } else {
      setFormData({ ...formData, roles: [...instruments, instrument].join(', ') })
    }
  }

  const selectedInstruments = formData.roles.split(',').map(i => i.trim()).filter(i => i)

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Avatar Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile Picture</Text>
        <View style={styles.avatarPreviewContainer}>
          {formData.avatarUrl ? (
            <Image source={{ uri: formData.avatarUrl }} style={styles.avatarPreview} />
          ) : (
            <View style={[styles.avatarPreview, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={64} color="#ccc" />
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.uploadButton} onPress={handlePickImage}>
          <Ionicons name="image" size={20} color="#fff" />
          <Text style={styles.uploadButtonText}>Choose Photo</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>Tap to select an image from your device</Text>
      </View>

      {/* Nickname Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Nickname</Text>
        <TextInput
          style={styles.input}
          placeholder="Your nickname"
          value={formData.nickname}
          onChangeText={text => setFormData({ ...formData, nickname: text })}
          maxLength={30}
        />
        <Text style={styles.hint}>{formData.nickname.length}/30 characters</Text>
      </View>

      {/* Bio Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Bio</Text>
        <TextInput
          style={[styles.input, styles.bioInput]}
          placeholder="Tell others about yourself..."
          value={formData.bio}
          onChangeText={text => setFormData({ ...formData, bio: text })}
          multiline
          numberOfLines={4}
          maxLength={200}
        />
        <Text style={styles.hint}>{formData.bio.length}/200 characters</Text>
      </View>

      {/* Roles Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Roles</Text>
        <Text style={styles.hint}>Select all roles you have in your worship team</Text>
        <View style={styles.instrumentsGrid}>
          {ROLES.map(role => (
            <TouchableOpacity
              key={role}
              style={[
                styles.instrumentButton,
                selectedInstruments.includes(role) && styles.instrumentButtonActive,
              ]}
              onPress={() => toggleInstrument(role)}
            >
              <Text
                style={[
                  styles.instrumentButtonText,
                  selectedInstruments.includes(role) && styles.instrumentButtonTextActive,
                ]}
              >
                {role}
              </Text>
              {selectedInstruments.includes(role) && (
                <Ionicons name="checkmark" size={16} color="#fff" style={styles.instrumentCheck} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Privacy Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacy</Text>
        <View style={styles.privacyRow}>
          <View style={styles.privacyInfo}>
            <View style={styles.privacyLabelRow}>
              <Ionicons
                name={formData.isPrivate ? 'lock-closed' : 'lock-open'}
                size={18}
                color={formData.isPrivate ? '#FF9500' : '#34C759'}
              />
              <Text style={styles.privacyLabel}>
                {formData.isPrivate ? 'Private Profile' : 'Public Profile'}
              </Text>
            </View>
            <Text style={styles.privacyDescription}>
              {formData.isPrivate
                ? 'Only your name and photo are visible to others. Bio and roles are hidden.'
                : 'Your full profile (bio, roles) is visible to everyone in the community.'}
            </Text>
          </View>
          <Switch
            value={formData.isPrivate}
            onValueChange={val => setFormData({ ...formData, isPrivate: val })}
            trackColor={{ false: '#E0E0E0', true: '#FFD580' }}
            thumbColor={formData.isPrivate ? '#FF9500' : '#FFF'}
          />
        </View>

        {/* Visual preview */}
        <View style={styles.privacyPreview}>
          <Text style={styles.privacyPreviewLabel}>What others see:</Text>
          <View style={styles.privacyPreviewCard}>
            <View style={styles.privacyPreviewAvatar}>
              {formData.avatarUrl ? (
                <Image source={{ uri: formData.avatarUrl }} style={styles.privacyPreviewImg} />
              ) : (
                <View style={[styles.privacyPreviewImg, styles.privacyPreviewAvatarFallback]}>
                  <Ionicons name="person" size={22} color="#BBB" />
                </View>
              )}
            </View>
            <View style={styles.privacyPreviewText}>
              <Text style={styles.privacyPreviewName}>
                {formData.nickname || 'Your Name'}
              </Text>
              {formData.isPrivate ? (
                <View style={styles.privacyHiddenBadge}>
                  <Ionicons name="lock-closed" size={10} color="#888" />
                  <Text style={styles.privacyHiddenText}>Profile hidden</Text>
                </View>
              ) : (
                <>
                  {formData.bio ? (
                    <Text style={styles.privacyPreviewBio} numberOfLines={2}>
                      {formData.bio}
                    </Text>
                  ) : null}
                  {selectedInstruments.length > 0 && (
                    <Text style={styles.privacyPreviewRoles} numberOfLines={1}>
                      {selectedInstruments.join(' · ')}
                    </Text>
                  )}
                </>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.primaryButton, saving && styles.disabledButton]}
        onPress={handleSaveProfile}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="save" size={20} color="#fff" />
            <Text style={styles.primaryButtonText}>Save Profile</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Account Actions Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <TouchableOpacity style={styles.actionButton} onPress={handleChangePassword}>
          <Ionicons name="lock-closed" size={20} color="#007AFF" />
          <Text style={styles.actionButtonText}>Change Password</Text>
          <Ionicons name="chevron-forward" size={20} color="#ccc" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleDeleteAccount}>
          <Ionicons name="trash" size={20} color="#f44" />
          <Text style={[styles.actionButtonText, styles.deleteText]}>Delete Account</Text>
          <Ionicons name="chevron-forward" size={20} color="#ccc" />
        </TouchableOpacity>
      </View>

      {/* Account Info */}
      <View style={styles.infoSection}>
        <Text style={styles.infoLabel}>Email:</Text>
        <Text style={styles.infoValue}>{user?.email}</Text>
      </View>

      <View style={styles.spacer} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  section: {
    backgroundColor: '#fff',
    marginVertical: 8,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    backgroundColor: '#f9f9f9',
    marginBottom: 8,
  },
  bioInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
  },
  avatarPreviewContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarPreview: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#f0f0f0',
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    marginBottom: 8,
    gap: 8,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  instrumentsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  instrumentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#007AFF',
    backgroundColor: '#fff',
  },
  instrumentButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  instrumentButtonText: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '500',
  },
  instrumentButtonTextActive: {
    color: '#fff',
  },
  instrumentCheck: {
    marginLeft: 6,
  },
  // Privacy styles
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  privacyInfo: {
    flex: 1,
  },
  privacyLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  privacyLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  privacyDescription: {
    fontSize: 12,
    color: '#888',
    lineHeight: 17,
  },
  privacyPreview: {
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EBEBEB',
  },
  privacyPreviewLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#AAA',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  privacyPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  privacyPreviewAvatar: {},
  privacyPreviewImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  privacyPreviewAvatarFallback: {
    backgroundColor: '#E8E8E8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  privacyPreviewText: {
    flex: 1,
  },
  privacyPreviewName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#222',
    marginBottom: 3,
  },
  privacyPreviewBio: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
    marginBottom: 3,
  },
  privacyPreviewRoles: {
    fontSize: 11,
    color: '#007AFF',
    fontWeight: '600',
  },
  privacyHiddenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEEEEE',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  privacyHiddenText: {
    fontSize: 11,
    color: '#888',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginVertical: 16,
    gap: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginBottom: 8,
    gap: 12,
  },
  actionButtonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
  deleteText: {
    color: '#f44',
  },
  infoSection: {
    backgroundColor: '#fff',
    marginVertical: 8,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
  },
  infoLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  spacer: {
    height: 40,
  },
})