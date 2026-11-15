import type { Programacion } from "./roborock";

/** Pantallas de la pila de navegación autenticada. */
export type RootStackParamList = {
  Home: undefined;
  Settings: undefined;
  Historial: undefined;
  Programaciones: undefined;
  /** Sin programación = crear una nueva. */
  EditarProgramacion: { programacion?: Programacion } | undefined;
};
