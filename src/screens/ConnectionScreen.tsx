import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { Bluetooth, ActivitySquare } from 'lucide-react-native';
import { COLORS } from '../theme/colors';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';

export default function ConnectionScreen({ onConnect }: { onConnect: () => void }) {
  const scanAnim = useSharedValue(0.5);

  React.useEffect(() => {
    scanAnim.value = withRepeat(
      withTiming(1.5, { duration: 2000, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
  }, []);

  const radarStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scanAnim.value }],
      opacity: 1.5 - scanAnim.value, // fades out as it expands
    };
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        
        <View style={styles.header}>
          <ActivitySquare size={32} color={COLORS.cyan} />
          <Text style={styles.title}>Lume<Text style={styles.titleSub}>Auto</Text></Text>
        </View>

        <Text style={styles.subtitle}>DETERMINISTIC GOVERNANCE</Text>

        <View style={styles.radarContainer}>
          <Animated.View style={[styles.radarCircle, radarStyle]} />
          <Animated.View style={[styles.radarCircle, radarStyle, { animationDelay: '1000ms' }]} />
          <View style={styles.radarCenter}>
            <Bluetooth size={32} color={COLORS.cyan} />
          </View>
        </View>

        <View style={styles.statusBox}>
          <Text style={styles.statusText}>SCANNING FOR ELM327 OBD-II...</Text>
          <Text style={styles.helperText}>Ensure your vehicle is on and the adapter is plugged in.</Text>
        </View>

        <TouchableOpacity style={styles.button} onPress={onConnect}>
          <Text style={styles.buttonText}>CONNECT DEMO</Text>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgDark,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.textMain,
    letterSpacing: 2,
  },
  titleSub: {
    fontWeight: '300',
    color: COLORS.textMuted,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.cyan,
    fontWeight: '600',
    letterSpacing: 3,
    marginBottom: 60,
  },
  radarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 200,
    width: 200,
    marginBottom: 60,
  },
  radarCircle: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: COLORS.cyan,
    opacity: 0.5,
  },
  radarCenter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.bgPanelSolid,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.cyan,
    shadowColor: COLORS.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  statusBox: {
    alignItems: 'center',
    marginBottom: 40,
  },
  statusText: {
    color: COLORS.textMain,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  helperText: {
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  button: {
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderWidth: 1,
    borderColor: COLORS.cyan,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: COLORS.cyan,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
  },
});
