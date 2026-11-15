/**
 * ProgramacionesScreen — programaciones guardadas en el robot.
 *
 * Cada programación es una sola parada de VoiceOver con sus acciones en el rotor (decidido con el
 * usuario). Los botones visibles son para quien la usa al tacto y quedan ocultos al lector.
 * Editar y eliminar llegan cuando se confirme en el robot su formato (PROTOCOLO_ROBOROCK.md §8.4b).
 */
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, useColorScheme, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { anunciarImportante } from "../accesibilidad/anuncios";
import {
  anuncioActivacion,
  anuncioFalloActivacion,
  describirProgramacion,
  type Device,
  type Programacion,
  type RoborockClient,
} from "../roborock";
import { AccessibleButton } from "../ui/AccessibleButton";

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

  // Id de la programación con una orden en curso, para no mandar dos a la vez.
  const [ocupada, setOcupada] = useState<string | null>(null);

  const cambiarActiva = useCallback(
    async (p: Programacion) => {
      if (ocupada) return;
      const activa = !p.activa;
      setOcupada(p.id);
      try {
        const quedo = await client.setProgramacionActiva(duid, p.id, activa);
        setLista((l) => l.map((x) => (x.id === p.id ? quedo : x)));
        anunciarImportante(anuncioActivacion(quedo, activa));
      } catch {
        anunciarImportante(anuncioFalloActivacion(p, activa));
      } finally {
        setOcupada(null);
      }
    },
    [client, duid, ocupada],
  );

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
            <View
              key={p.id}
              accessible
              accessibilityLabel={describirProgramacion(p)}
              accessibilityActions={[{ name: "activar", label: p.activa ? "Desactivar" : "Activar" }]}
              onAccessibilityAction={(e) => {
                if (e.nativeEvent.actionName === "activar") cambiarActiva(p);
              }}
              // Sin esto, el doble toque de VoiceOver pulsa lo que haya en el centro de la fila, que
              // puede ser el botón de activar (guía de accesibilidad de comun/, "Fila de lista con
              // acciones"). Hasta que exista Editar, el doble toque no hace nada.
              onAccessibilityTap={() => {}}
              style={styles.item}
            >
              <Text style={[styles.itemTexto, { color: textColor }]}>{describirProgramacion(p)}</Text>
              <AccessibleButton
                label={p.activa ? "Desactivar" : "Activar"}
                variant="secondary"
                busy={ocupada === p.id}
                onPress={() => cambiarActiva(p)}
              />
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
  item: { paddingVertical: 8, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#8884" },
  itemTexto: { fontSize: 16, lineHeight: 22 },
  error: { color: "#B00020", fontSize: 16, fontWeight: "600" },
});
