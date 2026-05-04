import React, { useState } from 'react'
import {
  View,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { signInWithEmail, signInWithGoogle } from '../lib/auth'

interface Props {
  onSignInSuccess: () => void
  onNavigateToSignUp: () => void
}

export default function SignInScreen({ onSignInSuccess, onNavigateToSignUp }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter email and password')
      return
    }

    setLoading(true)
    const { user, error } = await signInWithEmail(email, password)
    setLoading(false)

    if (error) {
      Alert.alert('Sign In Failed', error.message)
    } else if (user) {
      onSignInSuccess()
    }
  }

  const handleGoogleSignIn = async () => {
    setLoading(true)
    const { error } = await signInWithGoogle()
    setLoading(false)
    if (error) Alert.alert('Google Sign In Failed', error.message)
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Sign In</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#999"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          editable={!loading}
        />

        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Password"
            placeholderTextColor="#999"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            editable={!loading}
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowPassword(prev => !prev)}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color="#999"
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.button, styles.primaryButton, loading && styles.disabledButton]}
          onPress={handleSignIn}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
        </TouchableOpacity>

        {Platform.OS !== 'web' && (
          <TouchableOpacity
            style={[styles.button, styles.googleButton, loading && styles.disabledButton]}
            onPress={handleGoogleSignIn}
            disabled={loading}
          >
            <Text style={styles.googleButtonText}>Sign In with Google</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={onNavigateToSignUp}>
          <Text style={styles.link}>Don't have an account? Sign Up</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, justifyContent: 'center', minHeight: '100%' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 30, textAlign: 'center', color: '#333' },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 12, marginBottom: 15, fontSize: 16, color: '#333',
  },
  passwordContainer: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    marginBottom: 15,
  },
  passwordInput: { flex: 1, padding: 12, fontSize: 16, color: '#333' },
  eyeButton: { padding: 12 },
  button: { paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 15 },
  primaryButton: { backgroundColor: '#007AFF' },
  googleButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  disabledButton: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  googleButtonText: { color: '#333', fontSize: 16, fontWeight: 'bold' },
  link: { color: '#007AFF', textAlign: 'center', fontSize: 14 },
})