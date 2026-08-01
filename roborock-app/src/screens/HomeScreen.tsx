/**
 * HomeScreen — estado del robot + controles principales + limpieza por habitaciones.
 * Diseñada para VoiceOver: cabeceras, el estado se lee al enfocarlo (no se canta la telemetría)
 * y se anuncian con prioridad alta los resultados de acción y las transiciones importantes.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, RefreshControl, ScrollView, StyleSheet, Text, useColorScheme, Vibration, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { anunciar, anunciarImportante } from "../accesibilidad/anuncios";
import { AccessibleButton } from "../ui/AccessibleButton";
import { OptionPicker } from "../ui/OptionPicker";
import { ToggleRow } from "../ui/ToggleRow";
import type { RootStackParamList } from "../navigation";
import { controlesSegunEstado, summarizeStatus, type Device, type DecodedStatus, type MappedRoom, type RoborockClient } from "../roborock";

type Props = NativeStackScreenProps<RootStackParamList, "Home"> & {
  client: RoborockClient;
  device: Device;
  onLogout: () => void;
};

// Cada cuánto se relee el estado en segundo plano (autorrefresco).
const POLL_MS = 10000;

export function HomeScreen({ navigation, client, device, onLogout }: Props) {
  const dark = useColorScheme() === "dark";
  const textColor = dark ? "#FFFFFF" : "#111111";
  const cardBg = dark ? "#1C1C1E" : "#F2F2F7";

  const [status, setStatus] = useState<DecodedStatus | null>(null);
  const [statusText, setStatusText] = useState("Cargando estado…");
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState<MappedRoom[]>([]);
  // Habitaciones marcadas para limpiar juntas (ids de segmento).
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Número de pasadas por habitación (1 o 2).
  const [repeat, setRepeat] = useState(1);

  // Refs para el autorrefresco: evitar peticiones solapadas, no refrescar mientras hay una
  // acción en curso, y no re-renderizar el texto de estado si no ha cambiado.
  const inFlight = useRef(false);
  const busyRef = useRef(false);
  const lastText = useRef<string | null>(null);
  // Estado previo, para detectar transiciones que merecen voz (error nuevo, vuelta a la base).
  const prevStatus = useRef<DecodedStatus | null>(null);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  // Habitaciones REALES del mapa (nombre + id de segmento correcto para limpiar).
  useEffect(() => {
    client
      .getMappedRooms(device.duid)
      .then(setRooms)
      .catch(() => setRooms([]));
  }, [client, device.duid]);

  // Transiciones que merecen voz. La telemetría (batería, tiempo) NO se canta: se lee al enfocar
  // el estado. Solo avisamos de lo que un usuario querría saber sin estar mirando.
  const announceTransitions = useCallback((prev: DecodedStatus | null, next: DecodedStatus) => {
    if (!prev) return; // primera lectura: aún no hay "antes" con el que comparar
    if (!prev.hasError && next.hasError) anunciarImportante(`Error: ${next.error.label}`);
    for (const w of next.warnings) {
      if (!prev.warnings.includes(w)) anunciarImportante(w); // aviso nuevo (falta de agua, base…)
    }
    if ((prev.cleaning || prev.returning) && next.charging && !next.cleaning && !next.returning) {
      anunciar("De vuelta en la base");
    }
  }, []);

  // `silent`: sondeo en segundo plano. No muestra el spinner, y si falla NO pisa el último
  // estado bueno con un error transitorio (evita interrumpir al lector con ruido de red).
  const refreshStatus = useCallback(
    async (silent = false) => {
      if (inFlight.current) return; // ya hay una lectura en marcha
      inFlight.current = true;
      if (!silent) setRefreshing(true);
      try {
        const s = await client.getStatus(device.duid);
        announceTransitions(prevStatus.current, s); // antes de guardar el nuevo como "previo"
        prevStatus.current = s;
        setStatus(s);
        const text = summarizeStatus(s);
        // Solo re-renderizar el texto si cambió (la telemetría se lee al enfocar, no se canta).
        if (text !== lastText.current) {
          lastText.current = text;
          setStatusText(text);
        }
      } catch (e) {
        if (!silent) {
          const text = "No se pudo obtener el estado: " + (e as Error).message;
          lastText.current = text;
          setStatusText(text);
        }
      } finally {
        inFlight.current = false;
        if (!silent) setRefreshing(false);
      }
    },
    [client, device.duid, announceTransitions],
  );

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Autorrefresco: sondea cada POLL_MS, se salta el tick si hay una acción en curso, y se pausa
  // cuando la app pasa a segundo plano (ahorra red/batería), reanudando con una lectura inmediata.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (!busyRef.current) refreshStatus(true);
      }, POLL_MS);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    start();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshStatus(true);
        start();
      } else {
        stop();
      }
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [refreshStatus]);

  const runAction = useCallback(
    async (label: string, action: () => Promise<unknown>) => {
      setBusy(true);
      anunciar(`${label}…`); // informativo: espera turno, no pisa nada
      try {
        await action();
        Vibration.vibrate(60); // confirmación táctil
        anunciarImportante(`${label}: hecho`); // resultado: prioridad alta, no se corta
      } catch (e) {
        Vibration.vibrate([0, 120, 80, 120]); // patrón de error
        anunciarImportante(`${label}: error`);
        setStatusText(`Error al ${label.toLowerCase()}: ${(e as Error).message}`);
      } finally {
        setBusy(false);
        setTimeout(() => refreshStatus(true), 1500);
      }
    },
    [refreshStatus],
  );

  const duid = device.duid;
  // Qué controles tienen sentido ahora mismo (p. ej. no "Pausar" si está cargando en la base).
  const ctrl = controlesSegunEstado(status);

  const toggleRoom = useCallback((segmentId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(segmentId)) next.delete(segmentId);
      else next.add(segmentId);
      return next;
    });
  }, []);

  // Lanza la limpieza de todas las marcadas de una vez (app_segment_clean acepta varias).
  const cleanSelected = useCallback(async () => {
    const elegidas = rooms.filter((r) => selected.has(r.segmentId));
    if (elegidas.length === 0) {
      anunciar("Marca al menos una habitación primero.");
      return;
    }
    const ids = elegidas.map((r) => r.segmentId);
    const label =
      elegidas.length === 1 ? `Limpiar ${elegidas[0].name}` : `Limpiar ${elegidas.length} habitaciones`;
    await runAction(label, () => client.cleanSegments(duid, ids, repeat));
    setSelected(new Set()); // desmarcar tras lanzar
  }, [rooms, selected, repeat, runAction, client, duid]);

  return (
    // Home no lleva cabecera nativa (es la raíz), así que el borde superior seguro (notch) lo
    // pone este SafeAreaView.
    <SafeAreaView style={styles.safe} edges={["top"]}>
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refreshStatus()} />}
    >
      <Text accessibilityRole="header" style={[styles.title, { color: textColor }]}>
        {device.name ?? "Mi robot"}
      </Text>

      {/* El estado se lee al enfocarlo. No se usa accessibilityLiveRegion: en iOS es un no-op
          (solo Android) y cantar la telemetría en cada sondeo sería inutilizable (guía §2). Las
          transiciones que importan se anuncian aparte en announceTransitions. */}
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: textColor }]}>
          Estado
        </Text>
        <Text style={[styles.statusText, { color: textColor }]}>{statusText}</Text>
      </View>

      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: textColor }]}>
          Controles
        </Text>
        <AccessibleButton label="Empezar limpieza" busy={busy} disabled={!ctrl.empezar} onPress={() => runAction("Empezar limpieza", () => client.startCleaning(duid))} />
        <AccessibleButton label="Pausar" variant="secondary" busy={busy} disabled={!ctrl.pausar} onPress={() => runAction("Pausar", () => client.pause(duid))} />
        <AccessibleButton label="Parar" variant="secondary" busy={busy} disabled={!ctrl.parar} onPress={() => runAction("Parar", () => client.stopCleaning(duid))} />
        <AccessibleButton label="Volver a la base" busy={busy} disabled={!ctrl.dock} onPress={() => runAction("Volver a la base", () => client.dock(duid))} />
        <AccessibleButton label="Localizar robot (sonido)" variant="secondary" busy={busy} onPress={() => runAction("Localizar", () => client.findMe(duid))} />
        <AccessibleButton label="Actualizar estado" variant="secondary" busy={busy} onPress={() => refreshStatus()} />
      </View>

      {rooms.length > 0 ? (
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: textColor }]}>
            Limpiar habitaciones
          </Text>
          <Text style={[styles.detail, { color: textColor }]}>
            Marca las que quieras y pulsa "Limpiar seleccionadas".
          </Text>
          {rooms.map((room) => (
            <ToggleRow
              key={room.segmentId}
              label={`Limpiar ${room.name}`}
              value={selected.has(room.segmentId)}
              disabled={busy}
              onValueChange={() => toggleRoom(room.segmentId)}
            />
          ))}
          <OptionPicker
            label="Número de pasadas"
            options={[
              { code: 1, label: "1 vez" },
              { code: 2, label: "2 veces" },
            ]}
            value={repeat}
            disabled={busy}
            onSelect={setRepeat}
          />
          <AccessibleButton
            label={selected.size ? `Limpiar seleccionadas (${selected.size})` : "Limpiar seleccionadas"}
            hint="Envía el robot a limpiar solo las habitaciones marcadas"
            busy={busy}
            onPress={cleanSelected}
          />
        </View>
      ) : null}

      <AccessibleButton label="Configuración" hint="Ajustes de succión, agua, secado, volumen y más" onPress={() => navigation.navigate("Settings")} />
      <AccessibleButton label="Cerrar sesión" variant="danger" onPress={onLogout} />
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 16, gap: 14 },
  title: { fontSize: 26, fontWeight: "700" },
  card: { borderRadius: 14, padding: 16 },
  sectionTitle: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  statusText: { fontSize: 18, lineHeight: 24 },
  detail: { fontSize: 15, marginTop: 6, opacity: 0.9 },
});
