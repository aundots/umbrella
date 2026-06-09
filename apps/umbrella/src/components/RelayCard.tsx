import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Txt } from '@toss/tds-react-native';
import { COLORS, RADIUS, cardShadow } from '../theme';

interface Props {
  title: string;
  children: React.ReactNode;
  accent?: string;
}

export function RelayCard({ title, children, accent = COLORS.primary }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.accent, { backgroundColor: accent }]} />
        <Txt typography="t7" fontWeight="semibold" color={COLORS.sub}>
          {title}
        </Txt>
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

export function MetaLine({ text }: { text: string }) {
  return (
    <Txt typography="t7" color={COLORS.sub} style={styles.meta}>
      {text}
    </Txt>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    padding: 20,
    marginBottom: 12,
    ...cardShadow,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  accent: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  body: {
    gap: 4,
  },
  meta: {
    marginTop: 4,
  },
});

export { COLORS };
