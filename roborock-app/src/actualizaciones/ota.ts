/**
 * Actualizaciones por aire (OTA) con expo-updates, pensadas para lector de pantalla.
 *
 * Problema que resuelve: por defecto expo-updates descarga y aplica en el siguiente arranque
 * EN SILENCIO, así que el usuario no se entera de que hay versión nueva ni de qué cambia.
 *
 * Flujo:
 *  1. Al abrir o volver a primer plano, se comprueba si hay actualización.
 *  2. Si la hay, se PREGUNTA con un diálogo accesible; solo se instala si el usuario acepta.
 *  3. Tras reiniciar con la versión nueva, se muestran las novedades una sola vez.
 */
import { useCallback, useEffect, useRef } from "react";
import { Alert, AppState } from "react-native";
import * as Updates from "expo-updates";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { anunciar, anunciarImportante } from "../accesibilidad/anuncios";
import { CHANGELOG_VERSION, notasNuevas } from "./novedades";

// Versión del changelog ya vista por el usuario (entero). Sustituye al viejo id de update, que
// solo permitía mostrar las novedades de la ÚLTIMA versión al saltar varias de golpe.
const SEEN_VERSION_KEY = "ota_last_seen_changelog_v";
const LEGACY_UPDATE_ID_KEY = "ota_last_seen_update_id"; // clave antigua, para migrar sin perder aviso

/**
 * Muestra TODAS las novedades desde la última versión que vio el usuario (no solo la última).
 * Guarda la versión del changelog ya vista; al abrir con un bundle más nuevo, enseña todo lo
 * acumulado entre medias. Migración: un usuario que venía de la versión antigua ve solo la entrada
 * más reciente una vez; una instalación nueva no ve nada (no hay historial que contarle).
 */
async function mostrarNovedadesSiActualizado(): Promise<void> {
  if (!Updates.isEnabled) return;
  try {
    const guardada = await AsyncStorage.getItem(SEEN_VERSION_KEY);
    let vistaV: number;
    if (guardada !== null) {
      vistaV = parseInt(guardada, 10) || 0;
    } else {
      // Sin la clave nueva: si existía la antigua, es un usuario que actualiza → mostrarle solo la
      // entrada más reciente. Si no, es instalación nueva → no mostrar nada.
      const veníaDeAntes = (await AsyncStorage.getItem(LEGACY_UPDATE_ID_KEY)) !== null;
      vistaV = veníaDeAntes ? CHANGELOG_VERSION - 1 : CHANGELOG_VERSION;
    }
    const notas = notasNuevas(vistaV);
    await AsyncStorage.setItem(SEEN_VERSION_KEY, String(CHANGELOG_VERSION));
    if (notas.length === 0) return;
    const cuerpo = notas.map((n) => `• ${n}`).join("\n");
    Alert.alert("App actualizada", `Novedades:\n\n${cuerpo}`, [{ text: "Entendido" }]);
  } catch {
    // Fallo leyendo/escribiendo: no es crítico, se ignora.
  }
}

/**
 * Comprueba si hay actualización y, si la hay, pregunta antes de instalar. `manual` = lanzado
 * por el usuario (entonces también se avisa cuando NO hay nada, para dar respuesta al botón).
 */
export async function comprobarActualizacion(manual = false): Promise<void> {
  if (!Updates.isEnabled) {
    if (manual) Alert.alert("Actualizaciones", "No disponibles en esta versión de la app.");
    return;
  }
  let disponible: boolean;
  try {
    const r = await Updates.checkForUpdateAsync();
    disponible = r.isAvailable;
  } catch {
    if (manual) Alert.alert("No se pudo comprobar", "Inténtalo de nuevo más tarde.");
    return;
  }
  if (!disponible) {
    if (manual) Alert.alert("Todo al día", "Ya tienes la última versión.");
    return;
  }
  Alert.alert(
    "Nueva versión disponible",
    "Hay una actualización lista. La app se reiniciará para aplicarla. ¿Instalar ahora?",
    [
      { text: "Ahora no", style: "cancel" },
      {
        text: "Instalar",
        onPress: async () => {
          try {
            anunciar("Descargando actualización…");
            await Updates.fetchUpdateAsync();
            await Updates.reloadAsync(); // reinicia con la versión nueva
          } catch (e) {
            anunciarImportante("No se pudo actualizar");
            Alert.alert("Error al actualizar", (e as Error).message);
          }
        },
      },
    ],
  );
}

/**
 * Engancha la comprobación al ciclo de vida: al montar (mostrando novedades si acabamos de
 * actualizar) y cada vez que la app vuelve a primer plano. Deduplica comprobaciones solapadas.
 */
export function useActualizacionesOTA(): void {
  const comprobando = useRef(false);
  const run = useCallback(async () => {
    if (comprobando.current) return;
    comprobando.current = true;
    try {
      await comprobarActualizacion(false);
    } finally {
      comprobando.current = false;
    }
  }, []);

  useEffect(() => {
    mostrarNovedadesSiActualizado();
    run();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") run();
    });
    return () => sub.remove();
  }, [run]);
}
