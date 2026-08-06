/**
 * commands — constantes y listas de opciones para la capa de UI.
 *
 * Los `code` son los valores que espera el robot; los `label` son para mostrar (accesibles).
 */
import { FAN_POWER_LABELS, MOP_MODE_LABELS, WATER_BOX_LABELS } from "./statusDecoder";

export interface Option {
  code: number;
  label: string;
}

function options(map: Record<number, string>, codes: number[]): Option[] {
  return codes.map((code) => ({ code, label: map[code] ?? `Código ${code}` }));
}

/** Niveles de succión seleccionables (de menor a mayor). 108 = Máximo+ (según modelo). */
export const FAN_POWER_OPTIONS: Option[] = options(FAN_POWER_LABELS, [101, 102, 103, 104, 108]);

/** Niveles de agua seleccionables. */
export const WATER_BOX_OPTIONS: Option[] = options(WATER_BOX_LABELS, [201, 202, 203]);

/** Modos de fregado seleccionables. */
export const MOP_MODE_OPTIONS: Option[] = options(MOP_MODE_LABELS, [300, 301, 303]);

/** Nombres de método RPC (protocolo V1). */
export const METHOD = {
  GET_STATUS: "get_status",
  START: "app_start",
  STOP: "app_stop",
  PAUSE: "app_pause",
  DOCK: "app_charge",
  SPOT: "app_spot",
  FIND_ME: "find_me",
  SEGMENT_CLEAN: "app_segment_clean",
  ZONED_CLEAN: "app_zoned_clean",
  SET_FAN: "set_custom_mode",
  SET_WATER: "set_water_box_custom_mode",
  SET_MOP: "set_mop_mode",
  ROOM_MAPPING: "get_room_mapping",
  CONSUMABLE: "get_consumable",
  RESET_CONSUMABLE: "reset_consumable",
  CLEAN_SUMMARY: "get_clean_summary",
  CLEAN_RECORD: "get_clean_record", // detalle de una limpieza por su id

  // --- Ajustes / configuración ---
  GET_CUSTOM_MODE: "get_custom_mode", // potencia succión actual
  GET_SOUND_VOLUME: "get_sound_volume",
  CHANGE_SOUND_VOLUME: "change_sound_volume",
  GET_DND: "get_dnd_timer",
  SET_DND: "set_dnd_timer",
  CLOSE_DND: "close_dnd_timer",
  GET_CHILD_LOCK: "get_child_lock_status",
  SET_CHILD_LOCK: "set_child_lock_status",
  GET_LED: "get_led_status",
  SET_LED: "set_led_status",
  GET_CARPET_MODE: "get_carpet_mode",
  SET_CARPET_MODE: "set_carpet_mode",
  GET_COLLISION: "get_collision_avoid_status",
  SET_COLLISION: "set_collision_avoid_status",
  // Estación (dock): secado de mopa, auto-vaciado, lavado
  GET_DRYER_SETTING: "app_get_dryer_setting",
  SET_DRYER_SETTING: "app_set_dryer_setting",
  SET_DRYER_STATUS: "app_set_dryer_status", // arrancar/parar secado ahora
  START_WASH: "app_start_wash", // arrancar lavado de mopa ahora
  STOP_WASH: "app_stop_wash", // parar lavado de mopa
  WASH_THEN_CHARGE: "start_wash_then_charge", // ir a la base, lavar la mopa y cargar
  GET_DUST_MODE: "get_dust_collection_mode",
  SET_DUST_MODE: "set_dust_collection_mode",
  GET_DUST_SWITCH: "get_dust_collection_switch_status",
  SET_DUST_SWITCH: "set_dust_collection_switch_status",
  GET_SMART_WASH: "get_smart_wash_params",
  SET_SMART_WASH: "set_smart_wash_params",
  GET_WASH_TOWEL: "get_wash_towel_mode",
  SET_WASH_TOWEL: "set_wash_towel_mode",

  // --- Funciones avanzadas (disponibilidad según modelo; se sondean con get_* antes de ofrecer) ---
  GET_CLEAN_SEQUENCE: "get_clean_sequence", // orden de limpieza de habitaciones
  SET_CLEAN_SEQUENCE: "set_clean_sequence",
  GET_CUSTOMIZE_CLEAN_MODE: "get_customize_clean_mode", // modo por habitación
  SET_CUSTOMIZE_CLEAN_MODE: "set_customize_clean_mode",
  GET_RIGHT_BRUSH_STRETCH: "get_right_brush_stretch_status", // FlexiArm: mopa/cepillo se extiende a la pared
  SET_RIGHT_BRUSH_STRETCH: "set_right_brush_stretch_status",
  GET_STRETCH_TAG: "get_stretch_tag_status",
  SET_STRETCH_TAG: "set_stretch_tag_status",
  GET_PET_DEEP_CLEAN: "get_pet_supplies_deep_clean_status", // limpieza profunda en comederos
  SET_PET_DEEP_CLEAN: "set_pet_supplies_deep_clean_status",
  GET_GAP_DEEP_CLEAN: "get_gap_deep_clean_status", // limpieza profunda de esquinas/huecos
  SET_GAP_DEEP_CLEAN: "set_gap_deep_clean_status",
  GET_CARPET_DEEP_CLEAN: "app_get_carpet_deep_clean_status", // limpieza profunda de alfombra
  SET_CARPET_DEEP_CLEAN: "app_set_carpet_deep_clean_status",
  GET_CARPET_CLEAN_MODE: "get_carpet_clean_mode",
  GET_INIT_STATUS: "app_get_init_status", // capacidades del modelo (feature flags)
} as const;
