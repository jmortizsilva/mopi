/**
 * LoginScreen — login por código de email en dos pasos (accesible).
 */
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, useColorScheme, View } from "react-native";
import { AccessibleButton } from "../ui/AccessibleButton";
import { loadEmail } from "../session";
import type { Region } from "../roborock";

interface Props {
  onRequestCode: (email: string, region: Region) => Promise<void>;
  onSubmitCode: (code: string) => Promise<void>;
  busy: boolean;
  error: string | null;
}

export function LoginScreen({ onRequestCode, onSubmitCode, busy, error }: Props) {
  const dark = useColorScheme() === "dark";
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [region] = useState<Region>("eu");
  const [codeSent, setCodeSent] = useState(false);

  useEffect(() => {
    loadEmail().then((e) => e && setEmail(e));
  }, []);

  const textColor = dark ? "#FFFFFF" : "#111111";
  const inputBg = dark ? "#1C1C1E" : "#FFFFFF";
  const inputBorder = dark ? "#48484A" : "#C7C7CC";

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={[styles.title, { color: textColor }]}>
          Acceder a Roborock
        </Text>

        <Text style={[styles.label, { color: textColor }]} nativeID="emailLabel">
          Correo electrónico de tu cuenta Roborock
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          editable={!codeSent && !busy}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
          accessibilityLabel="Correo electrónico"
          aria-labelledby="emailLabel"
          placeholder="tucorreo@ejemplo.com"
          placeholderTextColor={dark ? "#8E8E93" : "#A0A0A0"}
          style={[styles.input, { color: textColor, backgroundColor: inputBg, borderColor: inputBorder }]}
        />

        {!codeSent ? (
          <AccessibleButton
            label="Enviar código al correo"
            hint="Roborock te enviará un código de 6 dígitos por email"
            busy={busy}
            disabled={!email.includes("@")}
            onPress={async () => {
              await onRequestCode(email.trim(), region);
              setCodeSent(true);
            }}
          />
        ) : (
          <>
            <Text style={[styles.label, { color: textColor }]} nativeID="codeLabel">
              Código de 6 dígitos recibido por email
            </Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
              accessibilityLabel="Código de acceso"
              aria-labelledby="codeLabel"
              placeholder="000000"
              placeholderTextColor={dark ? "#8E8E93" : "#A0A0A0"}
              style={[styles.input, { color: textColor, backgroundColor: inputBg, borderColor: inputBorder }]}
            />
            <AccessibleButton
              label="Entrar"
              busy={busy}
              disabled={code.length < 6}
              onPress={() => onSubmitCode(code.trim())}
            />
            <AccessibleButton
              label="Reenviar código"
              variant="secondary"
              disabled={busy}
              onPress={() => onRequestCode(email.trim(), region)}
            />
          </>
        )}

        {error ? (
          <Text accessibilityLiveRegion="assertive" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 6, flexGrow: 1, justifyContent: "center" },
  title: { fontSize: 26, fontWeight: "700", marginBottom: 16 },
  label: { fontSize: 16, marginTop: 10, marginBottom: 4 },
  input: { minHeight: 52, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, fontSize: 18 },
  error: { color: "#B00020", fontSize: 16, marginTop: 12, fontWeight: "600" },
});
