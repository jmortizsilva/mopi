/**
 * LimpiezaAjustes — sección "Limpieza" reutilizable (modo + succión/agua/ruta) con ajustables.
 *
 * Autónomo: lee el estado del robot al montar para saber el modo actual, decodifica las
 * capacidades del modelo (feature flags del home data) y ofrece solo lo válido. Cada cambio es
 * optimista + amortiguado (para no mandar una orden en cada deslizamiento del ajustable) + con
 * verificación en caliente (relee y avisa si el robot no mantuvo lo pedido).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, useColorScheme, Vibration, View } from "react-native";
import { anunciar, anunciarImportante } from "../accesibilidad/anuncios";
import { AdjustableOpciones, type OpcionAjustable } from "./AdjustableOpciones";
import {
  decodeFeatures,
  detectarModo,
  entradaFeatures,
  FAN_POWER_LABELS,
  MODOS,
  MOP_MODE_LABELS,
  opcionesModo,
  planCambioModo,
  WATER_BOX_OPTIONS,
  type Device,
  type RasgosDispositivo,
  type RoborockClient,
} from "../roborock";

interface Props {
  client: RoborockClient;
  device: Device;
}

interface Ajustes {
  fanPower: number | null;
  waterBox: number | null;
  mopMode: number | null;
}

const MODO_ORDEN = MODOS.map((m) => m.modo);
const MODE_OPTIONS: OpcionAjustable[] = MODOS.map((m, i) => ({ code: i, label: m.label }));
const opcionesDe = (codes: number[], labels: Record<number, string>): OpcionAjustable[] =>
  codes.map((code) => ({ code, label: labels[code] ?? `Código ${code}` }));

export function LimpiezaAjustes({ client, device }: Props) {
  const dark = useColorScheme() === "dark";
  const textColor = dark ? "#FFFFFF" : "#111111";
  const cardBg = dark ? "#1C1C1E" : "#F2F2F7";
  const duid = device.duid;

  const [s, setS] = useState<Ajustes | null>(null);
  const [busy, setBusy] = useState(false);
  const [rasgos, setRasgos] = useState<RasgosDispositivo | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const st = await client.getStatus(duid);
        if (!vivo) return;
        setS({ fanPower: st.fanPower.code, waterBox: st.waterBox.code, mopMode: st.mopMode.code });
        setRasgos(decodeFeatures(entradaFeatures(device.newFeatureSet)));
      } catch {
        // Si falla, la sección se queda cargando; Inicio ya muestra el error de estado general.
      }
    })();
    const t = timers.current;
    return () => {
      vivo = false;
      Object.values(t).forEach(clearTimeout);
    };
  }, [client, duid, device.newFeatureSet]);

  // Envía el/los comando(s), releyendo después para reflejar lo que el robot mantuvo de verdad.
  const aplicar = useCallback(
    async (label: string, pedido: Partial<Ajustes>, accion: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await accion();
        Vibration.vibrate(60);
        await new Promise((r) => setTimeout(r, 700)); // dar tiempo a que el robot lo aplique
        const st = await client.getStatus(duid);
        const real: Ajustes = { fanPower: st.fanPower.code, waterBox: st.waterBox.code, mopMode: st.mopMode.code };
        setS(real);
        const avisos: string[] = [];
        if (pedido.fanPower != null && real.fanPower !== pedido.fanPower) avisos.push(`succión: ${st.fanPower.label}`);
        if (pedido.waterBox != null && real.waterBox !== pedido.waterBox) avisos.push(`agua: ${st.waterBox.label}`);
        if (pedido.mopMode != null && real.mopMode !== pedido.mopMode) avisos.push(`fregado: ${st.mopMode.label}`);
        if (avisos.length) anunciarImportante(`El robot lo dejó en ${avisos.join(", ")}.`);
      } catch (e) {
        anunciarImportante("No se pudo cambiar el ajuste");
        console.warn("LimpiezaAjustes:", (e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [client, duid],
  );

  // Cambio optimista + amortiguado: la interfaz responde ya y el comando se manda tras una pausa.
  const cambiar = useCallback(
    (clave: string, patch: Partial<Ajustes>, label: string, pedido: Partial<Ajustes>, accion: () => Promise<unknown>) => {
      setS((prev) => (prev ? { ...prev, ...patch } : prev));
      if (timers.current[clave]) clearTimeout(timers.current[clave]);
      timers.current[clave] = setTimeout(() => aplicar(label, pedido, accion), 500);
    },
    [aplicar],
  );

  const selectMode = useCallback(
    (index: number) => {
      if (!s) return;
      const modo = MODO_ORDEN[index];
      const plan = planCambioModo(modo, s.waterBox, s.fanPower);
      const patch: Partial<Ajustes> = {};
      if (plan.waterBox != null) patch.waterBox = plan.waterBox;
      if (plan.fanPower != null) patch.fanPower = plan.fanPower;
      cambiar("modo", patch, `Modo ${MODOS[index].label}`, patch, async () => {
        if (plan.fanPower != null) await client.setFanPower(duid, plan.fanPower);
        if (plan.waterBox != null) await client.setWaterBox(duid, plan.waterBox);
      });
    },
    [s, cambiar, client, duid],
  );

  if (!s) {
    return (
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <Text accessibilityRole="header" style={[styles.section, { color: textColor }]}>Limpieza</Text>
        <Text style={{ color: textColor }}>Cargando ajustes de limpieza…</Text>
      </View>
    );
  }

  const modo = detectarModo(s.fanPower, s.waterBox);
  const opc = opcionesModo(modo);
  const fanOptions = opcionesDe(opc.fanCodes, FAN_POWER_LABELS);
  const rutaCodes = opc.rutaCodes.filter(
    (c) => (c !== 304 || rasgos?.fastRoute !== false) && (c !== 303 || rasgos?.deepPlusRoute === true),
  );
  const rutaOptions = opcionesDe(rutaCodes, MOP_MODE_LABELS);

  return (
    <View style={[styles.card, { backgroundColor: cardBg }]}>
      <Text accessibilityRole="header" style={[styles.section, { color: textColor }]}>Limpieza</Text>
      <AdjustableOpciones label="Modo de limpieza" options={MODE_OPTIONS} value={MODO_ORDEN.indexOf(modo)} disabled={busy} onChange={selectMode} />
      {opc.mostrarSuccion ? (
        <AdjustableOpciones label="Potencia de aspirado" options={fanOptions} value={s.fanPower} disabled={busy}
          onChange={(c) => cambiar("fan", { fanPower: c }, "Potencia de aspirado", { fanPower: c }, () => client.setFanPower(duid, c))} />
      ) : null}
      {opc.succionFija ? (
        <Text style={[styles.nota, { color: textColor }]}>En "solo fregar" la succión es mínima (la fija el robot).</Text>
      ) : null}
      {opc.mostrarAgua ? (
        <AdjustableOpciones label="Nivel de agua" options={WATER_BOX_OPTIONS} value={s.waterBox} disabled={busy}
          onChange={(c) => cambiar("agua", { waterBox: c }, "Nivel de agua", { waterBox: c }, () => client.setWaterBox(duid, c))} />
      ) : null}
      {opc.mostrarRuta ? (
        <AdjustableOpciones label="Modo de fregado" options={rutaOptions} value={s.mopMode} disabled={busy}
          onChange={(c) => cambiar("ruta", { mopMode: c }, "Modo de fregado", { mopMode: c }, () => client.setMopMode(duid, c))} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 16 },
  section: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  nota: { fontSize: 14, opacity: 0.8, marginTop: 2, marginBottom: 4 },
});
