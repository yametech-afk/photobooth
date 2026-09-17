import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../hooks/useAuth';
import { usePhotos } from '../contexts/PhotoContext';
import { CameraScreen, createMonetizationGate } from '../modules/camera';
import {
  PhotoPreviewScreen,
  PhotoEditorScreen,
  StripLayoutScreen,
} from '../modules/preview-editor';
import {
  PaywallModal,
  PremiumScreen,
  EventBookingScreen,
  canUseFilter,
  useSubscription,
} from '../modules/monetization';
import type { AuthStackParamList, MainTabParamList, MainStackParamList } from './types';
import type { CapturedPhoto, CaptureMode } from '../modules/camera';

import OnboardingScreen from '../screens/onboarding/OnboardingScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import HomeScreen from '../screens/home/HomeScreen';
import GalleryScreen from '../screens/gallery/GalleryScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();
const MainTabs = createBottomTabNavigator<MainTabParamList>();

function AuthFlow() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Onboarding" component={OnboardingScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="SignUp" component={SignUpScreen} />
    </AuthStack.Navigator>
  );
}

function MainTabFlow() {
  const { colors } = useTheme();

  return (
    <MainTabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: 'transparent',
        },
        // Route names map 1:1 to tab screen component names below.
        tabBarIcon: ({ focused, color, size }) => {
          const icon = {
            HomeTab: focused ? 'home' : 'home-outline',
            GalleryTab: focused ? 'images' : 'images-outline',
            SettingsTab: focused ? 'settings' : 'settings-outline',
          }[route.name as keyof MainTabParamList];
          return <Ionicons name={icon as never} size={size} color={color} />;
        },
      })}
    >
      <MainTabs.Screen name="HomeTab" component={HomeScreen} />
      <MainTabs.Screen name="GalleryTab" component={GalleryScreen} />
      <MainTabs.Screen name="SettingsTab" component={SettingsScreen} />
    </MainTabs.Navigator>
  );
}

/**
 * Camera route — mounts the REAL camera module screen (src/modules/camera) and
 * wires its three integration seams (see camera README + INTEGRATION.md):
 *   1. Premium filter gate -> monetization module (canUseFilter + PaywallModal)
 *   2. Capture handoff     -> PhotoContext pending photos + PhotoPreview params
 *   3. Cancel              -> back to the tab flow
 */
function CameraRoute() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { userDoc, paywallVisible, openPaywall, closePaywall } = useSubscription();
  const { addPendingPhoto, clearPendingPhotos, setSelectedFilterId } = usePhotos();

  // Fail-closed gate: premium filters stay locked until the monetization module
  // resolves the user's entitlements; tapping a locked filter opens the paywall.
  const premiumGate = useMemo(
    () => createMonetizationGate({ canUseFilter, user: userDoc, onLocked: openPaywall }),
    [userDoc, openPaywall]
  );

  const handleCaptureComplete = useCallback(
    (mode: CaptureMode, photos: CapturedPhoto[]) => {
      if (photos.length === 0) return;
      // Stage the shots for the preview/editor module (INTEGRATION_CHECKLIST §3).
      clearPendingPhotos();
      photos.forEach((photo) =>
        addPendingPhoto({ uri: photo.uri, width: photo.width, height: photo.height })
      );
      const filter = photos[0].filterId;
      setSelectedFilterId(filter);
      navigation.navigate('PhotoPreview', {
        photos: photos.map((photo) => ({
          uri: photo.uri,
          width: photo.width,
          height: photo.height,
        })),
        filter,
      });
    },
    [navigation, addPendingPhoto, clearPendingPhotos, setSelectedFilterId]
  );

  const handleCancel = useCallback(() => navigation.goBack(), [navigation]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraScreen
        premiumGate={premiumGate}
        onCaptureComplete={handleCaptureComplete}
        onCancel={handleCancel}
      />
      <PaywallModal visible={paywallVisible} source="filter" onClose={closePaywall} />
    </View>
  );
}

/**
 * Main flow after login. Every stack route now mounts its REAL module screen —
 * no ModulePlaceholderScreen registration remains:
 *   Camera        <- camera module
 *   PhotoPreview / PhotoEditor / StripLayout <- preview-editor module
 *   Premium / EventBooking                    <- monetization module
 */
function MainFlow() {
  const { paywallVisible, closePaywall } = useSubscription();

  return (
    <>
      <MainStack.Navigator screenOptions={{ headerShown: false }}>
        <MainStack.Screen name="MainTabs" component={MainTabFlow} />
        <MainStack.Screen name="Camera" options={{ animation: 'slide_from_bottom' }}>
          {() => <CameraRoute />}
        </MainStack.Screen>
        <MainStack.Screen
          name="PhotoPreview"
          component={PhotoPreviewScreen}
          options={{ animation: 'fade' }}
        />
        <MainStack.Screen
          name="PhotoEditor"
          component={PhotoEditorScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <MainStack.Screen
          name="StripLayout"
          component={StripLayoutScreen}
          options={{ presentation: 'modal' }}
        />
        <MainStack.Screen
          name="Premium"
          component={PremiumScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
        <MainStack.Screen
          name="EventBooking"
          component={EventBookingScreen}
          options={{ animation: 'slide_from_right' }}
        />
      </MainStack.Navigator>

      {/* Quota-triggered paywall, mounted once for the whole main flow so the
          preview/editor and gallery flows can raise it too. */}
      <PaywallModal visible={paywallVisible} source="quota" onClose={closePaywall} />
    </>
  );
}

export default function RootNavigator() {
  const { user, initializing } = useAuth();
  const { colors } = useTheme();

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? <MainFlow /> : <AuthFlow />}
    </NavigationContainer>
  );
}