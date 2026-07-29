/**
 * HomeScreen — estado del robot + controles principales + limpieza por habitaciones.
 * Diseñada para VoiceOver: cabeceras, región en vivo para el estado y anuncios al actuar.
 */
import React, { useCallback, useEffect, useState } from "react";
import { AccessibilityInfo, RefreshControl, ScrollView, StyleSheet, Text, useColorScheme, Vibration, View } from "react-native";
import { AccessibleButton } from "../ui/AccessibleButton";
import { SettingsScreen } from "./SettingsScreen";
import { summarizeStatus, type Device, type DecodedStatus, type MappedRoom, type RoborockClient } from "../roborock";

interface Props {
  client: RoborockClient;
  device: Device;
  onLogout: () => void;
}

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

  // Habitaciones REALES del mapa (nombre + id de segmento correcto para limpiar).
  useEffect(() => {
    client
      .getMappedRooms(device.duid)
      .then(setRooms)
      .catch(() => setRooms([]));
  }, [client, device.duid]);

  const refreshStatus = useCallback(async () => {
    setRefreshing(true);
    try {
      const s = await client.getStatus(device.duid);
      setStatus(s);
      setStatusText(summarizeStatus(s));
    } catch (e) {
      setStatusText("No se pudo obtener el estado: " + (e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [client, device.duid]);

  useEffect(() => {
    refreshStatus();
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
        setTimeout(refreshStatus, 1500);
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshStatus} />}
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
        <AccessibleButton label="Actualizar estado" variant="secondary" busy={busy} onPress={refreshStatus} />
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
