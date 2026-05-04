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
} from 'react-native'
import Svg, { Circle, Line, G, Ellipse } from 'react-native-svg'
import Ionicons from '@expo/vector-icons/Ionicons'
import { signInWithEmail, signInWithGoogle } from '../lib/auth'

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
      {/* Top-right large circle */}
      <Circle cx={width + 20} cy={-20} r={160} fill="none" stroke="#DEDEDE" strokeWidth={1} />
      <Circle cx={width + 20} cy={-20} r={110} fill="none" stroke="#E8E8E8" strokeWidth={1} />
      <Circle cx={width + 20} cy={-20} r={60} fill="#F0F0F0" opacity={0.7} />

      {/* Bottom-left large circle */}
      <Circle cx={-40} cy={height + 30} r={180} fill="none" stroke="#E2E2E2" strokeWidth={1} />
      <Circle cx={-40} cy={height + 30} r={120} fill="none" stroke="#EBEBEB" strokeWidth={1} />
      <Circle cx={-40} cy={height + 30} r={65} fill="#ECECEC" opacity={0.6} />

      {/* Music staff lines — bottom section */}
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

      {/* Music note dot — small decorative */}
      <Circle cx={width * 0.55 + 10} cy={height - 56} r={7} fill="#E0E0E0" />
      <Line
        x1={width * 0.55 + 17}
        y1={height - 56}
        x2={width * 0.55 + 17}
        y2={height - 95}
        stroke="#E0E0E0"
        strokeWidth={1.5}
      />

      {/* Subtle dot grid — top left area */}
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

export default function SignInScreen({ onSignInSuccess, onNavigateToSignUp }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)

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
    if (error)       Alert.alert('Sign In Failed', error.message)
    else if (user)       onSignInSuccess()
      }

  const handleGoogleSignIn = async () => {
    setLoading(true)
    const { error } = await signInWithGoogle()
    setLoading(false)
    if (error) Alert.alert('Google Sign In Failed', error.message)
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
                <Ionicons name="musical-notes" size={28} color="#111" />
              </View>
              <Text style={styles.appName}>S A V E D  W O R S H I P</Text>
              <Text style={styles.appSub}>MUSIC TOOL</Text>
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
          <TouchableOpacity             onPress={() => setShowPassword(p => !p)} style={styles.eyeBtn}          >
            <Ionicons               name={showPassword ? 'eye-off-outline' : 'eye-outline'}               size={16}               color="#AAA"             />
          </TouchableOpacity>
        </View>
</View>

            <TouchableOpacity style={styles.forgotRow}>
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
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F7F7' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 60 },
  content: { paddingHorizontal: 28 },

  logoArea: { alignItems: 'center', marginBottom: 40 },
  logoBox: {
    width: 60, height: 60, borderRadius: 18,
    backgroundColor: '#EBEBEB',
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
})