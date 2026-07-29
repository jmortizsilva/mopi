/**
 * session — persistencia de la sesión (UserData) y del clientId.
 *
 * La sesión (con el token) se guarda en el llavero seguro (expo-secure-store).
 * El clientId (no sensible, solo un identificador estable de dispositivo) va en AsyncStorage.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { UserData } from "./roborock";

const SESSION_KEY = "roborock_session";
const CLIENTID_KEY = "roborock_clientid";
const EMAIL_KEY = "roborock_email";

export async function loadSession(): Promise<UserData | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    return raw ? (JSON.parse(raw) as UserData) : null;
  } catch {
    return null;
  }
}

export async function saveSession(userData: UserData): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(userData));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export async function getClientId(): Promise<string> {
  let id = await AsyncStorage.getItem(CLIENTID_KEY);
  if (!id) {
    id = "rn-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    await AsyncStorage.setItem(CLIENTID_KEY, id);
  }
  return id;
}

export async function loadEmail(): Promise<string> {
  return (await AsyncStorage.getItem(EMAIL_KEY)) ?? "";
}

export async function saveEmail(email: string): Promise<void> {
  await AsyncStorage.setItem(EMAIL_KEY, email);
}
