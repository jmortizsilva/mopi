/**
 * AccessibleButton — botón grande y accesible (VoiceOver).
 * Área táctil amplia, rol "button", etiqueta y pista opcionales, estado ocupado.
 */
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";

interface Props {
  label: string;
  onPress: () => void;
  hint?: string;
  busy?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}

export function AccessibleButton({ label, onPress, hint, busy, disabled, variant = "primary" }: Props) {
  const dark = useColorScheme() === "dark";
  const bg =
    variant === "danger" ? "#B00020" : variant === "secondary" ? (dark ? "#2C2C2E" : "#E3E3E8") : "#0A62C2";
  const fg = variant === "secondary" ? (dark ? "#FFFFFF" : "#111111") : "#FFFFFF";
  const isDisabled = disabled || busy;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!isDisabled, busy: !!busy }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: isDisabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      <View style={styles.content}>
        {busy ? <ActivityIndicator color={fg} /> : null}
        <Text style={[styles.label, { color: fg }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    justifyContent: "center",
    marginVertical: 6,
  },
  content: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  label: { fontSize: 18, fontWeight: "600", textAlign: "center" },
});
