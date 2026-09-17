import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent ensures that the environment (Expo Go / development
// client / bare React Native) can find and mount the root component.
// This replaces the old "main": "node_modules/expo/AppEntry.js" pointer,
// which breaks in monorepos where `expo` is hoisted to the workspace root.
registerRootComponent(App);
