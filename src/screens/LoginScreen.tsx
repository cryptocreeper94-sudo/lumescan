import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator,
  ScrollView,
} from 'react-native';
import { ActivitySquare, ShieldCheck, AlertCircle, UserPlus, LogIn } from 'lucide-react-native';
import { COLORS } from '../theme/colors';
import { signInWithEmail, registerWithEmail, signInWithGoogleCredential } from '../config/firebase';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // ── Google SSO via expo-auth-session ──
  const [_request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: '41307406912-f8ofdal9haaa8r468ts48vvimdvfs04i.apps.googleusercontent.com',
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      setLoading(true);
      setError(null);
      signInWithGoogleCredential(id_token)
        .catch((err: any) => {
          const msg = err?.message || 'Google sign-in failed.';
          if (msg.includes('Access restricted')) {
            setError('Access restricted to authorized email addresses.');
          } else {
            setError('Google sign-in failed. Please try again.');
          }
        })
        .finally(() => setLoading(false));
    }
  }, [response]);

  const handleSubmit = async () => {
    if (!email || !password) {
      setError("Email and Password are required");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (mode === 'register') {
        await registerWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
      // onAuthStateChanged in App.tsx will navigate away on success
    } catch (err: any) {
      const msg: string = err?.message || 'Authentication failed.';
      // Clean up Firebase error codes
      if (msg.includes('wrong-password') || msg.includes('invalid-credential')) {
        setError('Invalid email or password.');
      } else if (msg.includes('email-already-in-use')) {
        setError('This email is already registered. Try signing in.');
      } else if (msg.includes('weak-password')) {
        setError('Password must be at least 6 characters.');
      } else if (msg.includes('invalid-email')) {
        setError('Please enter a valid email address.');
      } else if (msg.includes('user-not-found')) {
        setError('No account found. Register below.');
      } else if (msg.includes('Access restricted')) {
        setError('Access restricted to authorized email addresses.');
      } else if (msg.includes('invalid-api-key')) {
        setError('Firebase API Key is missing. Please update config.');
      } else {
        setError(msg.replace('Firebase: ', '').replace(/\(auth\/.*\)/, '').trim());
      }
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>

            {/* Logo Header */}
            <View style={styles.logoContainer}>
              <View style={styles.iconWrapper}>
                <ActivitySquare size={48} color={COLORS.cyan} />
              </View>
              <Text style={styles.title}>LUME<Text style={styles.titleSub}>AUTO</Text></Text>
              <Text style={styles.subtitle}>DETERMINISTIC DIAGNOSTIC ENGINE</Text>
            </View>

            {/* Login Form */}
            <View style={styles.formContainer}>
              <View style={styles.securityBadge}>
                <ShieldCheck size={14} color={COLORS.emerald} />
                <Text style={styles.securityText}>AUTHORIZED PERSONNEL ONLY</Text>
              </View>

              {error && (
                <View style={styles.errorBox}>
                  <AlertCircle size={16} color="#ef4444" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {/* Google SSO */}
              <TouchableOpacity
                style={styles.googleBtn}
                onPress={() => promptAsync()}
                disabled={loading}
              >
                <Text style={styles.googleIcon}>G</Text>
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>INSPECTOR ID / EMAIL</Text>
                <TextInput
                  style={styles.input}
                  placeholder="inspector@manheim.com"
                  placeholderTextColor={COLORS.textDim}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                  editable={!loading}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>SECURITY KEY</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.textDim}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  editable={!loading}
                />
              </View>

              <TouchableOpacity
                style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.bgDark} size="small" />
                ) : (
                  <View style={styles.btnContent}>
                    {mode === 'register' ? (
                      <UserPlus size={16} color={COLORS.bgDark} />
                    ) : (
                      <LogIn size={16} color={COLORS.bgDark} />
                    )}
                    <Text style={styles.loginBtnText}>
                      {mode === 'register' ? 'CREATE ACCOUNT' : 'INITIALIZE SESSION'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Toggle login / register */}
              <TouchableOpacity
                style={styles.toggleBtn}
                onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
              >
                <Text style={styles.toggleText}>
                  {mode === 'login'
                    ? "Don't have an account? Register"
                    : 'Already have an account? Sign in'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>LUME42 LABS — US PROVISIONAL 64/032,339</Text>
              <Text style={styles.footerTextSub}>
                Authenticated by Firebase · All connections are cryptographically logged.
              </Text>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgDark,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  iconWrapper: {
    padding: 16,
    backgroundColor: 'rgba(6,182,212,0.1)',
    borderRadius: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(6,182,212,0.3)',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.textMain,
    letterSpacing: 2,
  },
  titleSub: {
    color: COLORS.textMuted,
    fontWeight: '400',
  },
  subtitle: {
    fontSize: 10,
    color: COLORS.cyan,
    fontWeight: '700',
    letterSpacing: 4,
    marginTop: 8,
  },
  formContainer: {
    backgroundColor: COLORS.bgPanel,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
    paddingVertical: 8,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
  },
  securityText: {
    color: COLORS.emerald,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    padding: 14,
    borderRadius: 8,
    marginBottom: 4,
  },
  googleIcon: {
    color: '#4285F4',
    fontSize: 18,
    fontWeight: '800',
  },
  googleBtnText: {
    color: COLORS.textMain,
    fontSize: 13,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  dividerText: {
    color: COLORS.textDim,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 8,
    padding: 16,
    color: COLORS.textMain,
    fontSize: 14,
    fontFamily: 'monospace',
  },
  loginBtn: {
    backgroundColor: COLORS.cyan,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: COLORS.cyan,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  loginBtnDisabled: {
    backgroundColor: COLORS.textMuted,
    shadowOpacity: 0,
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loginBtnText: {
    color: COLORS.bgDark,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
  toggleBtn: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  toggleText: {
    color: COLORS.cyan,
    fontSize: 11,
    fontWeight: '600',
  },
  footer: {
    marginTop: 48,
    alignItems: 'center',
  },
  footerText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  footerTextSub: {
    color: COLORS.textDim,
    fontSize: 9,
    textAlign: 'center',
  },
});
