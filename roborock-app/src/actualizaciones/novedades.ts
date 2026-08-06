/**
 * Changelog de la app. Cada release AÑADE una entrada con `v` incremental (no se edita las
 * anteriores). El bundle más reciente contiene TODO el historial, así que aunque el usuario salte
 * varias versiones de golpe, se le pueden mostrar todas las novedades desde la última que vio.
 *
 * Al publicar un `eas update` con cambios visibles: añadir una entrada nueva con `v` = anterior + 1.
 */
export interface EntradaChangelog {
  v: number;
  notas: string[];
}

// Orden ascendente por versión. La última es la más reciente.
export const CHANGELOG: EntradaChangelog[] = [
  {
    v: 1,
    notas: [
      "El estado del robot se actualiza solo, sin recargar a mano.",
      "Las habitaciones salen con sus nombres reales, también en cuentas compartidas.",
      "Navegación nativa: sonidos y foco al cambiar de pantalla, y volver con el gesto de VoiceOver.",
      "Solo se muestran los controles compatibles con tu modelo.",
      "Aviso cuando hay una versión nueva, con opción de instalarla.",
    ],
  },
  {
    v: 2,
    notas: [
      "Puedes elegir varias habitaciones a la vez y limpiarlas juntas.",
      "Botones para lavar o secar la mopa al momento.",
    ],
  },
  {
    v: 3,
    notas: [
      "Modo de limpieza con los 3 modos reales: solo aspirar, aspirar y fregar, y solo fregar (con ruta Rápido).",
      "Arreglado el botón de secar la mopa.",
    ],
  },
  {
    v: 4,
    notas: ["Máximo+ solo se ofrece aspirando sin fregar (el robot no lo mantiene con la mopa)."],
  },
  {
    v: 5,
    notas: [
      "Limpieza avanzada: fregado extensivo, limpieza profunda de comederos y de alfombra (los que tu robot tenga).",
      "Al limpiar habitaciones puedes elegir 1 o 2 pasadas.",
    ],
  },
  {
    v: 6,
    notas: [
      "La app lee las capacidades reales de tu robot y muestra solo lo que admite.",
      "Las rutas de fregado se ajustan a las que tu modelo soporta de verdad.",
    ],
  },
  {
    v: 7,
    notas: [
      "Los controles de Inicio se deshabilitan cuando no aplican (p. ej. Pausar o Parar mientras carga en la base).",
    ],
  },
  {
    v: 8,
    notas: [
      "Al actualizar verás todas las novedades desde la última vez que abriste la app, no solo las de la última versión.",
    ],
  },
  {
    v: 9,
    notas: [
      "En Inicio ahora eliges el modo de limpieza y sus opciones con ajustables (deslizando arriba/abajo).",
      "Marcas dónde limpiar justo antes de los controles; sin nada marcado, limpia toda la casa.",
      "Configuración se queda solo con los ajustes de fondo (la parte de limpieza está en Inicio).",
    ],
  },
  {
    v: 10,
    notas: [
      "Nuevo botón 'Historial de limpieza' en Inicio: ves las limpiezas anteriores y los totales.",
    ],
  },
];

/** Versión más alta del changelog incluida en este bundle. */
export const CHANGELOG_VERSION = CHANGELOG.reduce((max, e) => Math.max(max, e.v), 0);

/** Notas (aplanadas) de todas las entradas posteriores a `desdeV`. Pura → fácil de razonar/probar. */
export function notasNuevas(desdeV: number): string[] {
  return CHANGELOG.filter((e) => e.v > desdeV).flatMap((e) => e.notas);
}
