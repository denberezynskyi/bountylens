import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../lib/utils';

export type BountyStatusType = 'waiting' | 'needs_review' | 'approved' | 'expired' | 'rejected';

interface StatusBadgeProps {
  status: BountyStatusType | string;
}

const STATUS_CONFIG: Record<string, { bg: string; fg: string; label: string }> = {
  waiting: { bg: theme.bg, fg: theme.subtext, label: 'Waiting' },
  needs_review: { bg: '#FEF3C7', fg: '#D97706', label: 'Review' },
  approved: { bg: '#E6FBF2', fg: theme.success, label: 'Approved' },
  expired: { bg: theme.border, fg: '#5B6472', label: 'Expired' },
  rejected: { bg: '#FEE2E2', fg: theme.danger, label: 'Rejected' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const conf = STATUS_CONFIG[status] || { bg: theme.bg, fg: theme.subtext, label: status };

  return (
    <View style={[styles.badge, { backgroundColor: conf.bg }]}>
      <Text style={[styles.text, { color: conf.fg }]}>{conf.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});