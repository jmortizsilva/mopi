/**
 * SettingsScreen — configuración accesible del robot.
 * Carga los ajustes reales y permite cambiarlos, con aviso de voz + vibración y detección
 * de errores del robot.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, useColorScheme, Vibration, View } from "react-native";
import {
  decodeConsumables,
  type DeviceCapabilities,
  firstNumber,
  resolveCapabilities,
  type Consumable,
  type Device,
  FAN_POWER_OPTIONS,
  MOP_MODE_OPTIONS,
  type RoborockClient,
  WATER_BOX_OPTIONS,
} from "../roborock";
import { AccessibleButton } from "../ui/AccessibleButton";
import { AdjustableStepper } from "../ui/AdjustableStepper";
import { OptionPicker, type PickerOption } from "../ui/OptionPicker";
import { ToggleRow } from "../ui/ToggleRow";

interface Props {
  client: RoborockClient;
  device: Device;
  onBack: () => void;
}

const WASH_TOWEL_OPTIONS: PickerOption[] = [
  { code: 0, label: "Ligero" },
  { code: 1, label: "Normal" },
  { code: 2, label: "Profundo" },
];

// Modo de limpieza (alto nivel). Se traduce a combinación de succión + agua.
// Nota: "Solo fregar" (cepillo levantado) NO lo soporta el Qrevo S5V (a170) — el robot
// acepta el comando pero no lo mantiene — así que no se ofrece.
const MODE_VAC_MOP = 0;
const MODE_VACUUM = 1;
const MODE_OPTIONS: PickerOption[] = [
  { code: MODE_VAC_MOP, label: "Aspirar y fregar" },
  { code: MODE_VACUUM, label: "Solo aspirar" },
];

interface UiSettings {
  fanPower: number | null;
  waterBox: number | null;
  mopMode: number | null;
  volume: number;
  dndEnabled: boolean;
  dndStartHour: number;
  dndEndHour: number;
  childLock: boolean;
  led: boolean;
  carpet: boolean;
  collision: boolean;
  mopAutoDry: boolean;
  dustSwitch: boolean;
  washTowel: number | null;
}

const two = (n: number) => String(n).padStart(2, "0");

export function SettingsScreen({ client, device, onBack }: Props) {
  const dark = useColorScheme() === "dark";
  const textColor = dark ? "#FFFFFF" : "#111111";
  const cardBg = dark ? "#1C1C1E" : "#F2F2F7";
  const accent = dark ? "#0A84FF" : "#0A62C2";
  const duid = device.duid;

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [s, setS] = useState<UiSettings | null>(null);
  const [consumables, setConsumables] = useState<Consumable[]>([]);
  // Capacidades del robot: se empieza sin nada y se resuelve al leer los ajustes, para no
  // construir controles de una función que este modelo no tiene (GUIA-ACCESIBILIDAD-RN.md §7).
  const [caps, setCaps] = useState<DeviceCapabilities>({ autoEmptyDock: false, mopDrying: false, mopWashStation: false });
  const volTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [status, dump] = await Promise.all([client.getStatus(duid), client.dumpSettings(duid)]);
      const g = (v: unknown) => (v && typeof v === "object" ? (v as any) : {});
      const arr0 = (v: unknown) => (Array.isArray(v) ? (v[0] as any) : g(v));
      const dnd = arr0(dump.dnd_timer);
      setS({
        fanPower: status.fanPower.code,
        waterBox: status.waterBox.code,
        mopMode: status.mopMode.code,
        volume: firstNumber(dump.sound_volume) ?? 100,
        dndEnabled: dnd?.enabled === 1,
        dndStartHour: dnd?.start_hour ?? 22,
        dndEndHour: dnd?.end_hour ?? 8,
        childLock: g(dump.child_lock).lock_status === 1,
        led: firstNumber(dump.led_status) === 1,
        carpet: arr0(dump.carpet_mode)?.enable === 1,
        collision: g(dump.collision_avoid).status === 1,
        mopAutoDry: g(dump.dryer_setting).status === 1,
        dustSwitch: g(dump.dust_collection_switch).status === 1,
        washTowel: g(dump.wash_towel_mode).wash_mode ?? null,
      });
      setConsumables(decodeConsumables(dump.consumables));
      setCaps(resolveCapabilities(client.modelFor(duid), dump));
    } catch (e) {
      setError("No se pudieron leer los ajustes: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [client, duid]);

  useEffect(() => {
    load();
  }, [load]);

  // Cambio optimista + comando + aviso/vibración + detección de error del robot.
  const change = useCallback(
    async (label: string, patch: Partial<UiSettings>, action: () => Promise<unknown>) => {
      if (Object.keys(patch).length) setS((prev) => (prev ? { ...prev, ...patch } : prev));
      setBusy(true);
      AccessibilityInfo.announceForAccessibility(`${label}…`);
      try {
        const result = await action();
        if (result && typeof result === "object" && "error" in (result as Record<string, unknown>)) {
          const err = (result as any).error;
          throw new Error(typeof err === "string" ? err : JSON.stringify(err));
        }
        Vibration.vibrate(60);
        AccessibilityInfo.announceForAccessibility(`${label}: hecho`);
      } catch (e) {
        Vibration.vibrate([0, 120, 80, 120]);
        AccessibilityInfo.announceForAccessibility(`${label}: error`);
        setError(`Error al cambiar ${label.toLowerCase()}: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const onVolumeChange = useCallback(
    (v: number) => {
      setS((prev) => (prev ? { ...prev, volume: v } : prev));
      if (volTimer.current) clearTimeout(volTimer.current);
      volTimer.current = setTimeout(() => change("Volumen", {}, () => client.setVolume(duid, v)), 500);
    },
    [change, client, duid],
  );

  // Modo de limpieza: lo traducimos a agua on/off + succión (109 = cepillo levantado).
  const selectMode = useCallback(
    (code: number) => {
      if (!s) return;
      const water = s.waterBox && s.waterBox > 200 ? s.waterBox : 202;
      if (code === MODE_VACUUM) {
        change("Modo solo aspirar", { waterBox: 200 }, () => client.setWaterBox(duid, 200));
      } else {
        const fixFan = s.fanPower === 105 || s.fanPower === 109;
        change("Modo aspirar y fregar", { waterBox: water, ...(fixFan ? { fanPower: 102 } : {}) }, async () => {
          if (fixFan) await client.setFanPower(duid, 102);
          await client.setWaterBox(duid, water);
        });
      }
    },
    [s, change, client, duid],
  );

  const confirmReset = useCallback(
    (c: Consumable) => {
      Alert.alert(
        `Reiniciar ${c.name}`,
        `¿Marcar "${c.name}" como nuevo (100%)? Hazlo solo si acabas de cambiarlo.`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Reiniciar",
            style: "destructive",
            onPress: async () => {
              await change(`Reiniciar ${c.name}`, {}, () => client.resetConsumable(duid, c.key));
              await load();
            },
          },
        ],
      );
    },
    [change, client, duid, load],
  );

  // Cabecera estilo iOS: "Volver" arriba a la izquierda y primero en el orden de lectura.
  // `onAccessibilityEscape` en la raíz atiende el gesto estándar de VoiceOver (rascar con dos
  // dedos) para retroceder.
  const header = (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Volver"
        hitSlop={10}
        style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.5 : 1 }]}
      >
        <Text style={[styles.backText, { color: accent }]}>‹ Volver</Text>
      </Pressable>
    </View>
  );

  if (loading || !s) {
    return (
      <View style={styles.root} onAccessibilityEscape={onBack}>
        {header}
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={{ color: textColor, marginTop: 12 }}>Leyendo ajustes…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root} onAccessibilityEscape={onBack}>
      {header}
      <ScrollView contentContainerStyle={styles.container}>
      <Text accessibilityRole="header" style={[styles.title, { color: textColor }]}>Configuración</Text>

      {/* Limpieza */}
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <Text accessibilityRole="header" style={[styles.section, { color: textColor }]}>Limpieza</Text>
        <OptionPicker
          label="Modo de limpieza"
          options={MODE_OPTIONS}
          value={s.waterBox === 200 ? MODE_VACUUM : MODE_VAC_MOP}
          disabled={busy}
          onSelect={selectMode}
        />
        <OptionPicker label="Potencia de aspirado" options={FAN_POWER_OPTIONS} value={s.fanPower} disabled={busy}
          onSelect={(c) => change("Potencia de aspirado", { fanPower: c }, () => client.setFanPower(duid, c))} />
        <OptionPicker label="Nivel de agua" options={WATER_BOX_OPTIONS} value={s.waterBox} disabled={busy}
          onSelect={(c) => change("Nivel de agua", { waterBox: c }, () => client.setWaterBox(duid, c))} />
        <OptionPicker label="Modo de fregado" options={MOP_MODE_OPTIONS} value={s.mopMode} disabled={busy}
          onSelect={(c) => change("Modo de fregado", { mopMode: c }, () => client.setMopMode(duid, c))} />
      </View>

      {/* Estación (base): solo se construye lo que este modelo tiene de verdad. */}
      {caps.mopDrying || caps.autoEmptyDock || caps.mopWashStation ? (
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text accessibilityRole="header" style={[styles.section, { color: textColor }]}>Estación (base)</Text>
          {caps.mopDrying ? (
            <ToggleRow label="Secado automático de mopa" value={s.mopAutoDry} disabled={busy}
              hint="Seca las mopas automáticamente tras fregar"
              onValueChange={(v) => change("Secado automático", { mopAutoDry: v }, () => client.setMopAutoDry(duid, v))} />
          ) : null}
          {caps.autoEmptyDock ? (
            <ToggleRow label="Auto-vaciado del polvo" value={s.dustSwitch} disabled={busy}
              onValueChange={(v) => change("Auto-vaciado", { dustSwitch: v }, () => client.setDustSwitch(duid, v))} />
          ) : null}
          {caps.mopWashStation ? (
            <OptionPicker label="Intensidad de lavado de mopa" options={WASH_TOWEL_OPTIONS} value={s.washTowel} disabled={busy}
              onSelect={(c) => change("Lavado de mopa", { washTowel: c }, () => client.setWashTowelMode(duid, c))} />
          ) : null}
        </View>
      ) : null}

      {/* Comportamiento */}
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <Text accessibilityRole="header" style={[styles.section, { color: textColor }]}>Comportamiento</Text>
        <AdjustableStepper label="Volumen" value={s.volume} min={0} max={100} step={5} disabled={busy}
          format={(v) => `${v}%`} onChange={onVolumeChange} />
        <ToggleRow label="Bloqueo infantil" value={s.childLock} disabled={busy}
          onValueChange={(v) => change("Bloqueo infantil", { childLock: v }, () => client.setChildLock(duid, v))} />
        <ToggleRow label="Luz indicadora (LED)" value={s.led} disabled={busy}
          onValueChange={(v) => change("LED", { led: v }, () => client.setLed(duid, v))} />
        <ToggleRow label="Refuerzo en alfombra" value={s.carpet} disabled={busy}
          onValueChange={(v) => change("Modo alfombra", { carpet: v }, () => client.setCarpetMode(duid, v))} />
        <ToggleRow label="Evitar obstáculos (cámara)" value={s.collision} disabled={busy}
          onValueChange={(v) => change("Evitar obstáculos", { collision: v }, () => client.setCollisionAvoid(duid, v))} />
      </View>

      {/* No molestar */}
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <Text accessibilityRole="header" style={[styles.section, { color: textColor }]}>No molestar</Text>
        <ToggleRow label="Activado" value={s.dndEnabled} disabled={busy}
          onValueChange={(v) =>
            change("No molestar", { dndEnabled: v }, () => (v ? client.setDnd(duid, s.dndStartHour, 0, s.dndEndHour, 0) : client.closeDnd(duid)))
          } />
        <AdjustableStepper label="Hora de inicio" value={s.dndStartHour} min={0} max={23} step={1} disabled={busy}
          format={(v) => `${two(v)}:00`} onChange={(v) => setS((p) => (p ? { ...p, dndStartHour: v } : p))} />
        <AdjustableStepper label="Hora de fin" value={s.dndEndHour} min={0} max={23} step={1} disabled={busy}
          format={(v) => `${two(v)}:00`} onChange={(v) => setS((p) => (p ? { ...p, dndEndHour: v } : p))} />
        <AccessibleButton label="Guardar horario" variant="secondary" busy={busy}
          hint={`No molestar de ${two(s.dndStartHour)}:00 a ${two(s.dndEndHour)}:00`}
          onPress={() => change("Horario de No molestar", { dndEnabled: true }, () => client.setDnd(duid, s.dndStartHour, 0, s.dndEndHour, 0))} />
      </View>

      {/* Consumibles */}
      {consumables.length > 0 ? (
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text accessibilityRole="header" style={[styles.section, { color: textColor }]}>Consumibles</Text>
          {consumables.map((c) => (
            <View key={c.key} style={styles.consumableRow}>
              <Text style={[styles.consumable, { color: textColor }]}>{c.name}: {c.percentLeft}% de vida</Text>
              <AccessibleButton label={`Reiniciar ${c.name}`} variant="secondary" busy={busy} onPress={() => confirmReset(c)} />
            </View>
          ))}
        </View>
      ) : null}

      {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}

        <AccessibleButton label="Recargar ajustes" variant="secondary" busy={busy} onPress={load} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 8, paddingTop: 4, paddingBottom: 2 },
  backBtn: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 6 },
  backText: { fontSize: 18, fontWeight: "600" },
  container: { padding: 16, gap: 14 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 26, fontWeight: "700" },
  card: { borderRadius: 14, padding: 16 },
  section: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  consumableRow: { paddingVertical: 6 },
  consumable: { fontSize: 16, marginBottom: 2 },
  error: { color: "#B00020", fontSize: 16, fontWeight: "600" },
});
