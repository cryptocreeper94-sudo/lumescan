/**
 * LumeScan — Onboarding Walkthrough
 * ====================================
 * 3-slide first-run carousel. Shows once (stored in AsyncStorage).
 * Explains: (1) 42 deterministic signals, (2) Read & clear codes,
 * (3) Predict failures before they happen.
 *
 * DarkWave Studios LLC — Copyright 2026
 */

import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  Dimensions, ScrollView, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { ActivitySquare, AlertTriangle, TrendingUp, ShieldCheck, ChevronRight } from 'lucide-react-native';
import { COLORS } from '../theme/colors';

const { width } = Dimensions.get('window');

interface Props {
  onComplete: () => void;
}

const SLIDES = [
  {
    Icon: ActivitySquare,
    iconColor: COLORS.cyan,
    title: '42 Real-Time Signals',
    subtitle: 'DETERMINISTIC DIAGNOSTIC ENGINE',
    body: 'LumeScan reads 42 engine parameters in real-time — fuel trims, O2 sensors, catalyst efficiency, driver scoring, and more. Zero AI. Zero guessing. Pure math.',
    accent: COLORS.cyan,
  },
  {
    Icon: AlertTriangle,
    iconColor: '#f59e0b',
    title: 'Read & Clear Codes',
    subtitle: 'YOUR CHECK ENGINE LIGHT, DECODED',
    body: 'Instantly read trouble codes (P0420, P0171, etc.) with full interpretation, severity rating, and direct links to replacement parts on Amazon and eBay.',
    accent: '#f59e0b',
  },
  {
    Icon: TrendingUp,
    iconColor: COLORS.emerald,
    title: 'Predict Failures',
    subtitle: 'BEFORE THEY HAPPEN',
    body: 'LumeScan detects degradation trends — catalyst efficiency declining, fuel trims drifting, battery weakening — and alerts you weeks before the check engine light turns on.',
    accent: COLORS.emerald,
  },
];

export default function OnboardingScreen({ onComplete }: Props) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    setCurrentSlide(idx);
  };

  const goNext = () => {
    if (currentSlide < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (currentSlide + 1) * width, animated: true });
    } else {
      onComplete();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
      >
        {SLIDES.map((slide, i) => (
          <View key={i} style={[styles.slide, { width }]}>
            <View style={[styles.iconContainer, { borderColor: `${slide.accent}33`, backgroundColor: `${slide.accent}11` }]}>
              <slide.Icon size={56} color={slide.iconColor} />
            </View>
            <Text style={styles.subtitle}>{slide.subtitle}</Text>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.body}>{slide.body}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Bottom controls */}
      <View style={styles.footer}>
        {/* Dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, { backgroundColor: i === currentSlide ? COLORS.cyan : COLORS.borderLight, width: i === currentSlide ? 24 : 8 }]}
            />
          ))}
        </View>

        {/* Buttons */}
        <View style={styles.buttons}>
          {currentSlide < SLIDES.length - 1 ? (
            <>
              <TouchableOpacity onPress={onComplete}>
                <Text style={styles.skipText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.nextBtn} onPress={goNext}>
                <Text style={styles.nextText}>Next</Text>
                <ChevronRight size={16} color="#000" />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={[styles.nextBtn, styles.startBtn]} onPress={onComplete}>
              <ShieldCheck size={18} color="#000" />
              <Text style={styles.nextText}>Get Started</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.patent}>US Provisional Patent 64/032,339 · DarkWave Studios LLC</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgDark },
  slide: {
    flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40,
  },
  iconContainer: {
    width: 120, height: 120, borderRadius: 30, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', marginBottom: 32,
  },
  subtitle: {
    fontSize: 10, color: COLORS.cyan, fontWeight: '700', letterSpacing: 4,
    marginBottom: 12, textAlign: 'center',
  },
  title: {
    fontSize: 28, color: COLORS.textMain, fontWeight: '900', textAlign: 'center',
    marginBottom: 16, letterSpacing: 0.5,
  },
  body: {
    fontSize: 15, color: COLORS.textMuted, textAlign: 'center', lineHeight: 24,
    maxWidth: 340,
  },
  footer: {
    paddingHorizontal: 24, paddingBottom: 32,
  },
  dots: {
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    marginBottom: 32,
  },
  dot: {
    height: 8, borderRadius: 4,
  },
  buttons: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 24,
  },
  skipText: { color: COLORS.textDim, fontSize: 14, fontWeight: '600' },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 14, paddingHorizontal: 28,
    backgroundColor: COLORS.cyan, borderRadius: 14,
  },
  startBtn: {
    flex: 1, justifyContent: 'center', backgroundColor: COLORS.emerald,
  },
  nextText: { color: '#000', fontSize: 15, fontWeight: '800' },
  patent: {
    textAlign: 'center', color: COLORS.textDim, fontSize: 9,
    letterSpacing: 1,
  },
});
