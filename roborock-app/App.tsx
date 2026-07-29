/**
 * App — orquesta el flujo: cargando → login → casa.
 */
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, useColorScheme, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { HttpApi, RoborockClient, type Device, type Region } from "./src/roborock";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { clearSession, getClientId, loadEmail, loadSession, saveEmail, saveSession } from "./src/session";

type Phase = "loading" | "login" | "home";

export default function App() {
  const dark = useColorScheme() === "dark";
  const [phase, setPhase] = useState<Phase>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<Device | null>(null);

  const httpRef = useRef<HttpApi | null>(null);
  const clientRef = useRef<RoborockClient | null>(null);

  const startClient = async (http: HttpApi) => {
    const client = new RoborockClient(http);
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

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.root, { backgroundColor: bg }]}>
        <StatusBar style={dark ? "light" : "dark"} />
        {phase === "loading" ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={[styles.loadingText, { color: dark ? "#FFF" : "#111" }]}>Conectando…</Text>
          </View>
        ) : phase === "login" ? (
          <LoginScreen onRequestCode={handleRequestCode} onSubmitCode={handleSubmitCode} busy={busy} error={error} />
        ) : device && clientRef.current ? (
          <HomeScreen client={clientRef.current} device={device} onLogout={handleLogout} />
        ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { fontSize: 18 },
});
