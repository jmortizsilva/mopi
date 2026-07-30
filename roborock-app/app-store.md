# Mopi — textos y datos para App Store Connect / TestFlight

Todo en español. Copia y pega en App Store Connect. El **idioma principal** ya está fijado a
español en `app.json` (`CFBundleDevelopmentRegion: "es"`); al crear el registro de la app en
App Store Connect, elige **Español (España)** como idioma principal.

---

## Datos básicos

- **Nombre**: `Mopi - Aspiradora accesible`
- **Subtítulo** (máx. 30 caracteres): `Tu robot Roborock, accesible`
- **Categoría principal**: Utilidades (o Estilo de vida)
- **Bundle ID**: `com.jmortiz.roborockaccesible`

## Palabras clave (máx. 100 caracteres, separadas por comas, sin espacios tras la coma)

```
aspiradora,robot,accesible,voiceover,limpieza,domotica,ceguera,discapacidad,mopa,roborock
```

## Texto promocional (máx. 170 caracteres)

```
Controla tu robot aspirador Roborock de forma totalmente accesible con VoiceOver: empezar, parar, limpiar por habitaciones y ajustar succión, agua y secado.
```

## Descripción

```
Mopi es una app pensada para controlar tu robot aspirador Roborock de forma sencilla y
totalmente accesible con el lector de pantalla VoiceOver.

Nació porque la app oficial resulta difícil de usar con lector de pantalla. Mopi pone el
foco en la accesibilidad: botones grandes, textos claros, estados leídos en voz alta y
confirmación por vibración al aplicar los cambios.

Qué puedes hacer:
• Ver el estado del robot en texto claro (batería, en la base, secando la mopa con el
  tiempo restante, avisos).
• Empezar y parar la limpieza, pausar y enviar el robot a la base.
• Limpiar una habitación concreta, con los nombres reales de tu casa.
• Elegir el modo de limpieza: aspirar y fregar, o solo aspirar.
• Ajustar la potencia de aspirado, el nivel de agua y el modo de fregado.
• Configurar la base: secado automático de la mopa, auto-vaciado del polvo e intensidad
  de lavado.
• Volumen, No molestar (con horario), bloqueo infantil, luz indicadora y más.
• Consultar la vida de los consumibles y reiniciarlos al cambiarlos.

Mopi se conecta directamente con tu cuenta de Roborock. No hay servidores intermedios: tus
datos solo viajan entre tu iPhone y los servidores de Roborock.

Compatibilidad: funciona con la mayoría de robots aspiradores Roborock. Según el modelo,
algunas funciones concretas pueden no estar disponibles.

Aviso: Mopi es una aplicación independiente, no oficial y no está afiliada, patrocinada ni
respaldada por Roborock. "Roborock" es una marca de sus respectivos propietarios y se
menciona solo para indicar compatibilidad.
```

---

## TestFlight — información de prueba

- **Correo de contacto / feedback**: pon tu correo privado **directamente en App Store Connect**
  (campo "Feedback Email" de TestFlight). NO lo escribas en este repositorio, que es público.
- **Descripción beta** (qué es la app):

```
Mopi es un controlador accesible (VoiceOver) para robots aspiradores Roborock. Esta beta
sirve para probar el control básico y los ajustes en distintos modelos.
```

- **Qué probar** (notas para testers, campo "What to Test"):

```
Necesitas una cuenta de Roborock con tu robot ya configurado en la app oficial (o compartido
contigo desde otra cuenta).

CÓMO EMPEZAR
1. Entra con tu correo de Roborock; te llegará un código de 6 dígitos por email.
2. Comprueba que aparece tu robot y su estado (batería, limpiando, en la base…).

QUÉ PROBAR
• Estado: se actualiza solo cada pocos segundos, sin tener que pulsar nada. Compruébalo
  dejando la pantalla abierta mientras el robot limpia o vuelve a la base.
• Controles: empezar, pausar y parar la limpieza, ir a la base, localizar el robot (sonido).
• Limpiar una habitación: deben salir los nombres reales de tu casa, no "Habitación 1, 2…".
  Si el robot te lo ha compartido otra persona, también deberían verse SUS nombres.
• Configuración: cambia succión, agua, secado, volumen… y pulsa "Recargar ajustes" para
  comprobar que se han guardado. El botón para volver está arriba a la izquierda.
• Según tu MODELO de robot, algunos controles (por ejemplo auto-vaciado de la base) no
  deberían aparecer si tu robot no tiene esa función.

SI USAS VOICEOVER (el motivo de ser de esta app)
• En Configuración, prueba a volver atrás con el gesto de rascar con dos dedos, no solo
  con el botón.
• Al entrar o salir de Configuración, el foco debería quedar en un sitio con sentido (el
  título al entrar, el botón "Configuración" al volver), no perderse por la pantalla.
• Los avisos al empezar o terminar una acción (o un error) deberían oírse enteros, sin
  cortarse por otro sonido o cambio de pantalla.
• Cuéntame si algún control se lee mal, con una etiqueta rara, o cuesta activarlo.

CÓMO AVISARME
Abre una incidencia en GitHub con lo que ha pasado, tu MODELO de Roborock, la versión de
iOS y si usabas VoiceOver: https://github.com/jmortizsilva/mopi/issues

¡Gracias por probarla!
```

---

## Privacidad (App Privacy) — cómo rellenar las "etiquetas"

La app **no tiene servidor propio**: el desarrollador no recibe ni almacena ningún dato.
Los datos de acceso viajan únicamente a los servidores de Roborock para autenticarte, y la
sesión se guarda cifrada en el llavero (Keychain) del iPhone.

En "App Privacy" de App Store Connect declara:

- **Datos recopilados: Información de contacto → Dirección de correo electrónico**
  - Uso: **Funcionalidad de la app** (iniciar sesión en tu cuenta de Roborock).
  - **No** se usa para seguimiento (tracking).
  - **No** vinculado a tu identidad por parte del desarrollador (no hay backend propio).
- El resto: **No se recopilan datos** por parte del desarrollador.

## Política de privacidad (Apple exige una URL)

Necesitas alojar este texto en una URL pública (vale una página de GitHub Pages, un Gist,
o una nota pública). Borrador listo para usar:

```
POLÍTICA DE PRIVACIDAD DE MOPI

Mopi es una aplicación independiente para controlar robots aspiradores Roborock.

1. Sin servidores propios. Mopi no dispone de servidores. El desarrollador no recopila,
   almacena ni comparte ningún dato personal.

2. Datos que introduces. Para funcionar, Mopi necesita el correo y el código de acceso de
   tu cuenta de Roborock. Esos datos se envían directamente a los servidores de Roborock
   para autenticarte. La sesión resultante se guarda de forma segura en el llavero (Keychain)
   de tu dispositivo y no sale de él salvo hacia Roborock.

3. Terceros. Al usar Mopi te conectas a los servicios de Roborock, sujetos a la política de
   privacidad de Roborock.

4. Eliminar tus datos. Cerrar sesión en la app borra la sesión guardada en tu dispositivo.

5. Contacto: a través de las incidencias del proyecto en GitHub
   (https://github.com/jmortizsilva/mopi/issues).

Mopi no está afiliada a Roborock.
```

---

## Notas técnicas

- **Idioma principal**: fijado a español en `app.json` (`CFBundleDevelopmentRegion: "es"`,
  `CFBundleLocalizations: ["es"]`).
- **Cifrado / export compliance**: `ITSAppUsesNonExemptEncryption: false` ya configurado
  (no volverá a preguntar).
- **Permisos**: la app no pide cámara, ubicación, micrófono ni red local, así que no hacen
  falta textos de uso (NSxxxUsageDescription).
- **Comando para subir a TestFlight**:
  ```
  npx eas build -p ios --profile production --auto-submit
  ```
