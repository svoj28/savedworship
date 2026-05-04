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
import Svg, { Circle, Line } from 'react-native-svg'
import Ionicons from '@expo/vector-icons/Ionicons'
import { signUpWithEmail } from '../lib/auth'

const { width, height } = Dimensions.get('window')

interface Props {
  onSignUpSuccess: () => void
  onNavigateToSignIn: () => void
}

interface FieldConfig {
  key: string
  label: string
  placeholder: string
  icon: keyof typeof Ionicons.glyphMap
  secure?: boolean
  keyboard?: 'default' | 'email-address'
  autoCapitalize?: 'none' | 'words'
}

const FIELDS: FieldConfig[] = [
  { key: 'displayName', label: 'DISPLAY NAME', placeholder: 'Your name', icon: 'person-outline', autoCapitalize: 'words' },
  { key: 'email', label: 'EMAIL', placeholder: 'your@email.com', icon: 'mail-outline', keyboard: 'email-address', autoCapitalize: 'none' },
  { key: 'password', label: 'PASSWORD', placeholder: '•••••••• (min. 6 chars)', icon: 'lock-closed-outline', secure: true, autoCapitalize: 'none' },
  { key: 'confirmPassword', label: 'CONFIRM PASSWORD', placeholder: '••••••••', icon: 'shield-checkmark-outline', secure: true, autoCapitalize: 'none' },
]

function Background() {
  return (
    <Svg
      width={width}
      height={height}
      style={StyleSheet.absoluteFillObject}
      pointerEvents="none"
    >
      {/* Top-left arc */}
      <Circle cx={-30} cy={-30} r={170} fill="none" stroke="#E2E2E2" strokeWidth={1} />
      <Circle cx={-30} cy={-30} r={115} fill="none" stroke="#EBEBEB" strokeWidth={1} />
      <Circle cx={-30} cy={-30} r={62} fill="#ECECEC" opacity={0.6} />

      {/* Bottom-right arc */}
      <Circle cx={width + 30} cy={height + 30} r={200} fill="none" stroke="#DEDEDE" strokeWidth={1} />
      <Circle cx={width + 30} cy={height + 30} r={140} fill="none" stroke="#E8E8E8" strokeWidth={1} />
      <Circle cx={width + 30} cy={height + 30} r={78} fill="#F0F0F0" opacity={0.65} />

      {/* Staff lines — top right */}
      {[0, 1, 2, 3, 4].map(i => (
        <Line
          key={i}
          x1={width * 0.45}
          y1={60 + i * 12}
          x2={width}
          y2={60 + i * 12}
          stroke="#E0E0E0"
          strokeWidth={1}
        />
      ))}

      {/* Music note — top right */}
      <Circle cx={width * 0.45 - 10} cy={84} r={7} fill="#E0E0E0" />
      <Line
        x1={width * 0.45 - 3}
        y1={84}
        x2={width * 0.45 - 3}
        y2={45}
        stroke="#E0E0E0"
        strokeWidth={1.5}
      />

      {/* Dot grid — bottom left */}
      {[...Array(4)].map((_, row) =>
        [...Array(4)].map((_, col) => (
          <Circle
            key={`${row}-${col}`}
            cx={24 + col * 18}
            cy={height - 110 + row * 18}
            r={1.5}
            fill="#DADADA"
          />
        ))
      )}
    </Svg>
  )
}

export default function SignUpScreen({ onSignUpSuccess, onNavigateToSignIn }: Props) {
  const [values, setValues] = useState({ displayName: '', email: '', password: '', confirmPassword: '' })
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
const [focused, setFocused] = useState<string | null>(null)

  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(24)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start()
  }, [])

  const handleChange = (key: string, val: string) =>
    setValues(prev => ({ ...prev, [key]: val }))

  const handleSignUp = async () => {
const { displayName, email, password, confirmPassword } = values
    if (!displayName.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Missing Fields', 'Please fill in all fields.')
      return
    }
    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Your passwords do not match.')
      return
    }
    if (password.length < 6) {
      Alert.alert('Password Too Short', 'Password must be at least 6 characters.')
      return
    }
    setLoading(true)
    const { user, error } = await signUpWithEmail(email, password, displayName)
    setLoading(false)
    if (error)       Alert.alert('Sign Up Failed', error.message)
    else if (user) {
      Alert.alert(
                'Account Created',
        'Please check your email to verify your account.',
        [{ text: 'OK', onPress: onSignUpSuccess }]
      )
    }
  }

  const isSecure = (key: string) => {
    if (key === 'password') return !showPassword
    if (key === 'confirmPassword') return !showConfirmPassword
    return false
  }

  const toggleSecure = (key: string) => {
    if (key === 'password') setShowPassword(p => !p)
    if (key === 'confirmPassword') setShowConfirmPassword(p => !p)
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

            {/* Header row */}
            <View style={styles.headerRow}>
          <TouchableOpacity onPress={onNavigateToSignIn} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons               name="arrow-back"               size={18}               color="#111"             />
          </TouchableOpacity>
<View style={styles.logoBoxSmall}>
                <Ionicons name="musical-notes" size={18} color="#111" />
              </View>
        </View>

        {/* Heading */}
            <Text style={styles.heading}>Create account</Text>
            <Text style={styles.subheading}>Fill the inputs below</Text>

            {/* Fields */}
            <View style={styles.fieldsCard}>
              {FIELDS.map((field, idx) => (
                <View key={field.key} style={[styles.fieldGroup, idx < FIELDS.length - 1 && styles.fieldBorder]}>
                  <Text style={styles.label}>{field.label}</Text>
                  <View style={[styles.inputRow, focused === field.key && styles.inputRowFocused]}>
                    <Ionicons
                      name={field.icon}
                      size={16}
                      color={focused === field.key ? '#111' : '#AAA'}
                      style={styles.icon}
                    />
          <TextInput
            style={[styles.input, field.secure && { flex: 1 }]}
            placeholder={field.placeholder}
            placeholderTextColor="#CCC"
                      keyboardType={field.keyboard || 'default'}
                      autoCapitalize={field.autoCapitalize || 'none'}
                      secureTextEntry={field.secure ? isSecure(field.key) : false}
            value={values[field.key as keyof typeof values]}
            onChangeText={val => handleChange(field.key, val)}
                      onFocus={() => setFocused(field.key)}
                      onBlur={() => setFocused(null)}
            editable={!loading}
          />
{field.secure && (
          <TouchableOpacity onPress={() => toggleSecure(field.key)}             style={styles.eyeBtn}          >
            <Ionicons
              name={isSecure(field.key) ? 'eye-outline' : 'eye-off-outline'}
              size={16}
              color="#AAA"
            />
          </TouchableOpacity>
)}
                  </View>
                </View>
              ))}
        </View>

<Text style={styles.terms}>
              By signing up, you agree to our Terms of Service and Privacy Policy.
            </Text>

            {/* Sign Up */}
        <TouchableOpacity
          style={[styles.primaryBtn, loading && styles.disabledBtn]}
          onPress={handleSignUp}
          disabled={loading}
activeOpacity={0.8}
        >
          {loading
? <ActivityIndicator color="#F7F7F7" />
: <Text style={styles.primaryBtnText}>Create Account</Text>
}
        </TouchableOpacity>

        <TouchableOpacity onPress={onNavigateToSignIn} style={styles.bottomLink}>
          <Text style={styles.bottomLinkText}>
Already have an account?{'  '}<Text style={styles.bottomLinkBold}>Sign In</Text>
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
  scrollContent: { flexGrow: 1, paddingVertical: 56 },
  content: { paddingHorizontal: 28 },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#EBEBEB',
    justifyContent: 'center', alignItems: 'center',
  },
  logoBoxSmall: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#EBEBEB',
    justifyContent: 'center', alignItems: 'center',
  },

  heading: { fontSize: 26, fontWeight: '700', color: '#111', marginBottom: 4 },
  subheading: { fontSize: 14, color: '#ADADAD', marginBottom: 28 },

  fieldsCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EBEBEB',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  fieldGroup: { paddingVertical: 16 },
  fieldBorder: { borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  label: { fontSize: 10, fontWeight: '700', color: '#C0C0C0', letterSpacing: 1.5, marginBottom: 8 },

  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F7F7F7',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 12,
  },
  inputRowFocused: {
    borderColor: '#111',
    backgroundColor: '#FFF',
  },
  icon: { marginRight: 8 },
  input: {
flex: 1,
    paddingVertical: 12,
fontSize: 15,
color: '#111',
},
  eyeBtn: { padding: 4 },

  terms: {
    fontSize: 12,
    color: '#C0C0C0',
    lineHeight: 18,
    marginBottom: 24,
  },

  primaryBtn: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 15,
alignItems: 'center',
marginBottom: 20,
},
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#F7F7F7', letterSpacing: 0.3 },
  disabledBtn: { opacity: 0.4 },
  
  bottomLink: { alignItems: 'center' },
  bottomLinkText: { fontSize: 14, color: '#ADADAD' },
  bottomLinkBold: { color: '#111', fontWeight: '700' },
})