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
import { NOVEDADES } from "./novedades";

const LAST_SEEN_KEY = "ota_last_seen_update_id";

/**
 * Tras aplicar una actualización, muestra las novedades una única vez. Compara el id del update
 * en marcha con el último visto (guardado en el dispositivo). En la primera instalación solo
 * memoriza el id, sin avisar (no hay "novedades" que contar todavía).
 */
async function mostrarNovedadesSiActualizado(): Promise<void> {
  if (!Updates.isEnabled || !Updates.updateId) return;
  try {
    const actual = Updates.updateId;
    const visto = await AsyncStorage.getItem(LAST_SEEN_KEY);
    if (visto === actual) return;
    await AsyncStorage.setItem(LAST_SEEN_KEY, actual);
    if (visto === null) return; // primera vez: nada que contar
    Alert.alert("App actualizada", `Novedades:\n\n${NOVEDADES}`, [{ text: "Entendido" }]);
  } catch {
    // Fallo leyendo/escribiendo el id: no es crítico, se ignora.
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
