import React from 'react';
import { FlatList, Text, View, Image } from 'react-native';
import Card from '../../components/ui/Card';
import Screen from '../../components/ui/Screen';
import { useTheme } from '../../theme/ThemeContext';
import { usePhotos } from '../../contexts/PhotoContext';

/**
 * Local gallery backed by the user's Firestore `photos` collection.
 * The preview/editor module pushes freshly uploaded photos into PhotoContext,
 * so this list stays current without extra wiring.
 */
export default function GalleryScreen() {
  const { colors, fonts, spacing } = useTheme();
  const { recentPhotos, loadingRecent } = usePhotos();

  return (
    <Screen>
      <Text style={[fonts.heading, { color: colors.text, marginTop: 24 }]}>Gallery</Text>
      {loadingRecent ? (
        <Text style={[fonts.body, { color: colors.textSecondary, marginTop: spacing.md }]}>
          Loading…
        </Text>
      ) : recentPhotos.length === 0 ? (
        <Text style={[fonts.body, { color: colors.textSecondary, marginTop: spacing.md }]}>
          Empty pa ang gallery mo.
        </Text>
      ) : (
        <FlatList
          data={recentPhotos}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={{ paddingVertical: spacing.md }}
          renderItem={({ item }) => (
            <Card style={{ flex: 1, margin: spacing.sm, padding: 0, overflow: 'hidden' }}>
              <Image
                source={{ uri: item.url }}
                style={{ width: '100%', height: 160 }}
                resizeMode="cover"
              />
              <View style={{ padding: spacing.sm }}>
                <Text style={[fonts.caption, { color: colors.textSecondary }]}>{item.filterId}</Text>
              </View>
            </Card>
          )}
        />
      )}
    </Screen>
  );
}
