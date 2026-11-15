/**
 * Pestanas — barra de pestañas nativa de iOS (UITabBar), con una pila por pestaña.
 *
 * Son las Tabs de react-native-screens a través de `@react-navigation/bottom-tabs/unstable`, no
 * `react-native-bottom-tabs`: esa, con iconos, deja a VoiceOver diciendo "seleccionada" en todas
 * las pestañas ya visitadas en iOS 26/27 (comun/docs/HALLAZGOS-MODULOS.md, "Pestañas nativas sin
 * expo-router"). Combinación comprobada con VoiceOver en AccessBus: bottom-tabs 7.20 y
 * react-native-screens 4.26.
 */
import React from "react";
import { createNativeBottomTabNavigator } from "@react-navigation/bottom-tabs/unstable";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { RootStackParamList, TabParamList } from "./navigation";
import type { Device, RoborockClient } from "./roborock";
import { EditarProgramacionScreen } from "./screens/EditarProgramacionScreen";
import { HistorialScreen } from "./screens/HistorialScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { ProgramacionesScreen } from "./screens/ProgramacionesScreen";
import { SettingsScreen } from "./screens/SettingsScreen";

interface Props {
  client: RoborockClient;
  device: Device;
  onLogout: () => void;
}

const Tab = createNativeBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const opcionesPila = { headerBackButtonDisplayMode: "default", headerBackTitle: "Volver" } as const;

function PilaInicio({ client, device }: Omit<Props, "onLogout">) {
  return (
    <Stack.Navigator screenOptions={opcionesPila}>
      <Stack.Screen name="Home" options={{ headerShown: false }}>
        {(props) => <HomeScreen {...props} client={client} device={device} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

function PilaProgramaciones({ client, device }: Omit<Props, "onLogout">) {
  return (
    <Stack.Navigator screenOptions={opcionesPila}>
      <Stack.Screen name="Programaciones" options={{ title: "Programaciones" }}>
        {(props) => <ProgramacionesScreen {...props} client={client} device={device} />}
      </Stack.Screen>
      <Stack.Screen
        name="EditarProgramacion"
        options={({ route }) => ({ title: route.params?.programacion ? "Editar programación" : "Nueva programación" })}
      >
        {(props) => <EditarProgramacionScreen {...props} client={client} device={device} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

function PilaHistorial({ client, device }: Omit<Props, "onLogout">) {
  return (
    <Stack.Navigator screenOptions={opcionesPila}>
      <Stack.Screen name="Historial" options={{ title: "Historial de limpieza" }}>
        {(props) => <HistorialScreen {...props} client={client} device={device} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

function PilaConfiguracion({ client, device, onLogout }: Props) {
  return (
    <Stack.Navigator screenOptions={opcionesPila}>
      <Stack.Screen name="Settings" options={{ title: "Configuración" }}>
        {(props) => <SettingsScreen {...props} client={client} device={device} onLogout={onLogout} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

export function Pestanas({ client, device, onLogout }: Props) {
  return (
    <Tab.Navigator>
      <Tab.Screen name="InicioTab" options={{ tabBarLabel: "Inicio", tabBarIcon: { type: "sfSymbol", name: "house.fill" } }}>
        {() => <PilaInicio client={client} device={device} />}
      </Tab.Screen>
      <Tab.Screen
        name="ProgramacionesTab"
        options={{ tabBarLabel: "Programaciones", tabBarIcon: { type: "sfSymbol", name: "calendar" } }}
      >
        {() => <PilaProgramaciones client={client} device={device} />}
      </Tab.Screen>
      <Tab.Screen
        name="HistorialTab"
        options={{ tabBarLabel: "Historial", tabBarIcon: { type: "sfSymbol", name: "clock.arrow.circlepath" } }}
      >
        {() => <PilaHistorial client={client} device={device} />}
      </Tab.Screen>
      <Tab.Screen
        name="ConfiguracionTab"
        options={{ tabBarLabel: "Configuración", tabBarIcon: { type: "sfSymbol", name: "gearshape.fill" } }}
      >
        {() => <PilaConfiguracion client={client} device={device} onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
