import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GradientButton from '../../components/ui/GradientButton';
import Screen from '../../components/ui/Screen';
import { useTheme } from '../../theme/ThemeContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Onboarding'>;

const SLIDES = [
  {
    title: 'Kuha ng Perfect Shot',
    body: 'Live camera with burst mode at photo strips, parang tunay na photobooth.',
    emoji: '📸',
  },
  {
    title: 'AI Filters at AR Effects',
    body: 'Anime, cyberpunk, vintage at marami pa — applied nang mabilis gamit ang AI.',
    emoji: '✨',
  },
  {
    title: 'Share Agad Sa Barkada',
    body: 'QR codes, direct social sharing, at cloud gallery para sa lahat ng photos mo.',
    emoji: '🔗',
  },
];

export default function OnboardingScreen({ navigation }: Props) {
  const { colors, gradient, fonts, radius, spacing } = useTheme();
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];

  const handleNext = () => {
    if (index < SLIDES.length - 1) {
      setIndex(index + 1);
    } else {
      navigation.replace('Login');
    }
  };

  return (
    <Screen>
      <View style={styles.body}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: radius.xl, padding: spacing.xxl, marginBottom: spacing.xl }}
        >
          <Text style={{ fontSize: 64, textAlign: 'center' }}>{slide.emoji}</Text>
        </LinearGradient>

        <Text style={[fonts.heading, { color: colors.text, textAlign: 'center' }]}>
          {slide.title}
        </Text>
        <Text
          style={[
            fonts.body,
            { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md },
          ]}
        >
          {slide.body}
        </Text>
      </View>

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={{
              width: i === index ? 24 : 8,
              height: 8,
              borderRadius: 4,
              marginHorizontal: 4,
              backgroundColor: i === index ? colors.primary : colors.card,
            }}
          />
        ))}
      </View>

      <GradientButton
        title={index === SLIDES.length - 1 ? 'Simulan' : 'Susunod'}
        onPress={handleNext}
      />
      <TouchableOpacity
        onPress={() => navigation.replace('Login')}
        style={{ marginTop: spacing.md }}
      >
        <Text style={[fonts.caption, { color: colors.textSecondary, textAlign: 'center' }]}>
          Skip
        </Text>
      </TouchableOpacity>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
  },
});
