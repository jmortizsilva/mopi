/**
 * App — orquesta el flujo: cargando → login → casa.
 */
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, useColorScheme, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { HttpApi, RoborockClient, type Device, type Region } from "./src/roborock";
import { HomeScreen } from "./src/screens/HomeScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { HistorialScreen } from "./src/screens/HistorialScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import type { RootStackParamList } from "./src/navigation";
import { useActualizacionesOTA } from "./src/actualizaciones/ota";
import { registrarActividad } from "./src/registro/log";
import { clearSession, getClientId, loadEmail, loadSession, saveEmail, saveSession } from "./src/session";

type Phase = "loading" | "login" | "home";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const dark = useColorScheme() === "dark";
  useActualizacionesOTA(); // avisa de versiones nuevas y aplica OTA con permiso del usuario
  const [phase, setPhase] = useState<Phase>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<Device | null>(null);

  const httpRef = useRef<HttpApi | null>(null);
  const clientRef = useRef<RoborockClient | null>(null);

  const startClient = async (http: HttpApi) => {
    const client = new RoborockClient(http);
    client.onActivity = registrarActividad; // el registro de pruebas ignora esto si no está grabando
    const home = await client.start();
    if (home.devices.length === 0) throw new Error("No hay dispositivos en la cuenta.");
    clientRef.current = client;
    setDevice(home.devices[0]);
    setPhase("home");
  };

  // Arranque: intenta restaurar sesión
  useEffect(() => {
    (async () => {
      try {
        const saved = await loadSession();
        if (saved) {
          const email = await loadEmail();
          const clientId = await getClientId();
          const http = new HttpApi({ region: "eu", username: email, clientId });
          http.setUserData(saved);
          httpRef.current = http;
          await startClient(http);
          return;
        }
      } catch (e) {
        setError("No se pudo restaurar la sesión: " + (e as Error).message);
      }
      setPhase("login");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRequestCode = async (email: string, region: Region) => {
    setError(null);
    setBusy(true);
    try {
      const clientId = await getClientId();
      const http = new HttpApi({ region, username: email, clientId });
      httpRef.current = http;
      await http.requestEmailCode();
      await saveEmail(email);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitCode = async (code: string) => {
    setError(null);
    setBusy(true);
    try {
      const http = httpRef.current;
      if (!http) throw new Error("Primero solicita el código.");
      const userData = await http.loginWithCode(code);
      await saveSession(userData);
      await startClient(http);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    await clearSession();
    await clientRef.current?.stop();
    clientRef.current = null;
    httpRef.current = null;
    setDevice(null);
    setPhase("login");
  };

  const bg = dark ? "#000000" : "#FFFFFF";
  const client = clientRef.current;

  // Fase "home": pila NATIVA (Home ↔ Configuración). Las pantallas nativas dan el sonido, el
  // háptico y el foco estándar del sistema al navegar, el botón atrás y el gesto de escape de
  // VoiceOver, sin apaños. Login y "cargando" van fuera de la pila (no necesitan ir atrás).
  if (phase === "home" && device && client) {
    return (
      <SafeAreaProvider>
        <StatusBar style={dark ? "light" : "dark"} />
        <NavigationContainer theme={dark ? DarkTheme : DefaultTheme}>
          <Stack.Navigator screenOptions={{ headerBackButtonDisplayMode: "default", headerBackTitle: "Volver" }}>
            <Stack.Screen name="Home" options={{ headerShown: false }}>
              {(props) => <HomeScreen {...props} client={client} device={device} onLogout={handleLogout} />}
            </Stack.Screen>
            <Stack.Screen name="Settings" options={{ title: "Configuración" }}>
              {(props) => <SettingsScreen {...props} client={client} device={device} />}
            </Stack.Screen>
            <Stack.Screen name="Historial" options={{ title: "Historial de limpieza" }}>
              {(props) => <HistorialScreen {...props} client={client} device={device} />}
            </Stack.Screen>
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.root, { backgroundColor: bg }]}>
        <StatusBar style={dark ? "light" : "dark"} />
        {phase === "loading" ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={[styles.loadingText, { color: dark ? "#FFF" : "#111" }]}>Conectando…</Text>
          </View>
        ) : (
          <LoginScreen onRequestCode={handleRequestCode} onSubmitCode={handleSubmitCode} busy={busy} error={error} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { fontSize: 18 },
});
