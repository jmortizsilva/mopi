/**
 * probe.ts — prueba real de extremo a extremo contra tu robot.
 *
 * Flujo: login por código de email → listar dispositivos → conectar MQTT → get_status.
 * Guarda la sesión en `.session.json` para no repetir el login en cada ejecución, y un
 * clientId estable en `.clientid`.
 *
 * Ejecutar:
 *   ROBOROCK_EMAIL="tu@email.com" ROBOROCK_REGION="eu" npm run probe
 *
 * (en PowerShell:)
 *   $env:ROBOROCK_EMAIL="tu@email.com"; $env:ROBOROCK_REGION="eu"; npm run probe
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { HttpApi, type Region, RoborockClient, summarizeStatus, type UserData } from "../src/index";

const DIR = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"); // Windows-safe
const SESSION_FILE = join(DIR, ".session.json");
const CLIENTID_FILE = join(DIR, ".clientid");

function getClientId(): string {
  if (existsSync(CLIENTID_FILE)) return readFileSync(CLIENTID_FILE, "utf-8").trim();
  const id = randomUUID();
  writeFileSync(CLIENTID_FILE, id);
  return id;
}

function loadSession(): UserData | null {
  if (!existsSync(SESSION_FILE)) return null;
  try {
    return JSON.parse(readFileSync(SESSION_FILE, "utf-8")) as UserData;
  } catch {
    return null;
  }
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const email = process.env.ROBOROCK_EMAIL;
  const region = (process.env.ROBOROCK_REGION as Region) || "eu";
  if (!email) throw new Error("Define ROBOROCK_EMAIL (y opcionalmente ROBOROCK_REGION).");

  const http = new HttpApi({ region, username: email, clientId: getClientId() });

  // 1) Sesión: reutiliza la persistida o haz login por código de email
  const saved = loadSession();
  if (saved) {
    http.setUserData(saved);
    console.log("✔ Sesión restaurada de .session.json");
  } else {
    console.log(`→ Pidiendo código de acceso a ${email} (región ${region})...`);
    await http.requestEmailCode();
    const code = await ask("Introduce el código de 6 dígitos que te ha llegado por email: ");
    const userData = await http.loginWithCode(code);
    writeFileSync(SESSION_FILE, JSON.stringify(userData, null, 2));
    console.log("✔ Login correcto. Sesión guardada en .session.json");
  }

  // 2) Dispositivos + MQTT
  const client = new RoborockClient(http);
  console.log("→ Cargando dispositivos y conectando al MQTT...");
  const home = await client.start();

  console.log(`\n✔ Casa ${home.homeId} — ${home.devices.length} dispositivo(s):`);
  for (const d of home.devices) {
    const product = home.products.find((p) => p.id === d.productId);
    console.log(`   • ${d.name ?? "(sin nombre)"}  duid=${d.duid}  modelo=${product?.model ?? "?"}  pv=${d.pv}  online=${d.online}`);
  }
  if (home.rooms.length) {
    console.log(`   Habitaciones: ${home.rooms.map((r) => `${r.id}:${r.name}`).join(", ")}`);
  }

  const device = home.devices[0];
  if (!device) {
    console.log("No hay dispositivos en la cuenta.");
    await client.stop();
    return;
  }

  // 3) Primer comando de lectura (ya decodificado a texto accesible)
  console.log(`\n→ Enviando get_status a ${device.duid}...`);
  try {
    const status = await client.getStatus(device.duid);
    console.log("✔ Estado del robot:");
    console.log("   " + summarizeStatus(status));
    console.log(`   (estado=${status.state.code}, secando=${status.drying}, lavando=${status.washing})`);
    console.log("   RAW: " + JSON.stringify(status.raw));
  } catch (e) {
    console.error("✖ get_status falló:", (e as Error).message);
    console.error("   (Si pv NO es '1.0', tu modelo usa otro protocolo — avísame y adaptamos.)");
  }

  // 3b) Verificación de habitaciones: segmentos REALES del mapa del robot
  console.log(`\n→ Enviando get_room_mapping (segmentos del mapa actual)...`);
  try {
    const mapping = await client.getRoomMapping(device.duid);
    console.log("✔ get_room_mapping (crudo):", JSON.stringify(mapping));
    if (Array.isArray(mapping)) {
      console.log("\n   Cruce segmento → nombre de la casa:");
      for (const entry of mapping as any[]) {
        // Formato habitual: [segmentId, "roomId", ...] o [segmentId, "roomId"]
        const segmentId = Array.isArray(entry) ? entry[0] : entry;
        const roomIdStr = Array.isArray(entry) ? String(entry[1]) : "";
        const room = home.rooms.find((r) => String(r.id) === roomIdStr);
        console.log(`      segmento ${segmentId}  →  roomId ${roomIdStr}  →  ${room ? room.name : "(sin nombre en la casa)"}`);
      }
      console.log("\n   Habitaciones de la casa NO presentes en el mapa (posibles obsoletas):");
      const mappedRoomIds = new Set((mapping as any[]).map((e) => (Array.isArray(e) ? String(e[1]) : "")));
      for (const r of home.rooms) {
        if (!mappedRoomIds.has(String(r.id))) console.log(`      ${r.id}: ${r.name}`);
      }
    }
  } catch (e) {
    console.error("✖ get_room_mapping falló:", (e as Error).message);
  }

  // 3c) Volcado de AJUSTES (solo lectura, seguro): para ver formatos reales
  console.log(`\n→ Leyendo ajustes actuales (dumpSettings)...`);
  try {
    const settings = await client.dumpSettings(device.duid);
    for (const [name, value] of Object.entries(settings)) {
      console.log(`   ${name}: ${JSON.stringify(value)}`);
    }
  } catch (e) {
    console.error("✖ dumpSettings falló:", (e as Error).message);
  }

  // 4) Comando de acción inofensivo, bajo confirmación
  const yes = await ask("\n¿Enviar 'find_me' para que el robot emita un sonido? (s/N): ");
  if (yes.toLowerCase().startsWith("s")) {
    await client.sendCommand(device.duid, "find_me", { timeoutMs: 10000 }).catch((e) => console.error("find_me:", (e as Error).message));
    console.log("✔ find_me enviado.");
  }

  await client.stop();
  console.log("\nHecho.");
}

main().catch((e) => {
  console.error("\n✖ Error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
