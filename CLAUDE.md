# Speak Plus Games — contexto para Claude Code

Hub de juegos para profesores de inglés de Speak Plus, una eikaiwa en Japón. Lo usa el profesor en un portátil con proyector o en una tablet, delante de la clase. El objetivo es publicarlo también en la web de la escuela.

## Stack

- HTML, CSS y JavaScript sin frameworks ni build. Se abre `index.html` directamente.
- Una carpeta por juego (`word-drop/`, `city-run/`, `trade-gate/`), cada una con su propio `index.html`. El `index.html` de la raíz es solo el menú y enlaza a cada juego. Lo común está en `shared/`: `styles.css` (marca y piezas de interfaz compartidas) y `hub.css` (solo el menú).
- Fuentes de Google Fonts: Lexend (latín) y Zen Kaku Gothic New (japonés).
- Interfaz en inglés. El contenido de las palabras puede estar en cualquier idioma.

## Marca (respetar siempre)

| Token     | Hex       | Uso                          |
|-----------|-----------|------------------------------|
| Washi     | `#F7F4EE` | Fondo                        |
| Indigo    | `#1F2F5C` | Texto, formas, botón primario|
| Vermilion | `#E8483B` | Acento y el "+" del logo     |
| Sky       | `#9DB4E0` | Detalles secundarios, foco   |

- Logo "Exponente": la palabra `speak` en Lexend Bold minúscula + un "+" bermellón con puntas redondas, girado 12° y elevado como exponente. Está como `<symbol id="plus">` al principio de cada `index.html`. El "+" nunca debe parecer una cruz médica (nada de "+" recto y cuadrado).
- El bermellón no se usa para texto pequeño de cuerpo.
- Todos los colores van como variables CSS en `:root`, con versión para modo oscuro.

## Word Drop: reglas implementadas (`word-drop/word-drop.js`)

- Palabras repartidas por igual entre equipos (`floor(total / equipos)`); cada equipo tiene su propio `deck`. Máximo 8 equipos (`MAX_TEAMS`).
- Turnos: un equipo juega hasta que una palabra toca el suelo → pierde una vida → turno al siguiente equipo vivo con palabras.
- Palabra fallada: pasa una sola vez al inicio del deck del siguiente equipo vivo, marcada como "Bonus" (`G.passed`). Si se falla otra vez, va a `G.failed`.
- Las otras palabras en pantalla cuando hay un fallo vuelven al deck del mismo equipo.
- Fin de partida: queda un solo equipo, o ningún equipo tiene palabras. Gana el último en pie; si todos acaban sus palabras, gana quien tenga más puntos.
- Pantalla final: clasificación, "Nobody answered" (feedback para el profesor) y "Answered on the bonus".
- Estado del juego en el objeto `G`; ajustes del profesor en `S`, guardados en localStorage con la clave `sp-worddrop-v1`.

## City Run: reglas implementadas (`city-run/city-run.js`, `city-run/city-run.css`)

- Juego de hablar por parejas o equipos (máximo 4, `MAX_TEAMS`): el conductor no ve la pantalla y usa el teclado; un solo navegador ve el mapa y da instrucciones en inglés.
- Una tecla = un paso: `↑` avanza una casilla, `←` `→` giran 90° sin moverse, `Espacio` abre la puerta de una parada. Los controles son relativos al vehículo, nunca al mapa.
- Ciudad de 13×10 casillas generada al azar (`makeCity`): calles cada 3 casillas, 12 edificios de 2×2, `CLOSED` calles cortadas. Todos los equipos juegan la misma ciudad en espejo (`flip`) para que nadie copie la ruta.
- Objetivo: visitar todas las paradas en cualquier orden y luego llegar a B. Gana el menor tiempo total (suma de rondas).
- Penalizaciones en segundos (`PEN`): choque +3, semáforo en rojo +5, letra equivocada +2, puerta equivocada +3 (Mystery), tren +5, "Not English" +5 (botón del profesor). Sin vidas ni eliminación.
- Niveles (`LEVELS`): Easy (1 parada), Medium (2 paradas + semáforos), Hard (3 paradas + semáforos + palabra a deletrear en cada puerta).
- Misiones (`MISSIONS`): el nivel marca la dificultad y la misión el tipo de trabajo. El profesor elige una, o "Mix" (una distinta por ronda; Quiz doors solo entra en Hard porque necesita teclado). Todos los equipos juegan la misma misión en cada ronda.
  - Classic: paradas en cualquier orden. Delivery: recoger y entregar en orden (1 paquete en Easy, 2 en el resto). Taxi: 2 pasajeros; el destino aparece al recogerlo y el siguiente pasajero al dejarlo.
  - Mystery: las paradas son pistas (`clue`) y no se marcan en el mapa; puerta equivocada +3. Road works: se cierra una calle a mitad de carrera (`closeStreet`, una por parada del nivel), nunca una puerta pendiente y siempre queda ruta.
  - Train crossing: una calle interior es una vía (`rail`) y B queda al otro lado; estar en un cruce cuando pasa el tren +5. Low fuel: pasos limitados a la ruta más corta (`shortest`) + 30 %; sin gasolina termina la carrera como si se acabara el tiempo.
  - Quiz doors: en cada puerta sale una pregunta (`QUIZ`) y el conductor escribe la respuesta; tras 3 fallos se revela la letra.
- Los objetivos de la carrera están en `R.goals` (tipo `visit`, `pickup` o `drop`); B va aparte (`R.arrived`).
- Si se acaba el tiempo: límite + 30 s por cada cosa pendiente (paradas y B).
- Estado de la partida en `G`, de la carrera actual en `R`; ajustes en `S`, guardados en localStorage con la clave `sp-cityrun-v1`.
- Pendiente (ideas): estrellas por carrera, palabras y preguntas editables por el profesor, peatones.

## Trade Gate (carpeta `trade-gate/`)

- Juego cooperativo en pixel art para 2 a 4 jugadores en una pantalla (teclado o mandos). Es una página aparte, con su propio `index.html`, `css/`, `js/` (módulos ES), `data/` (JSON) y tests (`node tests/run.mjs`). Su documentación completa está en `trade-gate/README.md`.
- Por dentro no se parece a los otros dos (canvas, varios módulos, datos en JSON). En el menú tiene una tarjeta con enlaces al juego y a la hoja del profesor. El juego vuelve al hub con el enlace "← All games" (`#hub-link`), visible solo en el lobby.
- Necesita servidor (carga JSON y módulos): no funciona con `file://`. La tarjeta del hub lo avisa en ese caso.
- Su estética es pixel art con paleta propia dentro del canvas; la marca Speak Plus solo se aplica a la tarjeta del hub.

## Lantern Island (carpeta `lantern-island/`)

- Aventura cooperativa con servidor Node (`ws`, `qrcode`) y tres páginas: host (pantalla de clase), phone (mando del alumno) y teacher. La especificación tiene 8 etapas; están hechas la 1 (servidor, lobby con QR, unirse desde el móvil, movimiento en tiempo real, grupos con guardado en archivos) y la 2 (12 habilidades repartidas según el número de jugadores en `data/abilities.json`, tarjeta de rol, y pistas de Look/Read/Listen que solo recibe el móvil del jugador que usa la habilidad; el texto de las pistas nunca se envía al host ni a otros móviles) y la 3 (objetos con estado en `server/things.js`: cofre, puerta con llave, puente roto, roca, objetos e inventario, Give; tablillas que sacan tarjetas de `data/cards/` según el nivel del grupo; comprobación de respuestas en `server/cards.js`; las respuestas y códigos solo van a la página del profesor) y la 4 (misiones en `server/missions.js` con plantillas en los packs (`data/scenarios/<pack>/missions/`); panel del profesor con tres pestañas: `live.js` para el control en vivo con los comandos de `server/teacher.js`, `library.js` para el editor de tarjetas con CSV/JSON y subida de audio a `data/media/`, y grupos; pistas en tres pasos, NPC interpretado por el profesor, pausa, rescate; resultado de misión guardado en el grupo) y la 5 (`server/chat.js`: chat profesor→alumnos con enlaces solo http/https, mensajes compartibles bloqueados hasta que el profesor pulsa Unlock, ayudantes Listening/Reading, tarjetas `link` y `courier` con lugares con nombre en el JSON de la zona; `server/seed.js` añade muestras nuevas una sola vez) y la 6 (`server/monster.js`: monstruo oculto con ira 0-100 y fases wander/chase/shoot, parámetros en `data/monster.json`; roles Seer/Healer/Slayer en `room.roles`, que también puede tener el profesor; la posición del monstruo solo se envía al móvil del Seer y al panel del profesor, nunca al host; no hay game over) y la 7 (zona de playa completa con puerta de código, compuerta, placa de presión y entrega de los faroles al farero; hitos restaurables en `landmarks` del JSON de la zona, guardados en `group.island.landmarks`; `server/solver.js` comprueba que una misión se puede terminar y se usa en `npm run check`, al empezar misión y al barajar habilidades; hojas imprimibles en `public/teacher/sheet.html`). También la 8: adaptador opcional de Supabase en `server/storage/supabase.js` (REST con `fetch`, sin dependencias; tablas en `supabase/schema.sql`; la service key solo vive en el servidor), `server/copy.js` para copiar entre almacenamientos, segunda zona `data/scenarios/forest/zones/forest.json` que se abre con 2 hitos restaurados, sonidos con Web Audio en `public/shared/audio.js`. Tras editar una zona, misión o `abilities.json`, ejecutar `npm run check`. El estado y las instrucciones están en `lantern-island/README.md`.
- Motor + packs de escenarios: todo el contenido está en `data/scenarios/<pack>/` (solo datos: `pack.json`, `zones/`, `missions/`, `cards/`), se recarga sin reiniciar y se comprueba con `npm run check -- <pack>`. Packs: `beach`, `forest` y `harbor` (el ejemplo con todo). Para tareas de contenido, leer solo `lantern-island/docs/SCENARIO_GUIDE.md` y un pack de ejemplo; las instrucciones están en `lantern-island/CLAUDE.md`. Tipos de objeto en `server/kinds/` y de objetivo en `server/goals/`, un archivo cada uno.
- Personajes: al unirse, el alumno elige uno en el móvil (`public/shared/heroes.js`: 16 personajes de anime y videojuegos dibujados a 16×16, más el "Islander" original). El servidor solo acepta ids de esa lista (`cleanHero`), y el cambio (`hero {id}`) solo vale fuera de una misión. Son fan art para clase: nunca publicarlos en la web de la escuela; para publicar el juego, vaciar `HEROES`.
- Modo competitivo (`server/match.js`, números en `server/compete-config.js`, efectos en `server/sabotage.js`): una partida (match) son de 1 a 4 salas normales, una por equipo, con el mismo mapa y la misma misión pero estado totalmente separado. Solo `match.js` toca varias salas: lee sus contadores para puntuar y pone `room.effect` en la sala objetivo de un sabotaje (niebla). La pantalla grande nunca recibe el mapa de un equipo en una partida; el profesor ve todos los equipos en la tabla Teams de la pestaña Live. Una partida no se guarda en la isla del grupo. Pruebas: `test/compete.js`.
- El servidor manda en todo (posiciones, y más adelante inventarios, habilidades, monstruo); los clientes solo envían entradas. La lista de mensajes está al principio de `server/rooms.js`.
- No se abre con `file://` ni tiene tarjeta en el menú: se arranca con `npm start`. Pruebas: `npm test` (simula host y móviles).
- Pixel art dibujado en código (`public/shared/pixel.js`), con paleta propia; la marca Speak Plus solo en el lobby y el panel del profesor.

## Al añadir juegos nuevos

- Crear una carpeta en minúsculas con guiones (`mi-juego/`) con su `index.html`, su JS y su CSS. Enlazar `../shared/styles.css` y copiar la cabecera (fuentes y `<symbol id="plus">`) de `word-drop/index.html`.
- Añadir una tarjeta en la sección `#view-hub` del `index.html` de la raíz, con un enlace a `mi-juego/index.html`; el dibujo de la tarjeta va en `shared/hub.css`.
- En el juego, "← All games" vuelve a `../index.html` (en Word Drop y City Run lo hace `show('hub')`).
- Mantener la misma marca, botones grandes (mínimo 44 px) y que funcione con ratón y con táctil.
