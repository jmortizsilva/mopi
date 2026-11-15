/**
 * ProgramacionesScreen — programaciones guardadas en el robot.
 *
 * Fase 1: solo lectura. Activar, editar y eliminar llegan como acciones de VoiceOver sobre cada
 * elemento (decidido con el usuario: una parada por programación) cuando se confirme en el robot
 * el formato de escritura (PROTOCOLO_ROBOROCK.md §8.4b).
 */
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, useColorScheme, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { describirProgramacion, type Device, type Programacion, type RoborockClient } from "../roborock";

type Props = NativeStackScreenProps<RootStackParamList, "Programaciones"> & {
  client: RoborockClient;
  device: Device;
};

export function ProgramacionesScreen({ client, device }: Props) {
  const dark = useColorScheme() === "dark";
  const textColor = dark ? "#FFFFFF" : "#111111";
  const cardBg = dark ? "#1C1C1E" : "#F2F2F7";
  const duid = device.duid;

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lista, setLista] = useState<Programacion[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setLista(await client.getProgramaciones(duid));
    } catch (e) {
      setError("No se pudieron leer las programaciones: " + (e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [client, duid]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargando) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={{ color: textColor, marginTop: 12 }}>Leyendo programaciones…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : lista.length === 0 ? (
          <Text style={{ color: textColor }}>No hay programaciones.</Text>
        ) : (
          lista.map((p) => (
            <View key={p.id} accessible style={styles.item}>
              <Text style={[styles.itemTexto, { color: textColor }]}>{describirProgramacion(p)}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: { borderRadius: 14, padding: 16 },
  item: { paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#8884" },
  itemTexto: { fontSize: 16, lineHeight: 22 },
  error: { color: "#B00020", fontSize: 16, fontWeight: "600" },
});
