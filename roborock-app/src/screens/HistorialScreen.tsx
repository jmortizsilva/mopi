/**
 * HistorialScreen — historial de limpiezas del robot (solo lectura), accesible con VoiceOver.
 * Muestra los totales y una lista de las últimas limpiezas: fecha, duración, área y resultado.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, useColorScheme, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { formatDuration, type Device, type RegistroLimpieza, type ResumenLimpieza, type RoborockClient } from "../roborock";
import { AccessibleButton } from "../ui/AccessibleButton";

type Props = NativeStackScreenProps<RootStackParamList, "Historial"> & {
  client: RoborockClient;
  device: Device;
};

function fechaLegible(tsSeg: number): string {
  const d = new Date(tsSeg * 1000);
  const f = d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  const h = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return `${f} a las ${h}`;
}

function resultado(r: RegistroLimpieza): string {
  if (r.completada) return "Completada";
  if (r.error !== 0) return `Con error (código ${r.error})`;
  return "Interrumpida";
}

export function HistorialScreen({ client, device }: Props) {
  const dark = useColorScheme() === "dark";
  const textColor = dark ? "#FFFFFF" : "#111111";
  const cardBg = dark ? "#1C1C1E" : "#F2F2F7";
  const duid = device.duid;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<ResumenLimpieza | null>(null);
  const [limpiezas, setLimpiezas] = useState<RegistroLimpieza[]>([]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const h = await client.getCleanHistory(duid);
      setResumen(h.resumen);
      setLimpiezas(h.limpiezas);
    } catch (e) {
      setError("No se pudo leer el historial: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [client, duid]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={{ color: textColor, marginTop: 12 }}>Leyendo historial…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {resumen ? (
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text accessibilityRole="header" style={[styles.section, { color: textColor }]}>En total</Text>
          <Text style={[styles.total, { color: textColor }]}>
            {resumen.totalLimpiezas} limpiezas, {formatDuration(resumen.totalDuracionSeg)}, {resumen.totalAreaM2} metros cuadrados.
          </Text>
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <Text accessibilityRole="header" style={[styles.section, { color: textColor }]}>Últimas limpiezas</Text>
        {limpiezas.length === 0 ? (
          <Text style={{ color: textColor }}>Aún no hay limpiezas registradas.</Text>
        ) : (
          limpiezas.map((r, i) => (
            <View key={`${r.inicio}-${i}`} accessible style={styles.item}>
              <Text style={[styles.itemTexto, { color: textColor }]}>
                {fechaLegible(r.inicio)}. {formatDuration(r.duracionSeg)}, {r.areaM2} metros cuadrados. {resultado(r)}.
              </Text>
            </View>
          ))
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <AccessibleButton label="Actualizar historial" variant="secondary" onPress={cargar} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: { borderRadius: 14, padding: 16 },
  section: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  total: { fontSize: 17, lineHeight: 24 },
  item: { paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#8884" },
  itemTexto: { fontSize: 16, lineHeight: 22 },
  error: { color: "#B00020", fontSize: 16, fontWeight: "600" },
});
