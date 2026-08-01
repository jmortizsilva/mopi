/**
 * AdjustableOpciones — selector accesible de UNA opción entre varias, como control "ajustable".
 *
 * Con VoiceOver: enfocas el control y deslizas arriba/abajo para recorrer las opciones. Con
 * vista/tacto: botones − y +. Se lee la etiqueta y la opción actual. Los extremos no dan la vuelta
 * (se quedan en la primera/última), como un ajustable estándar de iOS.
 */
import React from "react";
import { Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";

export interface OpcionAjustable {
  code: number;
  label: string;
}

interface Props {
  label: string;
  options: OpcionAjustable[];
  value: number | null;
  onChange: (code: number) => void;
  disabled?: boolean;
  hint?: string;
}

export function AdjustableOpciones({ label, options, value, onChange, disabled, hint }: Props) {
  const dark = useColorScheme() === "dark";
  const textColor = dark ? "#FFFFFF" : "#111111";
  const btnBg = dark ? "#2C2C2E" : "#E3E3E8";

  const idx = options.findIndex((o) => o.code === value);
  const actual = idx >= 0 ? options[idx] : undefined;
  const textoValor = actual?.label ?? "—";

  const mover = (paso: number) => {
    if (disabled || options.length === 0) return;
    const base = idx >= 0 ? idx : 0;
    const nuevo = Math.max(0, Math.min(options.length - 1, base + paso));
    if (nuevo !== idx) onChange(options[nuevo].code);
  };

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityValue={{ text: textoValor }}
      accessibilityState={{ disabled: !!disabled }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === "increment") mover(1);
        else if (e.nativeEvent.actionName === "decrement") mover(-1);
      }}
    >
      <Text style={[styles.label, { color: textColor }]}>
        {label}: {textoValor}
      </Text>
      <View style={styles.buttons} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Pressable onPress={() => mover(-1)} disabled={disabled} style={[styles.btn, { backgroundColor: btnBg, opacity: disabled ? 0.5 : 1 }]}>
          <Text style={[styles.btnText, { color: textColor }]}>−</Text>
        </Pressable>
        <Pressable onPress={() => mover(1)} disabled={disabled} style={[styles.btn, { backgroundColor: btnBg, opacity: disabled ? 0.5 : 1 }]}>
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
