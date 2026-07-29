/**
 * AdjustableStepper — control numérico accesible (rol "adjustable").
 *
 * Con VoiceOver: enfocas el control y deslizas arriba/abajo para subir/bajar el valor.
 * Con vista/tacto: botones − y +. El anuncio de VoiceOver dice el valor actual formateado.
 */
import React from "react";
import { Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
}

export function AdjustableStepper({ label, value, min, max, step, format, onChange, disabled }: Props) {
  const dark = useColorScheme() === "dark";
  const textColor = dark ? "#FFFFFF" : "#111111";
  const btnBg = dark ? "#2C2C2E" : "#E3E3E8";
  const fmt = format ?? ((v: number) => String(v));

  const set = (v: number) => {
    const clamped = Math.max(min, Math.min(max, v));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: fmt(value) }}
      accessibilityState={{ disabled: !!disabled }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => {
        if (disabled) return;
        if (e.nativeEvent.actionName === "increment") set(value + step);
        else if (e.nativeEvent.actionName === "decrement") set(value - step);
      }}
    >
      <Text style={[styles.label, { color: textColor }]}>
        {label}: {fmt(value)}
      </Text>
      <View style={styles.buttons} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Pressable onPress={() => set(value - step)} disabled={disabled} style={[styles.btn, { backgroundColor: btnBg }]}>
          <Text style={[styles.btnText, { color: textColor }]}>−</Text>
        </Pressable>
        <Pressable onPress={() => set(value + step)} disabled={disabled} style={[styles.btn, { backgroundColor: btnBg }]}>
          <Text style={[styles.btnText, { color: textColor }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 52, paddingVertical: 8 },
  label: { fontSize: 17, flex: 1, paddingRight: 12 },
  buttons: { flexDirection: "row", gap: 8 },
  btn: { width: 48, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  btnText: { fontSize: 24, fontWeight: "700" },
});
