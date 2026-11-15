/**
 * EditarProgramacionScreen — crear una programación o editar una existente.
 *
 * No habla con el robot hasta pulsar Guardar: los ajustables cambian solo el borrador. Por eso
 * no reutiliza LimpiezaAjustes de Inicio, que manda cada cambio al robot al momento.
 */
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, useColorScheme, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation";
import { anunciarImportante } from "../accesibilidad/anuncios";
import {
  anuncioGuardada,
  borradorConModo,
  borradorDe,
  borradorNuevo,
  decodeFeatures,
  detectarModo,
  entradaFeatures,
  FAN_POWER_LABELS,
  MODOS,
  MOP_MODE_LABELS,
  opcionesModo,
  validarBorrador,
  WATER_BOX_OPTIONS,
  type BorradorProgramacion,
  type Device,
  type RoborockClient,
} from "../roborock";
import { AccessibleButton } from "../ui/AccessibleButton";
import { AdjustableOpciones, type OpcionAjustable } from "../ui/AdjustableOpciones";
import { AdjustableStepper } from "../ui/AdjustableStepper";
import { ToggleRow } from "../ui/ToggleRow";

type Props = NativeStackScreenProps<RootStackParamList, "EditarProgramacion"> & {
  client: RoborockClient;
  device: Device;
};

// De lunes a domingo, con su día de cron (0 = domingo).
const DIAS: { cron: number; label: string }[] = [
  { cron: 1, label: "Lunes" },
  { cron: 2, label: "Martes" },
  { cron: 3, label: "Miércoles" },
  { cron: 4, label: "Jueves" },
  { cron: 5, label: "Viernes" },
  { cron: 6, label: "Sábado" },
  { cron: 0, label: "Domingo" },
];

const MODO_ORDEN = MODOS.map((m) => m.modo);
const MODE_OPTIONS: OpcionAjustable[] = MODOS.map((m, i) => ({ code: i, label: m.label }));
const opcionesDe = (codes: number[], labels: Record<number, string>): OpcionAjustable[] =>
  codes.map((code) => ({ code, label: labels[code] ?? `Código ${code}` }));

export function EditarProgramacionScreen({ client, device, navigation, route }: Props) {
  const dark = useColorScheme() === "dark";
  const cardBg = dark ? "#1C1C1E" : "#F2F2F7";
  const original = route.params?.programacion;

  const [b, setB] = useState<BorradorProgramacion>(() => (original ? borradorDe(original) : borradorNuevo()));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rasgos = useMemo(() => decodeFeatures(entradaFeatures(device.newFeatureSet)), [device.newFeatureSet]);

  const cambiar = (patch: Partial<BorradorProgramacion>) => setB((x) => ({ ...x, ...patch }));
  const alternarDia = (cron: number, on: boolean) =>
    setB((x) => ({ ...x, dias: on ? [...x.dias, cron] : x.dias.filter((d) => d !== cron) }));

  const guardar = async () => {
    const invalido = validarBorrador(b);
    if (invalido) {
      setError(invalido);
      anunciarImportante(invalido);
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      if (original) await client.editarProgramacion(device.duid, original, b);
      else await client.crearProgramacion(device.duid, b);
      anunciarImportante(anuncioGuardada(b));
      navigation.goBack();
    } catch {
      setError("No se pudo guardar.");
      anunciarImportante("No se pudo guardar.");
      setGuardando(false);
    }
  };

  const modo = detectarModo(b.fanPower, b.waterBox);
  const opc = opcionesModo(modo);
  // Mismo filtro que Inicio: solo las rutas que este modelo admite.
  const rutaCodes = opc.rutaCodes.filter(
    (c) => (c !== 304 || rasgos.fastRoute !== false) && (c !== 303 || rasgos.deepPlusRoute === true),
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <AdjustableStepper label="Hora" value={b.hora} min={0} max={23} step={1} onChange={(v) => cambiar({ hora: v })} />
        <AdjustableStepper label="Minutos" value={b.minuto} min={0} max={55} step={5} onChange={(v) => cambiar({ minuto: v })} />
      </View>

      <View style={[styles.card, { backgroundColor: cardBg }]}>
        {DIAS.map((d) => (
          <ToggleRow key={d.cron} label={d.label} value={b.dias.includes(d.cron)} onValueChange={(on) => alternarDia(d.cron, on)} />
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <AdjustableOpciones
          label="Modo de limpieza"
          options={MODE_OPTIONS}
          value={MODO_ORDEN.indexOf(modo)}
          onChange={(i) => setB((x) => borradorConModo(x, MODO_ORDEN[i]))}
        />
        {opc.mostrarSuccion ? (
          <AdjustableOpciones label="Potencia de aspirado" options={opcionesDe(opc.fanCodes, FAN_POWER_LABELS)} value={b.fanPower}
            onChange={(c) => cambiar({ fanPower: c })} />
        ) : null}
        {opc.mostrarAgua ? (
          <AdjustableOpciones label="Nivel de agua" options={WATER_BOX_OPTIONS} value={b.waterBox}
            onChange={(c) => cambiar({ waterBox: c })} />
        ) : null}
        {opc.mostrarRuta ? (
          <AdjustableOpciones label="Modo de fregado" options={opcionesDe(rutaCodes, MOP_MODE_LABELS)} value={b.mopMode}
            onChange={(c) => cambiar({ mopMode: c })} />
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <AccessibleButton label="Guardar" busy={guardando} onPress={guardar} />
      <AccessibleButton label="Cancelar" variant="secondary" disabled={guardando} onPress={() => navigation.goBack()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14 },
  card: { borderRadius: 14, padding: 16 },
  error: { color: "#B00020", fontSize: 16, fontWeight: "600" },
});
