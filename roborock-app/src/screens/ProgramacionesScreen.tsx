/**
 * ProgramacionesScreen — programaciones guardadas en el robot.
 *
 * Cada programación es una sola parada de VoiceOver con sus acciones en el rotor (decidido con el
 * usuario). Los botones visibles son para quien la usa al tacto y quedan ocultos al lector.
 */
import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, useColorScheme, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { anunciarImportante } from "../accesibilidad/anuncios";
import {
  anuncioActivacion,
  anuncioEliminada,
  anuncioFalloActivacion,
  anuncioFalloEliminar,
  describirProgramacion,
  etiquetaActivar,
  preguntaEliminar,
  type Device,
  type Programacion,
  type RoborockClient,
} from "../roborock";
import { AccessibleButton } from "../ui/AccessibleButton";

type Props = NativeStackScreenProps<RootStackParamList, "Programaciones"> & {
  client: RoborockClient;
  device: Device;
};

export function ProgramacionesScreen({ client, device, navigation }: Props) {
  const dark = useColorScheme() === "dark";
  const textColor = dark ? "#FFFFFF" : "#111111";
  const cardBg = dark ? "#1C1C1E" : "#F2F2F7";
  const duid = device.duid;

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lista, setLista] = useState<Programacion[]>([]);
  const cargadaUnaVez = useRef(false);

  // Se relee cada vez que se vuelve a la pantalla (por ejemplo, desde el editor). Solo la primera
  // vez se muestra "Leyendo…": después se actualiza en sitio, para que VoiceOver no pierda el foco
  // al desaparecer la lista detrás de la rueda de carga.
  const cargar = useCallback(async () => {
    if (!cargadaUnaVez.current) setCargando(true);
    setError(null);
    try {
      setLista(await client.getProgramaciones(duid));
    } catch (e) {
      setError("No se pudieron leer las programaciones: " + (e as Error).message);
    } finally {
      cargadaUnaVez.current = true;
      setCargando(false);
    }
  }, [client, duid]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

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

  const editar = useCallback((p: Programacion) => navigation.navigate("EditarProgramacion", { programacion: p }), [navigation]);

  const eliminar = useCallback(
    (p: Programacion) => {
      if (ocupada) return;
      Alert.alert(preguntaEliminar(p), undefined, [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            setOcupada(p.id);
            try {
              await client.eliminarProgramacion(duid, p.id);
              setLista((l) => l.filter((x) => x.id !== p.id));
              anunciarImportante(anuncioEliminada(p));
            } catch {
              anunciarImportante(anuncioFalloEliminar(p));
            } finally {
              setOcupada(null);
            }
          },
        },
      ]);
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
      <AccessibleButton label="Añadir programación" onPress={() => navigation.navigate("EditarProgramacion")} />
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : lista.length === 0 ? (
          <Text style={{ color: textColor }}>No hay programaciones.</Text>
        ) : (
          lista.map((p) => {
            const activar = etiquetaActivar(p);
            return (
              <View
                key={p.id}
                accessible
                accessibilityLabel={describirProgramacion(p)}
                // El rotor lee `name`, no `label`: RCTViewComponentView.mm (RN 0.81) crea cada
                // UIAccessibilityCustomAction solo con el name. Con un name fijo ("activar"), el rotor
                // decía "activar" también en las activadas. Por eso el name es el propio texto.
                accessibilityActions={[{ name: activar }, { name: "Editar" }, { name: "Eliminar" }]}
                onAccessibilityAction={(e) => {
                  const accion = e.nativeEvent.actionName;
                  if (accion === activar) cambiarActiva(p);
                  else if (accion === "Editar") editar(p);
                  else if (accion === "Eliminar") eliminar(p);
                }}
                // El doble toque abre Editar. Sin esto, VoiceOver pulsaría lo que haya en el centro
                // de la fila, que puede ser uno de los botones (guía de accesibilidad de comun/,
                // "Fila de lista con acciones").
                onAccessibilityTap={() => editar(p)}
                style={styles.item}
              >
                <Text style={[styles.itemTexto, { color: textColor }]}>{describirProgramacion(p)}</Text>
                <View style={styles.botones}>
                  <AccessibleButton label={activar} variant="secondary" busy={ocupada === p.id} onPress={() => cambiarActiva(p)} />
                  <AccessibleButton label="Editar" variant="secondary" disabled={ocupada === p.id} onPress={() => editar(p)} />
                  <AccessibleButton label="Eliminar" variant="danger" disabled={ocupada === p.id} onPress={() => eliminar(p)} />
                </View>
              </View>
            );
          })
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
  botones: { gap: 8 },
  error: { color: "#B00020", fontSize: 16, fontWeight: "600" },
});
