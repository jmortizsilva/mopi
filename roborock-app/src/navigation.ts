import type { Programacion } from "./roborock";

/** Pestañas de la barra inferior. Cada una lleva su propia pila. */
export type TabParamList = {
  InicioTab: undefined;
  ProgramacionesTab: undefined;
  HistorialTab: undefined;
  ConfiguracionTab: undefined;
};

/** Pantallas de las pilas. "Pestanas" es la barra entera, en la pila raíz. */
export type RootStackParamList = {
  Pestanas: undefined;
  Home: undefined;
  Settings: undefined;
  Historial: undefined;
  Programaciones: undefined;
  /** Sin programación = crear una nueva. */
  EditarProgramacion: { programacion?: Programacion } | undefined;
};
