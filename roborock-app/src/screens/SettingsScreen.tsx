/**
 * SettingsScreen — configuración accesible del robot.
 * Carga los ajustes reales y permite cambiarlos, con aviso de voz + vibración y detección
 * de errores del robot.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Share, StyleSheet, Text, useColorScheme, Vibration, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { anunciar, anunciarImportante } from "../accesibilidad/anuncios";
import { comprobarActualizacion } from "../actualizaciones/ota";
import { estaGrabando, finalizarPrueba, iniciarPrueba } from "../registro/log";
import type { RootStackParamList } from "../navigation";
import {
  decodeConsumables,
  type DeviceCapabilities,
  detectarModo,
  FAN_POWER_LABELS,
  firstNumber,
  MODOS,
  type ModoLimpieza,
  MOP_MODE_LABELS,
  opcionesModo,
  planCambioModo,
  resolveCapabilities,
  type Consumable,
  type Device,
  type RoborockClient,
  WATER_BOX_OPTIONS,
} from "../roborock";
import { AccessibleButton } from "../ui/AccessibleButton";
import { AdjustableStepper } from "../ui/AdjustableStepper";
import { OptionPicker, type PickerOption } from "../ui/OptionPicker";
import { ToggleRow } from "../ui/ToggleRow";

type Props = NativeStackScreenProps<RootStackParamList, "Settings"> & {
  client: RoborockClient;
  device: Device;
};

const WASH_TOWEL_OPTIONS: PickerOption[] = [
  { code: 0, label: "Ligero" },
  { code: 1, label: "Normal" },
  { code: 2, label: "Profundo" },
];

// Modo de limpieza: los 3 modos reales del a170. El OptionPicker usa el índice como código.
const MODO_ORDEN: ModoLimpieza[] = MODOS.map((m) => m.modo);
const MODE_OPTIONS: PickerOption[] = MODOS.map((m, i) => ({ code: i, label: m.label }));

/** Construye opciones {code,label} para el selector a partir de una lista de códigos y su tabla. */
const opcionesDe = (codes: number[], labels: Record<number, string>): PickerOption[] =>
  codes.map((code) => ({ code, label: labels[code] ?? `Código ${code}` }));


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
  // Funciones avanzadas (interruptores). Solo se muestran si el modelo las admite.
  stretchTag: boolean;
  petDeepClean: boolean;
  carpetDeepClean: boolean;
}

// Disponibilidad de las funciones avanzadas en este modelo (según el sondeo).
interface AvanzadasDisponibles {
  stretchTag: boolean;
  petDeepClean: boolean;
  carpetDeepClean: boolean;
}

const two = (n: number) => String(n).padStart(2, "0");

/** Interpreta una respuesta de interruptor {status}: disponible si trae ese campo. */
function leerStatus(v: unknown): { disponible: boolean; on: boolean } {
  const o = Array.isArray(v) ? v[0] : v;
  if (o && typeof o === "object" && "status" in (o as Record<string, unknown>)) {
    return { disponible: true, on: (o as { status: unknown }).status === 1 };
  }
  return { disponible: false, on: false };
}

export function SettingsScreen({ client, device }: Props) {
  const dark = useColorScheme() === "dark";
  const textColor = dark ? "#FFFFFF" : "#111111";
  const cardBg = dark ? "#1C1C1E" : "#F2F2F7";
  const duid = device.duid;

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [s, setS] = useState<UiSettings | null>(null);
  const [consumables, setConsumables] = useState<Consumable[]>([]);
  // Capacidades del robot: se empieza sin nada y se resuelve al leer los ajustes, para no
  // construir controles de una función que este modelo no tiene (GUIA-ACCESIBILIDAD-RN.md §7).
  const [caps, setCaps] = useState<DeviceCapabilities>({ autoEmptyDock: false, mopDrying: false, mopWashStation: false });
  const [adv, setAdv] = useState<AvanzadasDisponibles>({ stretchTag: false, petDeepClean: false, carpetDeepClean: false });
  const volTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Registro de pruebas: el estado real vive en el módulo (persiste entre pantallas); aquí solo
  // reflejamos si está activo para el botón. Al montar, leemos el estado actual.
  const [grabando, setGrabando] = useState(estaGrabando());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [status, dump, stretch, pet, carpet] = await Promise.all([
        client.getStatus(duid),
        client.dumpSettings(duid),
        client.getStretchTag(duid).catch(() => null),
        client.getPetDeepClean(duid).catch(() => null),
        client.getCarpetDeepClean(duid).catch(() => null),
      ]);
      const g = (v: unknown) => (v && typeof v === "object" ? (v as any) : {});
      const arr0 = (v: unknown) => (Array.isArray(v) ? (v[0] as any) : g(v));
      const dnd = arr0(dump.dnd_timer);
      const st = leerStatus(stretch);
      const pt = leerStatus(pet);
      const cp = leerStatus(carpet);
      setAdv({ stretchTag: st.disponible, petDeepClean: pt.disponible, carpetDeepClean: cp.disponible });
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
        stretchTag: st.on,
        petDeepClean: pt.on,
        carpetDeepClean: cp.on,
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
  // `silent` evita el aviso de voz cuando el propio control ya lee su nuevo valor (ajustables),
  // para no decirlo dos veces (guía §2). Los errores se anuncian siempre.
  const change = useCallback(
    async (
      label: string,
      patch: Partial<UiSettings>,
      action: () => Promise<unknown>,
      opts?: { silent?: boolean; reconcile?: boolean },
    ) => {
      if (Object.keys(patch).length) setS((prev) => (prev ? { ...prev, ...patch } : prev));
      setBusy(true);
      if (!opts?.silent) anunciar(`${label}…`);
      try {
        const result = await action();
        if (result && typeof result === "object" && "error" in (result as Record<string, unknown>)) {
          const err = (result as any).error;
          throw new Error(typeof err === "string" ? err : JSON.stringify(err));
        }
        Vibration.vibrate(60);
        // Verificación en caliente: releer el estado y reflejar lo que el robot MANTUVO de verdad
        // (algunas combinaciones no las conserva: Máximo+ al fregar, ruta profunda que baja la
        // succión…). Si difiere de lo pedido, se avisa y la interfaz muestra el valor real.
        if (opts?.reconcile) {
          await new Promise((r) => setTimeout(r, 700)); // dar tiempo a que el robot lo aplique
          const st = await client.getStatus(duid);
          setS((prev) => (prev ? { ...prev, fanPower: st.fanPower.code, waterBox: st.waterBox.code, mopMode: st.mopMode.code } : prev));
          const avisos: string[] = [];
          if (patch.fanPower != null && st.fanPower.code !== patch.fanPower) avisos.push(`succión: ${st.fanPower.label}`);
          if (patch.waterBox != null && st.waterBox.code !== patch.waterBox) avisos.push(`agua: ${st.waterBox.label}`);
          if (patch.mopMode != null && st.mopMode.code !== patch.mopMode) avisos.push(`fregado: ${st.mopMode.label}`);
          if (avisos.length) anunciarImportante(`El robot lo dejó en ${avisos.join(", ")}.`);
          else if (!opts?.silent) anunciarImportante(`${label}: hecho`);
        } else if (!opts?.silent) {
          anunciarImportante(`${label}: hecho`);
        }
      } catch (e) {
        Vibration.vibrate([0, 120, 80, 120]);
        anunciarImportante(`${label}: error`);
        setError(`Error al cambiar ${label.toLowerCase()}: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [client, duid],
  );

  const onVolumeChange = useCallback(
    (v: number) => {
      setS((prev) => (prev ? { ...prev, volume: v } : prev));
      if (volTimer.current) clearTimeout(volTimer.current);
      // silent: el propio control ajustable ya lee "85%" al deslizar; no lo repitas por voz.
      volTimer.current = setTimeout(() => change("Volumen", {}, () => client.setVolume(duid, v), { silent: true }), 500);
    },
    [change, client, duid],
  );

  // Modo de limpieza: cada modo se traduce a la combinación de agua + succión que el a170
  // codifica de verdad (ver planCambioModo). El robot puede reajustar (ruta profunda ⟺ succión
  // mínima); la verificación en caliente lo refleja.
  const selectMode = useCallback(
    (index: number) => {
      if (!s) return;
      const modo = MODO_ORDEN[index];
      const plan = planCambioModo(modo, s.waterBox, s.fanPower);
      const label = MODOS[index].label;
      const patch: Partial<UiSettings> = {};
      if (plan.waterBox != null) patch.waterBox = plan.waterBox;
      if (plan.fanPower != null) patch.fanPower = plan.fanPower;
      change(
        `Modo ${label}`,
        patch,
        async () => {
          // Succión primero: en el a170, fijar la succión resetea la ruta de fregado a estándar.
          if (plan.fanPower != null) await client.setFanPower(duid, plan.fanPower);
          if (plan.waterBox != null) await client.setWaterBox(duid, plan.waterBox);
        },
        { reconcile: true },
      );
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

  // Diagnóstico: lee el estado CRUDO del robot y muestra los campos que deciden aspirar/fregar.
  // Sirve para depurar el modo de limpieza pulsándolo mientras el robot limpia.
  const verEstadoTecnico = useCallback(async () => {
    try {
      const raw = await client.getStatusRaw(duid);
      const r = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown>;
      const campos = ["state", "fan_power", "water_box_mode", "mop_mode", "in_cleaning", "water_shortage_status"];
      const resumen = campos.map((k) => `${k}: ${r?.[k]}`).join("\n");
      Alert.alert("Estado técnico", `${resumen}\n\nCompleto:\n${JSON.stringify(r)}`);
    } catch (e) {
      Alert.alert("Estado técnico", "No se pudo leer: " + (e as Error).message);
    }
  }, [client, duid]);

  // Registro de pruebas: graba todos los comandos y respuestas y los comparte como texto.
  const iniciarRegistro = useCallback(() => {
    iniciarPrueba({ Modelo: client.modelFor(duid) ?? "desconocido", App: "Mopi" });
    setGrabando(true);
    anunciarImportante("Registro iniciado. Haz las pruebas y vuelve aquí para finalizar y compartir.");
  }, [client, duid]);

  const finalizarRegistro = useCallback(async () => {
    const texto = finalizarPrueba();
    setGrabando(false);
    try {
      await Share.share({ message: texto });
    } catch {
      Alert.alert("Registro de pruebas", "No se pudo abrir la ventana de compartir.");
    }
  }, []);

  // Sondea las funciones avanzadas del robot (solo lectura) y comparte el resultado, para saber
  // cuales admite este modelo antes de ofrecer sus controles.
  const sondearAvanzadas = useCallback(async () => {
    try {
      const dump = await client.dumpAdvanced(duid);
      const texto =
        `=== Funciones avanzadas (${client.modelFor(duid) ?? "?"}) ===\n` +
        Object.entries(dump)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join("\n");
      await Share.share({ message: texto });
    } catch (e) {
      Alert.alert("Sondeo", "No se pudo: " + (e as Error).message);
    }
  }, [client, duid]);

  // El botón de volver, el gesto de escape de VoiceOver, el foco y el sonido de cambio de
  // pantalla los da la cabecera NATIVA de la pila (configurada en App.tsx). Aquí no hay que
  // maquetar nada de eso.
  if (loading || !s) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={{ color: textColor, marginTop: 12 }}>Leyendo ajustes…</Text>
      </View>
    );
  }

  // Modo actual (detectado del estado) y qué controles/opciones ofrece.
  const modo = detectarModo(s.fanPower, s.waterBox);
  const opc = opcionesModo(modo);
  const fanOptions = opcionesDe(opc.fanCodes, FAN_POWER_LABELS);
  const rutaOptions = opcionesDe(opc.rutaCodes, MOP_MODE_LABELS);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Limpieza */}
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <Text accessibilityRole="header" style={[styles.section, { color: textColor }]}>Limpieza</Text>
        <OptionPicker
          label="Modo de limpieza"
          options={MODE_OPTIONS}
          value={MODO_ORDEN.indexOf(modo)}
          disabled={busy}
          onSelect={selectMode}
        />
        {opc.mostrarSuccion ? (
          <OptionPicker label="Potencia de aspirado" options={fanOptions} value={s.fanPower} disabled={busy}
            onSelect={(c) => change("Potencia de aspirado", { fanPower: c }, () => client.setFanPower(duid, c), { reconcile: true })} />
        ) : null}
        {opc.succionFija ? (
          <Text style={[styles.nota, { color: textColor }]}>En "solo fregar" la succión es mínima (la fija el robot).</Text>
        ) : null}
        {opc.mostrarAgua ? (
          <OptionPicker label="Nivel de agua" options={WATER_BOX_OPTIONS} value={s.waterBox} disabled={busy}
            onSelect={(c) => change("Nivel de agua", { waterBox: c }, () => client.setWaterBox(duid, c), { reconcile: true })} />
        ) : null}
        {opc.mostrarRuta ? (
          <OptionPicker label="Modo de fregado" options={rutaOptions} value={s.mopMode} disabled={busy}
            onSelect={(c) => change("Modo de fregado", { mopMode: c }, () => client.setMopMode(duid, c), { reconcile: true })} />
        ) : null}
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

          {/* Acciones manuales de la estación (arrancar ahora, no ajustes). */}
          {caps.mopDrying ? (
            <>
              <AccessibleButton label="Secar mopa ahora" variant="secondary" busy={busy}
                onPress={() => change("Secar mopa", {}, () => client.setDryerStatus(duid, true))} />
              <AccessibleButton label="Parar secado" variant="secondary" busy={busy}
                onPress={() => change("Parar secado", {}, () => client.setDryerStatus(duid, false))} />
            </>
          ) : null}
          {caps.mopWashStation ? (
            <>
              <AccessibleButton label="Lavar mopa ahora" variant="secondary" busy={busy}
                onPress={() => change("Lavar mopa", {}, () => client.startWash(duid))} />
              <AccessibleButton label="Parar lavado" variant="secondary" busy={busy}
                onPress={() => change("Parar lavado", {}, () => client.stopWash(duid))} />
              <AccessibleButton label="Ir a la base a lavar la mopa" variant="secondary" busy={busy}
                hint="El robot vuelve a la base, lava la mopa y se pone a cargar"
                onPress={() => change("Ir a lavar la mopa", {}, () => client.washThenCharge(duid))} />
            </>
          ) : null}
        </View>
      ) : null}

      {/* Limpieza avanzada: solo lo que este modelo admite (detectado por sondeo). */}
      {adv.stretchTag || adv.petDeepClean || adv.carpetDeepClean ? (
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text accessibilityRole="header" style={[styles.section, { color: textColor }]}>Limpieza avanzada</Text>
          {adv.stretchTag ? (
            <ToggleRow label="Fregado extensivo (bordes y esquinas)" value={s.stretchTag} disabled={busy}
              hint="La mopa se extiende hacia la pared para limpiar bordes y esquinas"
              onValueChange={(v) => change("Fregado extensivo", { stretchTag: v }, () => client.setStretchTag(duid, v))} />
          ) : null}
          {adv.petDeepClean ? (
            <ToggleRow label="Limpieza profunda en comederos" value={s.petDeepClean} disabled={busy}
              hint="Refuerza la limpieza alrededor de los comederos de mascotas"
              onValueChange={(v) => change("Limpieza de comederos", { petDeepClean: v }, () => client.setPetDeepClean(duid, v))} />
          ) : null}
          {adv.carpetDeepClean ? (
            <ToggleRow label="Limpieza profunda de alfombra" value={s.carpetDeepClean} disabled={busy}
              onValueChange={(v) => change("Limpieza de alfombra", { carpetDeepClean: v }, () => client.setCarpetDeepClean(duid, v))} />
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

      {/* Diagnóstico */}
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <Text accessibilityRole="header" style={[styles.section, { color: textColor }]}>Diagnóstico</Text>
        {grabando ? (
          <>
            <Text style={[styles.consumable, { color: textColor }]}>
              Registrando pruebas… Haz los pasos indicados (aunque cambies de pantalla) y vuelve aquí para finalizar.
            </Text>
            <AccessibleButton label="Finalizar y compartir registro" busy={busy}
              hint="Cierra la grabación y abre la ventana para enviarme el registro"
              onPress={finalizarRegistro} />
          </>
        ) : (
          <>
            <Text style={[styles.consumable, { color: textColor }]}>
              Para depurar los modos de limpieza. Inicia el registro, haz las pruebas que te indique y comparte el resultado.
            </Text>
            <AccessibleButton label="Iniciar registro de pruebas" variant="secondary"
              hint="Empieza a grabar los comandos y respuestas del robot"
              onPress={iniciarRegistro} />
          </>
        )}
        <AccessibleButton label="Ver estado técnico" variant="secondary" busy={busy}
          hint="Muestra los valores crudos del robot: succión, agua y fregado"
          onPress={verEstadoTecnico} />
        <AccessibleButton label="Sondear funciones avanzadas" variant="secondary" busy={busy}
          hint="Lee qué funciones avanzadas admite tu robot y comparte el resultado"
          onPress={sondearAvanzadas} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <AccessibleButton label="Recargar ajustes" variant="secondary" busy={busy} onPress={load} />
      <AccessibleButton label="Buscar actualizaciones" variant="secondary" hint="Comprueba si hay una versión nueva de la app"
        onPress={() => comprobarActualizacion(true)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: { borderRadius: 14, padding: 16 },
  section: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  consumableRow: { paddingVertical: 6 },
  consumable: { fontSize: 16, marginBottom: 2 },
  nota: { fontSize: 14, opacity: 0.8, marginTop: 2, marginBottom: 4 },
  error: { color: "#B00020", fontSize: 16, fontWeight: "600" },
});
