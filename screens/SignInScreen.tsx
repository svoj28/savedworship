import React, { useState, useRef, useEffect } from 'react'
import {
  View,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Dimensions,
  Modal,
  Image
} from 'react-native'
import Svg, { Circle, Line, G, Ellipse } from 'react-native-svg'
import Ionicons from '@expo/vector-icons/Ionicons'
import { signInWithEmail, signInWithGoogle } from '../lib/auth'
import { supabase } from '../lib/supabase'

const { width, height } = Dimensions.get('window')

interface Props {
  onSignInSuccess: () => void
  onNavigateToSignUp: () => void
}

function Background() {
  return (
    <Svg
      width={width}
      height={height}
      style={StyleSheet.absoluteFillObject}
      pointerEvents="none"
    >
      <Circle cx={width + 20} cy={-20} r={160} fill="none" stroke="#DEDEDE" strokeWidth={1} />
      <Circle cx={width + 20} cy={-20} r={110} fill="none" stroke="#E8E8E8" strokeWidth={1} />
      <Circle cx={width + 20} cy={-20} r={60} fill="#F0F0F0" opacity={0.7} />
      <Circle cx={-40} cy={height + 30} r={180} fill="none" stroke="#E2E2E2" strokeWidth={1} />
      <Circle cx={-40} cy={height + 30} r={120} fill="none" stroke="#EBEBEB" strokeWidth={1} />
      <Circle cx={-40} cy={height + 30} r={65} fill="#ECECEC" opacity={0.6} />
      {[0, 1, 2, 3, 4].map(i => (
        <Line
          key={i}
          x1={0}
          y1={height - 80 + i * 12}
          x2={width * 0.55}
          y2={height - 80 + i * 12}
          stroke="#E0E0E0"
          strokeWidth={1}
        />
      ))}
      <Circle cx={width * 0.55 + 10} cy={height - 56} r={7} fill="#E0E0E0" />
      <Line
        x1={width * 0.55 + 17}
        y1={height - 56}
        x2={width * 0.55 + 17}
        y2={height - 95}
        stroke="#E0E0E0"
        strokeWidth={1.5}
      />
      {[...Array(4)].map((_, row) =>
        [...Array(4)].map((_, col) => (
          <Circle
            key={`${row}-${col}`}
            cx={24 + col * 18}
            cy={100 + row * 18}
            r={1.5}
            fill="#DADADA"
          />
        ))
      )}
    </Svg>
  )
}

const guideSections = [
  {
    title: 'Getting Started',
    items: [
      'Sign in or create an account to unlock sync, private notes, chat, and profile settings.',
      'Your drawer shows your profile, recipient ID, and QR code for sharing your account with other users.',
      'Use the tabs at the bottom to move between Chords, Notes, Manage, and Chat.',
    ],
  },
  {
    title: 'Chord Lists',
    items: [
      'Browse shared chord lists from the Chords tab.',
      'Open a song to view lyrics and chords together, or use transpose tools to shift the key.',
      'If you have permissions, you can add or edit songs from the chord list flow.',
    ],
  },
  {
    title: 'Notes and Private Lists',
    items: [
      'Use the Notes tab for personal chord lists that stay private to your account.',
      'Create, open, and manage note entries without exposing them to other users.',
    ],
  },
  {
    title: 'Tools',
    items: [
      'Metronome gives you BPM control and tap-tempo support for practice and rehearsal.',
      'Manual Transpose helps you shift chords quickly without editing the original song.',
      'Audio Tools groups extra playback and utility features in one place.',
    ],
  },
  {
    title: 'Chat and Management',
    items: [
      'Chat is for real-time messages and connection with other users.',
      'Manage is where app-level settings, administration, or workflow controls live.',
      'Edit Profile from the drawer to update your display name, bio, avatar, and instruments.',
    ],
  },
  {
    title: 'System Information',
    items: [
      'The app uses an offline-first local database so your content remains available even without network.',
      'Supabase handles authentication, cloud sync, and realtime updates when you are signed in.',
      'Changes are synchronized in the background so local edits reach the server and other devices.',
    ],
  },
  {
    title: 'Tips',
    items: [
      'If something does not update immediately, reopen the screen or wait for sync to complete.',
      'Use the drawer QR code and recipient ID when connecting with other members.',
      'Keep your profile information current so sharing and collaboration stay consistent.',
    ],
  },
]

const GUIDE_HEIGHT = Dimensions.get('window').height * 0.88

export default function SignInScreen({ onSignInSuccess, onNavigateToSignUp }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [showGuideModal, setShowGuideModal] = useState(false)

  // Forgot Password Modal state
  const [forgotModalVisible, setForgotModalVisible] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetEmailFocused, setResetEmailFocused] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetSent, setResetSent] = useState(false)

  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(24)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start()
  }, [])

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Fields', 'Please enter your email and password.')
      return
    }
    setLoading(true)
    const { user, error } = await signInWithEmail(email, password)
    setLoading(false)
    if (error) Alert.alert('Sign In Failed', error.message)
    else if (user) onSignInSuccess()
  }

  const handleGoogleSignIn = async () => {
    // Placeholder: Google Sign-In not yet fully integrated
    Alert.alert('Feature Coming Soon', 'Continue with Google will be available shortly.')
  }

  // ── Forgot Password ──────────────────────────────────────────────────────────

  const openForgotModal = () => {
    // Pre-fill with whatever email was already typed in the sign-in field
    setResetEmail(email.trim())
    setResetError('')
    setResetSent(false)
    setForgotModalVisible(true)
  }

  const closeForgotModal = () => {
    setForgotModalVisible(false)
  }

  const handleSendResetLink = async () => {
    const trimmed = resetEmail.trim()
    setResetError('')

    if (!trimmed) {
      setResetError('Please enter your email address.')
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmed)) {
      setResetError('Please enter a valid email address.')
      return
    }

    try {
      setResetLoading(true)
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'savedworship://reset-password',
      })

      if (error) {
        setResetError(error.message || 'Failed to send reset email. Please try again.')
        return
      }

      setResetSent(true)
    } catch (err) {
      console.error('Reset password error:', err)
      setResetError('An unexpected error occurred. Please try again.')
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F7F7" />
      <Background />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

            {/* Logo area */}
            <View style={styles.logoArea}>
              <View style={styles.logoBox}>
                <Image
                  source={require('../assets/SavedLOGOnobg.png')}
                  style={{ width: 160, height: 160, borderRadius: 10 }}
                  resizeMode="contain"
                />
              </View>
            </View>

            {/* Heading */}
            <Text style={styles.heading}>Welcome Aboard</Text>
            <Text style={styles.subheading}>Sign in to continue</Text>

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>EMAIL</Text>
              <View style={[styles.inputRow, emailFocused && styles.inputRowFocused]}>
                <Ionicons name="mail-outline" size={16} color={emailFocused ? '#111' : '#AAA'} style={styles.icon} />
                <TextInput
                  style={styles.input}
                  placeholder="your@email.com"
                  placeholderTextColor="#CCC"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  editable={!loading}
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>PASSWORD</Text>
              <View style={[styles.inputRow, passwordFocused && styles.inputRowFocused]}>
                <Ionicons name="lock-closed-outline" size={16} color={passwordFocused ? '#111' : '#AAA'} style={styles.icon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="••••••••"
                  placeholderTextColor="#CCC"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  editable={!loading}
                />
                <TouchableOpacity onPress={() => setShowPassword(p => !p)} style={styles.eyeBtn}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={16} color="#AAA" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Forgot password — now opens modal */}
            <TouchableOpacity style={styles.forgotRow} onPress={openForgotModal}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            {/* Sign In */}
            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.disabledBtn]}
              onPress={handleSignIn}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color="#F7F7F7" />
                : <Text style={styles.primaryBtnText}>Sign In</Text>
              }
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google */}
            <TouchableOpacity
              style={[styles.ghostBtn, loading && styles.disabledBtn]}
              onPress={handleGoogleSignIn}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Ionicons name="logo-google" size={16} color="#111" style={{ marginRight: 8 }} />
              <Text style={styles.ghostBtnText}>Continue with Google</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onNavigateToSignUp} style={styles.bottomLink}>
              <Text style={styles.bottomLinkText}>
                New here?{'  '}<Text style={styles.bottomLinkBold}>Create an account</Text>
              </Text>
            </TouchableOpacity>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Forgot Password Modal ────────────────────────────────────────────── */}
      <Modal
        visible={forgotModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeForgotModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContainer}>

            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reset Password</Text>
              <TouchableOpacity onPress={closeForgotModal} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={22} color="#555" />
              </TouchableOpacity>
            </View>

            {resetSent ? (
              // ── Success state ──────────────────────────────────────────────
              <View style={styles.successContainer}>
                <View style={styles.successIconCircle}>
                  <Ionicons name="checkmark" size={28} color="#111" />
                </View>
                <Text style={styles.successTitle}>Check your inbox</Text>
                <Text style={styles.successBody}>
                  We sent a password reset link to{'\n'}
                  <Text style={styles.successEmail}>{resetEmail.trim()}</Text>
                </Text>
                <Text style={styles.successHint}>
                  Didn't receive it? Check your spam folder or try again.
                </Text>
                <TouchableOpacity style={styles.modalPrimaryBtn} onPress={closeForgotModal}>
                  <Text style={styles.modalPrimaryBtnText}>Done</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.retryLink}
                  onPress={() => {
                    setResetSent(false)
                    setResetError('')
                  }}
                >
                  <Text style={styles.retryLinkText}>Send to a different email</Text>
                </TouchableOpacity>
              </View>
            ) : (
              // ── Input state ────────────────────────────────────────────────
              <>
                <Text style={styles.modalSubtitle}>
                  Enter the email linked to your account and we'll send you a reset link.
                </Text>

                <Text style={styles.modalFieldLabel}>EMAIL</Text>
                <View style={[styles.modalInputRow, resetEmailFocused && styles.modalInputRowFocused]}>
                  <Ionicons
                    name="mail-outline"
                    size={16}
                    color={resetEmailFocused ? '#111' : '#AAA'}
                    style={styles.icon}
                  />
                  <TextInput
                    style={styles.modalInput}
                    placeholder="your@email.com"
                    placeholderTextColor="#CCC"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={resetEmail}
                    onChangeText={text => {
                      setResetEmail(text)
                      setResetError('')
                    }}
                    onFocus={() => setResetEmailFocused(true)}
                    onBlur={() => setResetEmailFocused(false)}
                    editable={!resetLoading}
                  />
                </View>

                {/* Inline error */}
                {resetError ? (
                  <View style={styles.errorRow}>
                    <Ionicons name="alert-circle" size={14} color="#c0392b" />
                    <Text style={styles.errorText}>{resetError}</Text>
                  </View>
                ) : null}

                {/* Actions */}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={closeForgotModal}
                    disabled={resetLoading}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalPrimaryBtn, { flex: 2 }, resetLoading && styles.disabledBtn]}
                    onPress={handleSendResetLink}
                    disabled={resetLoading}
                  >
                    {resetLoading
                      ? <ActivityIndicator color="#F7F7F7" size="small" />
                      : <Text style={styles.modalPrimaryBtnText}>Send Reset Link</Text>
                    }
                  </TouchableOpacity>
                </View>
              </>
            )}

          </View>
        </KeyboardAvoidingView>
      </Modal>

{/* Floating Guide Button */}
<TouchableOpacity
  style={styles.guideFloatBtn}
  onPress={() => setShowGuideModal(true)}
  activeOpacity={0.75}
>
  <Ionicons name="information-circle-outline" size={22} color="#fff" />
</TouchableOpacity>

      {/* ── App Guide Modal ─────────────────────────────────────── */}
<Modal
  visible={showGuideModal}
  animationType="fade"
  transparent
  onRequestClose={() => setShowGuideModal(false)}
>
  <View style={styles.guideOverlay}>
    <TouchableOpacity
      style={StyleSheet.absoluteFillObject}
      onPress={() => setShowGuideModal(false)}
      activeOpacity={1}
    />
    <View style={styles.guideContent}>
      <View style={styles.guideHeader}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.guideEyebrow}>App Guide</Text>
          <Text style={styles.guideTitle}>How Saved Worship Works</Text>
        </View>
        <TouchableOpacity onPress={() => setShowGuideModal(false)} style={{ padding: 4 }}>
          <Ionicons name="close" size={24} color="#333" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flexShrink: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.guideBody}
      >
        <Text style={styles.guideIntro}>
          Saved Worship is a worship music workspace for chord lists, lyrics, notes, sync,
          and communication. Use this guide to understand the main screens and the system
          behind them.
        </Text>

        {guideSections.map((section) => (
          <View key={section.title} style={styles.guideSectionCard}>
            <Text style={styles.guideSectionTitle}>{section.title}</Text>
            {section.items.map((item) => (
              <View key={item} style={styles.guideBulletRow}>
                <View style={styles.guideBulletDot} />
                <Text style={styles.guideBulletText}>{item}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.guideFooterCard}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
          <Text style={styles.guideFooterText}>
            Your content works offline first, then syncs when the connection is available.
          </Text>
        </View>
      </ScrollView>
    </View>
  </View>
</Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F7F7' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 60 },
  content: { paddingHorizontal: 28 },

  // ── Guide Modal ────────────────────────────────────────────
guideFloatBtn: {
  position: 'absolute',
  bottom: 32,
  right: 24,
  width: 40,
  height: 40,
  borderRadius: 24,
  backgroundColor: '#111',
  justifyContent: 'center',
  alignItems: 'center',
  elevation: 6,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.2,
  shadowRadius: 6,
  zIndex: 99,
},
guideOverlay: {
  flex: 1,
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: 'rgba(0,0,0,0.45)',
  paddingHorizontal: 16,
},
guideContent: {
  width: '100%',
  maxWidth: 420,
  height: GUIDE_HEIGHT,
  backgroundColor: '#fff',
  borderRadius: 18,
  overflow: 'hidden',
  elevation: 10,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.25,
  shadowRadius: 8,
},
guideHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  paddingHorizontal: 20,
  paddingTop: 18,
  paddingBottom: 14,
  borderBottomWidth: 1,
  borderBottomColor: '#f0f0f0',
},
guideEyebrow: {
  fontSize: 9,
  letterSpacing: 2.2,
  textTransform: 'uppercase',
  color: '#888',
  marginBottom: 4,
  fontWeight: '700',
},
guideTitle: {
  fontSize: 18,
  fontWeight: '800',
  color: '#111',
  letterSpacing: 0.2,
},
guideBody: {
  paddingHorizontal: 20,
  paddingVertical: 18,
  paddingBottom: 28,
  gap: 12,
},
guideIntro: {
  fontSize: 13,
  lineHeight: 20,
  color: '#555',
  marginBottom: 4,
},
guideSectionCard: {
  backgroundColor: '#fafafa',
  borderRadius: 14,
  borderWidth: 1,
  borderColor: '#ececec',
  padding: 16,
  gap: 10,
},
guideSectionTitle: {
  fontSize: 14,
  fontWeight: '800',
  color: '#111',
  letterSpacing: 0.15,
},
guideBulletRow: {
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: 10,
},
guideBulletDot: {
  width: 6,
  height: 6,
  borderRadius: 3,
  backgroundColor: '#111',
  marginTop: 7,
},
guideBulletText: {
  flex: 1,
  fontSize: 13,
  lineHeight: 19,
  color: '#444',
},
guideFooterCard: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
  backgroundColor: '#111',
  borderRadius: 14,
  padding: 16,
},
guideFooterText: {
  flex: 1,
  fontSize: 12,
  lineHeight: 18,
  color: '#fff',
},

  logoArea: { alignItems: 'center', marginBottom: 40 },
  logoBox: {
    width: 60, height: 60, borderRadius: 18,
    
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
  },
  appName: { fontSize: 20, fontWeight: '700', color: '#111', letterSpacing: 0.5 },
  appSub: { fontSize: 10, color: '#ADADAD', letterSpacing: 3.5, marginTop: 3 },

  heading: { fontSize: 26, fontWeight: '700', color: '#111', marginBottom: 4 },
  subheading: { fontSize: 14, color: '#ADADAD', marginBottom: 32 },

  fieldGroup: { marginBottom: 20 },
  label: { fontSize: 10, fontWeight: '700', color: '#C0C0C0', letterSpacing: 1.5, marginBottom: 8 },

  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#EFEFEF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 14,
  },
  inputRowFocused: {
    borderColor: '#111',
    backgroundColor: '#FFF',
  },
  icon: { marginRight: 10 },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#111',
  },
  eyeBtn: { padding: 4 },

  forgotRow: { alignItems: 'flex-end', marginBottom: 28, marginTop: -8 },
  forgotText: { fontSize: 13, color: '#555', fontWeight: '500' },

  primaryBtn: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 20,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#F7F7F7', letterSpacing: 0.3 },
  disabledBtn: { opacity: 0.4 },

  divider: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E5E5E5' },
  dividerText: { fontSize: 12, color: '#CCC', marginHorizontal: 12 },

  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    backgroundColor: '#FFF',
    marginBottom: 36,
  },
  ghostBtnText: { fontSize: 14, fontWeight: '600', color: '#111' },

  bottomLink: { alignItems: 'center' },
  bottomLinkText: { fontSize: 14, color: '#ADADAD' },
  bottomLinkBold: { color: '#111', fontWeight: '700' },

  // ── Modal ──────────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.40)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: Platform.OS === 'ios' ? 38 : 26,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111',
    letterSpacing: 0.2,
  },
  modalCloseBtn: { padding: 4 },
  modalSubtitle: {
    fontSize: 13,
    color: '#ADADAD',
    lineHeight: 19,
    marginBottom: 22,
  },
  modalFieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#C0C0C0',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  modalInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFEFEF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  modalInputRowFocused: {
    borderColor: '#111',
    backgroundColor: '#FFF',
  },
  modalInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#111',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fdf2f2',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f5c6c6',
  },
  errorText: {
    fontSize: 13,
    color: '#c0392b',
    fontWeight: '500',
    flex: 1,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  modalPrimaryBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F7F7F7',
    letterSpacing: 0.2,
    paddingHorizontal: 12,
  },

  // ── Success state ──────────────────────────────────────────────────────────
  successContainer: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingBottom: 6,
  },
  successIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EBEBEB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  successBody: {
    fontSize: 14,
    color: '#ADADAD',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 10,
  },
  successEmail: {
    color: '#111',
    fontWeight: '700',
  },
  successHint: {
    fontSize: 12,
    color: '#C0C0C0',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 18,
  },
  retryLink: {
    marginTop: 14,
  },
  retryLinkText: {
    fontSize: 13,
    color: '#888',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
})