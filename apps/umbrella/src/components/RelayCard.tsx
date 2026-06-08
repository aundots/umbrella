import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const COLORS = {
  bg: '#F4F8FC',
  card: '#FFFFFF',
  primary: '#5B9BD5',
  text: '#191F28',
  sub: '#6B7684',
  live: '#3182F6',
  approaching: '#F59E0B',
  clear: '#22C55E',
};

interface Props {
  title: string;
  children: React.ReactNode;
  accent?: string;
}

export function RelayCard({ title, children, accent = COLORS.primary }: Props) {
  return (
    <View style={styles.card}>
      <View style={[styles.dot, { backgroundColor: accent }]} />
      <Text style={styles.title}>{title}</Text>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

export function MetaLine({ text }: { text: string }) {
  return <Text style={styles.meta}>{text}</Text>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.sub,
    marginBottom: 8,
  },
  body: {
    gap: 4,
  },
  meta: {
    fontSize: 12,
    color: COLORS.sub,
    marginTop: 4,
  },
});

export { COLORS };
