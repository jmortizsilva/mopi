/**
 * OptionPicker — selector de una opción entre varias (segmentado), accesible.
 * La opción activa se marca con accessibilityState.selected para VoiceOver.
 */
import React from "react";
import { Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";

export interface PickerOption {
  code: number;
  label: string;
}

interface Props {
  label: string;
  options: PickerOption[];
  value: number | null;
  onSelect: (code: number) => void;
  disabled?: boolean;
}

export function OptionPicker({ label, options, value, onSelect, disabled }: Props) {
  const dark = useColorScheme() === "dark";
  const textColor = dark ? "#FFFFFF" : "#111111";
  const idleBg = dark ? "#2C2C2E" : "#E3E3E8";

  return (
    <View style={styles.container}>
      {/* Etiqueta de campo, no encabezado: con rol "header" ensuciaría el rotor de encabezados. */}
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      <View style={styles.options}>
        {options.map((opt) => {
          const selected = opt.code === value;
          return (
            <Pressable
              key={opt.code}
              onPress={() => onSelect(opt.code)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected, disabled: !!disabled }}
              style={[
                styles.option,
                { backgroundColor: selected ? "#0A62C2" : idleBg, opacity: disabled ? 0.5 : 1 },
              ]}
            >
              <Text style={[styles.optionText, { color: selected ? "#FFFFFF" : textColor }]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 8 },
  label: { fontSize: 17, marginBottom: 8 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { minHeight: 44, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, justifyContent: "center" },
  optionText: { fontSize: 16, fontWeight: "600" },
});
