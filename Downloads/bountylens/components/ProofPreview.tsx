import React from 'react';
import { StyleSheet, View, Image, ActivityIndicator } from 'react-native';
import { theme } from '../lib/utils';
import { ProofMedia } from '../lib/types';

interface ProofPreviewProps {
  uri?: string | null;
  type?: ProofMedia | string;
  loading?: boolean;
}

export function ProofPreview({ uri, type = 'image', loading }: ProofPreviewProps) {
  if (!uri && !loading) return null;

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator color={theme.card} />
      ) : String(type) === 'video' ? (
        <View style={styles.placeholder}>
          <ActivityIndicator color={theme.tint} />
        </View>
      ) : uri ? (
        <Image source={{ uri }} style={styles.image} resizeMode="cover" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});