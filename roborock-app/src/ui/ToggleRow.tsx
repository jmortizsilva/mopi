/**
 * ToggleRow — fila con etiqueta e interruptor, como UN SOLO elemento accesible.
 *
 * VoiceOver la lee de una vez ("Etiqueta, interruptor, activado/desactivado") y se alterna
 * con doble toque. El Switch interno es solo visual (oculto al lector y sin tocar eventos).
 */
import React from "react";
import { Pressable, StyleSheet, Switch, Text, useColorScheme, View } from "react-native";

interface Props {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  hint?: string;
  disabled?: boolean;
}

export function ToggleRow({ label, value, onValueChange, hint, disabled }: Props) {
  const dark = useColorScheme() === "dark";
  const textColor = dark ? "#FFFFFF" : "#111111";
  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      style={styles.row}
    >
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Switch value={value} disabled={disabled} trackColor={{ true: "#0A62C2" }} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 52, paddingVertical: 8 },
  label: { fontSize: 17, flex: 1, paddingRight: 12 },
});
