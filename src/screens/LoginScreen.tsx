import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { ActivitySquare, ShieldCheck, AlertCircle } from 'lucide-react-native';
import { COLORS } from '../theme/colors';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../config/firebase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Email and Password are required");
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      // In a real environment with valid config, this will authenticate
      // Since we are mocking/waiting for config, we will catch the error
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      // If config is missing, this will throw an auth error
      if (err.code === 'auth/invalid-api-key') {
         setError("Firebase API Key is missing. Please update config.");
      } else {
         setError(err.message || "Failed to authenticate.");
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
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.bgDark} size="small" />
              ) : (
                <Text style={styles.loginBtnText}>INITIALIZE SESSION</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>LUME42 LABS — US PROVISIONAL 64/032,339</Text>
            <Text style={styles.footerTextSub}>All connections are cryptographically logged.</Text>
          </View>

        </View>
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
  loginBtnText: {
    color: COLORS.bgDark,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
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
  }
});
