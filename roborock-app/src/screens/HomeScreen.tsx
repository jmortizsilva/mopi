/**
 * HomeScreen — estado del robot + controles principales + limpieza por habitaciones.
 * Diseñada para VoiceOver: cabeceras, región en vivo para el estado y anuncios al actuar.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState, RefreshControl, ScrollView, StyleSheet, Text, useColorScheme, Vibration, View } from "react-native";
import { AccessibleButton } from "../ui/AccessibleButton";
import { SettingsScreen } from "./SettingsScreen";
import { summarizeStatus, type Device, type DecodedStatus, type MappedRoom, type RoborockClient } from "../roborock";

interface Props {
  client: RoborockClient;
  device: Device;
  onLogout: () => void;
}

// Cada cuánto se relee el estado en segundo plano (autorrefresco).
const POLL_MS = 10000;

export function HomeScreen({ client, device, onLogout }: Props) {
  const dark = useColorScheme() === "dark";
  const textColor = dark ? "#FFFFFF" : "#111111";
  const cardBg = dark ? "#1C1C1E" : "#F2F2F7";

  const [status, setStatus] = useState<DecodedStatus | null>(null);
  const [statusText, setStatusText] = useState("Cargando estado…");
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState<MappedRoom[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  // Refs para el autorrefresco: evitar peticiones solapadas, no refrescar mientras hay una
  // acción en curso, y no re-anunciar el estado si el texto no ha cambiado.
  const inFlight = useRef(false);
  const busyRef = useRef(false);
  const lastText = useRef<string | null>(null);
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

  // `silent`: sondeo en segundo plano. No muestra el spinner, y si falla NO pisa el último
  // estado bueno con un error transitorio (evita interrumpir al lector con ruido de red).
  const refreshStatus = useCallback(
    async (silent = false) => {
      if (inFlight.current) return; // ya hay una lectura en marcha
      inFlight.current = true;
      if (!silent) setRefreshing(true);
      try {
        const s = await client.getStatus(device.duid);
        setStatus(s);
        const text = summarizeStatus(s);
        // Solo tocar el estado si el texto cambió: así la región en vivo no re-anuncia lo mismo.
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
    [client, device.duid],
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
      AccessibilityInfo.announceForAccessibility(`${label}…`);
      try {
        await action();
        Vibration.vibrate(60); // confirmación táctil
        AccessibilityInfo.announceForAccessibility(`${label}: hecho`);
      } catch (e) {
        Vibration.vibrate([0, 120, 80, 120]); // patrón de error
        AccessibilityInfo.announceForAccessibility(`${label}: error`);
        setStatusText(`Error al ${label.toLowerCase()}: ${(e as Error).message}`);
      } finally {
        setBusy(false);
        setTimeout(() => refreshStatus(true), 1500);
      }
    },
    [refreshStatus],
  );

  const duid = device.duid;

  if (showSettings) {
    return <SettingsScreen client={client} device={device} onBack={() => setShowSettings(false)} />;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refreshStatus()} />}
    >
      <Text accessibilityRole="header" style={[styles.title, { color: textColor }]}>
        {device.name ?? "Mi robot"}
      </Text>

      {/* Estado en región en vivo: VoiceOver lo lee al cambiar */}
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: textColor }]}>
          Estado
        </Text>
        <Text accessibilityLiveRegion="polite" style={[styles.statusText, { color: textColor }]}>
          {statusText}
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: textColor }]}>
          Controles
        </Text>
        <AccessibleButton label="Empezar limpieza" busy={busy} onPress={() => runAction("Empezar limpieza", () => client.startCleaning(duid))} />
        <AccessibleButton label="Pausar" variant="secondary" busy={busy} onPress={() => runAction("Pausar", () => client.pause(duid))} />
        <AccessibleButton label="Parar" variant="secondary" busy={busy} onPress={() => runAction("Parar", () => client.stopCleaning(duid))} />
        <AccessibleButton label="Volver a la base" busy={busy} onPress={() => runAction("Volver a la base", () => client.dock(duid))} />
        <AccessibleButton label="Localizar robot (sonido)" variant="secondary" busy={busy} onPress={() => runAction("Localizar", () => client.findMe(duid))} />
        <AccessibleButton label="Actualizar estado" variant="secondary" busy={busy} onPress={() => refreshStatus()} />
      </View>

      {rooms.length > 0 ? (
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: textColor }]}>
            Limpiar una habitación
          </Text>
          {rooms.map((room) => (
            <AccessibleButton
              key={room.segmentId}
              label={`Limpiar ${room.name}`}
              hint="Envía el robot a limpiar solo esta habitación"
              variant="secondary"
              busy={busy}
              onPress={() => runAction(`Limpiar ${room.name}`, () => client.cleanSegments(duid, [room.segmentId]))}
            />
          ))}
        </View>
      ) : null}

      <AccessibleButton label="Configuración" hint="Ajustes de succión, agua, secado, volumen y más" onPress={() => setShowSettings(true)} />
      <AccessibleButton label="Cerrar sesión" variant="danger" onPress={onLogout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14 },
  title: { fontSize: 26, fontWeight: "700" },
  card: { borderRadius: 14, padding: 16 },
  sectionTitle: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  statusText: { fontSize: 18, lineHeight: 24 },
  detail: { fontSize: 15, marginTop: 6, opacity: 0.9 },
});
