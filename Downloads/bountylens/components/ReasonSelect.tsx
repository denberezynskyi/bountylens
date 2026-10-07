import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../lib/utils';

interface ReasonSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: { label: string; value: string }[];
}

export function ReasonSelect({ value, onChange, options }: ReasonSelectProps) {
  const [open, setOpen] = useState(false);

  const selectedLabel = options.find((o) => o.value === value)?.label || 'Select reason...';

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.field} onPress={() => setOpen(!open)} activeOpacity={0.8}>
        <Text style={styles.fieldText}>{selectedLabel}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.subtext} />
      </TouchableOpacity>

      {open && (
        <View style={styles.list}>
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.option, isSelected && styles.optionOn]}
                onPress={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                <Text style={[styles.optionText, isSelected && { color: theme.tint, fontWeight: '700' }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  field: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: theme.card,
  },
  fieldText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.text,
  },
  list: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: theme.card,
  },
  option: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: theme.card,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  optionOn: {
    backgroundColor: theme.bg,
  },
  optionText: {
    fontSize: 15,
    color: theme.text,
  },
});