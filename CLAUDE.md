# Classroom Games (antes Speak Plus Games) — contexto para Claude Code

Hub de juegos para profesores, nacido en Speak Plus (una eikaiwa en Japón) y pensado para ser un repositorio público al que otros profes envían juegos (con aprobación por pull request). Lo usa el profesor en un portátil con proyector o en una tablet, delante de la clase. Cualquier materia y cualquier idioma; interfaz en inglés y español. Se publica en GitHub Pages (`.github/workflows/pages.yml`). Guía para colaboradores: `CONTRIBUTING.md`.

## Stack

- HTML, CSS y JavaScript sin frameworks ni build. Los juegos estáticos se abren con `file://` o desde GitHub Pages, y no cargan nada de otros sitios (ni Google Fonts: las fuentes están en `shared/fonts/`, OFL).
- Una carpeta por juego (`word-drop/`, `hot-seat/`, `city-run/`, `trade-gate/`, `speak-plus-city/`, `dress-up-buddy/`, `lantern-island/`, `Commands/stealth-squad/`), cada una con su `index.html` (o README para los de servidor), un `game.json` (manifiesto: edades, niveles, jugadores, tiempo, dispositivos, servidor; esquema en `tools/game.schema.json`) y un `card.svg` (dibujo de la tarjeta con las clases `f-*`/`s-*` de `shared/hub.css`).
- El `index.html` de la raíz es el menú: `shared/hub.js` lo dibuja desde `shared/registry.js`, que se genera con `node tools/build.mjs` a partir de los `game.json`, `card.svg` y `packs/*.json`. Filtros por alumnos, edad, nivel, tiempo, habilidad y "sin dispositivos". Los juegos con `needs.server: "node"` salen en la sección "Advanced".
- `shared/`: `config.js` (marca y idioma por defecto), `kit.js` (window.Kit: marca, textos `t()`, `Kit.store`, `parseItems`/`parseTeams`, paquetes, clases guardadas, sonido, wake lock, pantalla completa, service worker), `strings.js` (textos comunes y del hub, en/es), `styles.css` (tokens de color de las dos marcas, claro y oscuro, y piezas comunes), `hub.css`, `hub.js`, `fonts.css`, `registry.js` y `precache.js` (generados: no editar a mano).
- Orden de carga en cada juego estático: `config.js`, `kit.js`, `strings.js`, `registry.js`, el `strings.js` del juego; luego `fonts.css`, `styles.css` y el CSS del juego. Todo script clásico (no módulos) para que funcione con `file://`.
- Textos: todo lo que ve el profe va en `strings.js` (en y es) con prefijo del juego (`wd.`, `cr.`, `hs.`) y se usa con `t('clave', {n})`; en HTML, `data-i18n`, `data-i18n-html` y `data-i18n-attr`. El idioma sale de `?lang=`, de `hub-lang-v1` o del navegador. El contenido (palabras, lugares, preguntas) no es UI: viene de paquetes o de lo que escribe el profe.
- Contenido: `packs/*.json` (CC BY 4.0), tipos `word-list` e `questions` (`items` de `{prompt, answer}`) y `places` (12 `{icon, name, clue, code}` + `phrases`). En el juego, `Kit.mountContent` añade "Ready-made lists…", abrir/guardar archivo y enlace para compartir (`#share=` con la lista dentro del enlace). Formato de texto: una línea por elemento, respuesta después de `=`.
- Clases: equipos como `Team A: Aiko, Ken` (los miembros salen en la tarjeta de turno). `Kit.mountRoster` guarda clases en `hub-classes-v1` (compartidas por todos los juegos) y reparte nombres en equipos.
- Sin conexión: `sw.js` guarda los archivos de `shared/precache.js` (hub y juegos con `offline: true`). No se registra en `localhost` para no servir copias viejas mientras se edita.
- Comprobar antes de subir: `node tools/build.mjs` y `node tools/check.mjs` (manifiestos, paquetes, archivos generados al día, nada externo, textos en todos los idiomas). CI: `.github/workflows/check.yml` (más los tests de cada juego).
- Para publicar el repositorio sin historial (el historial privado tuvo fan art): `tools/publish-fresh-repo.sh <carpeta>`.

## Marca (opcional)

- Por defecto la marca es neutra ("Classroom Games": burbuja de diálogo, verde azulado `#0E6363` y naranja `#C2410C`). La marca Speak Plus es el preset `speakplus`: `brand: 'speakplus'` en `shared/config.js`, o `?brand=speakplus` en la dirección (se recuerda en `hub-brand-v1`). Las páginas ponen `<div data-logo></div>` y `kit.js` dibuja el logo de la marca activa.
- Colores siempre con los tokens de `shared/styles.css` (`--fg`, `--primary`, `--accent`…), con versión para modo oscuro; nunca colores de marca sueltos en un juego.
- Marca Speak Plus (respetar cuando está activa):

| Token     | Hex       | Uso                          |
|-----------|-----------|------------------------------|
| Washi     | `#F7F4EE` | Fondo                        |
| Indigo    | `#1F2F5C` | Texto, formas, botón primario|
| Vermilion | `#E8483B` | Acento y el "+" del logo     |
| Sky       | `#9DB4E0` | Detalles secundarios, foco   |

- Logo "Exponente": `speak` en Lexend Bold minúscula + un "+" bermellón con puntas redondas, girado 12° y elevado como exponente (está en `kit.js`). El "+" nunca debe parecer una cruz médica. El bermellón no se usa para texto pequeño.
- Los nombres y el logo de Speak Plus no están bajo la licencia abierta (`TRADEMARKS.md`, `LICENSE-CONTENT.md`). Licencias: código MIT, contenido CC BY 4.0, fuentes OFL.

## Word Drop: reglas implementadas (`word-drop/word-drop.js`)

- Contenido: una línea por palabra, con respuesta opcional después de `=` (`perro = dog`); también listas con comas. Las respuestas salen al fallar una palabra y en la pantalla final.
- Palabras repartidas por igual entre equipos (`floor(total / equipos)`); cada equipo tiene su propio `deck`. Máximo 8 equipos (`MAX_TEAMS`).
- Tarea (`S.task`): decir la respuesta, hacer una frase, describirla sin decirla o hacer una pregunta; sale en la tarjeta de turno y arriba en el campo.
- Turnos: un equipo juega hasta que una palabra toca el suelo → pierde una vida → turno al siguiente equipo vivo con palabras. Vidas "Off" (`S.lives = 0`): nadie queda eliminado, un fallo solo pasa el turno y gana quien tenga más puntos.
- Palabra fallada: pasa una sola vez al inicio del deck del siguiente equipo vivo, marcada como "Bonus" (`G.passed`, por `prompt`). Si se falla otra vez, va a `G.failed`.
- Las otras palabras en pantalla cuando hay un fallo vuelven al deck del mismo equipo.
- Fin de partida: queda un solo equipo, o ningún equipo tiene palabras. Gana el último en pie; si todos acaban sus palabras (o sin vidas), gana quien tenga más puntos. "End game" muestra "Game ended" y la clasificación, sin ganador.
- Pantalla final: clasificación, "Nobody answered", "Not played" (las que no llegaron a caer) y "Answered on the bonus", con respuestas.
- Estado del juego en `G`; ajustes en `S`, guardados en localStorage con la clave `sp-worddrop-v1`.

## Hot Seat (`hot-seat/`, también la plantilla para juegos nuevos)

- Un alumno de espaldas a la pantalla; su equipo describe la palabra sin decirla. Botones grandes "Got it" (→ / Enter), "Skip" (S, con límite por turno) y "Said the word" (X). Tiempo por turno 30–120 s, turnos por equipo 1–3; la silla rota entre los miembros del equipo.
- Con listas `prompt = answer` se elige qué lado muestra la tarjeta. Las saltadas vuelven al mazo y salen en "Words to go over" al final.
- Ajustes en `hub-hotseat-v1`. El código está comentado para que sirva de modelo (`CONTRIBUTING.md`).

## City Run: reglas implementadas (`city-run/city-run.js`, `city-run/city-run.css`)

- Juego de hablar por parejas o equipos (máximo 4, `MAX_TEAMS`): el conductor no ve la pantalla y usa el teclado; un solo navegador ve el mapa y da instrucciones.
- Una tecla = un paso: `↑` avanza una casilla, `←` `→` giran 90° sin moverse, `Espacio` abre la puerta de una parada. Los controles son relativos al vehículo, nunca al mapa.
- Contenido (sección "Places, phrases and quiz questions"): 12 lugares `icono | nombre | pista | palabra` (paquete `places`), frases útiles (se ven en la configuración y durante la carrera), idioma de los alumnos (`S.lang`: cambia "Not English" por "Not Spanish"…) y preguntas `pregunta = respuesta` (paquete `questions`). Pueblos incluidos: `city-en` y `ciudad-es`.
- Ciudad de 13×10 casillas generada al azar (`makeCity`, con límite de intentos: si cuesta, cierra menos calles): calles cada 3 casillas, 12 edificios de 2×2, `CLOSED` calles cortadas. Todos los equipos juegan la misma ciudad en espejo (`flip`).
- Objetivo: visitar todas las paradas en cualquier orden y luego llegar a B. Gana el menor tiempo total (suma de rondas). La tarjeta de turno pide a los demás equipos que anoten tres frases del navegador.
- Penalizaciones en segundos (`PEN`): choque +3, semáforo en rojo +5, letra equivocada +2, puerta equivocada +3 (Mystery), tren +5, "Not English" +5 (botón del profesor), abrir la puerta sin deletrear +5 (botón "Open it" del cuadro de la puerta, para no quedarse atascados).
- Deletrear y responder: se compara sin mayúsculas ni tildes (`Kit.fold`: "cancion" abre CANCIÓN); los espacios se saltan solos. En pantallas táctiles sale un cuadro de texto que abre el teclado de la tablet.
- Niveles (`LEVELS`): Easy (1 parada), Medium (2 paradas + semáforos), Hard (3 paradas + semáforos + palabra a deletrear en cada puerta).
- Misiones (`MISSIONS`): el nivel marca la dificultad y la misión el tipo de trabajo. El profesor elige una, o "Mix" (una distinta por ronda; Quiz doors solo entra en Hard). Todos los equipos juegan la misma misión en cada ronda.
  - Classic: paradas en cualquier orden. Delivery: recoger y entregar en orden (1 paquete en Easy, 2 en el resto). Taxi: 2 pasajeros; el destino aparece al recogerlo y el siguiente pasajero al dejarlo.
  - Mystery: las paradas son pistas (`clue`) y no se marcan en el mapa; puerta equivocada +3. Road works: se cierra una calle a mitad de carrera (`closeStreet`, una por parada del nivel), nunca una puerta pendiente y siempre queda ruta.
  - Train crossing: una calle interior es una vía (`rail`) y B queda al otro lado; estar en un cruce cuando pasa el tren +5. Low fuel: pasos limitados a la ruta más corta (`shortest`) + 30 %; sin gasolina termina la carrera.
  - Quiz doors: en cada puerta sale una pregunta (`QUIZ`, del contenido) y el conductor escribe la respuesta; tras 3 fallos se revela la letra. Necesita al menos 6 preguntas.
- Los objetivos de la carrera están en `R.goals` (tipo `visit`, `pickup` o `drop`); B va aparte (`R.arrived`).
- Si se acaba el tiempo: límite + 30 s por cada cosa pendiente (paradas y B).
- Estado de la partida en `G`, de la carrera actual en `R`; ajustes y contenido en `S`, guardados en localStorage con la clave `sp-cityrun-v1`.
- Pendiente (ideas): estrellas por carrera, peatones.

## Trade Gate (carpeta `trade-gate/`)

- Juego cooperativo en pixel art para 2 a 4 jugadores en una pantalla (teclado o mandos). Es una página aparte, con su propio `index.html`, `css/`, `js/` (módulos ES), `data/` (JSON) y tests (`node tests/run.mjs`). Su documentación completa está en `trade-gate/README.md`.
- Por dentro no se parece a los otros dos (canvas, varios módulos, datos en JSON). En el menú tiene una tarjeta (desde su `game.json`) con enlaces al juego y a la hoja del profesor. Interfaz solo en inglés por ahora (los textos están en `data/config.json`). El juego vuelve al hub con el enlace "← All games" (`#hub-link`), visible solo en el lobby.
- Necesita servidor (carga JSON y módulos): no funciona con `file://`. La tarjeta del hub lo avisa en ese caso.
- Su estética es pixel art con paleta propia dentro del canvas; la marca Speak Plus solo se aplica a la tarjeta del hub.

## Talk City / Speak Plus City (carpeta `speak-plus-city/`)

- Nombre neutro "Talk City"; con la marca Speak Plus se llama "Speak Plus City". `js/brand.js` (script clásico en cada página) elige la marca con `?brand=` o `hub-brand-v1`, dibuja el logo, cambia `[data-game-name]` y el título, y pone `window.SPC_NAME`. Paleta de las dos marcas en `css/city.css`; Lexend autoalojada en `fonts/`.

- Juego de tablero tipo Monopoly para hablar: 48 casillas en el borde de una cuadrícula de 13×13, 2 a 6 jugadores con nivel Beginner / Intermediate / Advanced. Cada acción se pide con una frase ("Say it!") y el profesor la aprueba. Documentación completa en `speak-plus-city/README.md`.
- Dos páginas en el mismo navegador: `teacher.html` (banco, portátil) y `board.html` (proyector), más `editor.html` (editor de contenido), `phone.html` (móvil del alumno) e `index.html` (inicio). Necesita servidor (módulos ES, `fetch` y `BroadcastChannel`): `start.command`, `start.bat`, `npm start` o servir el hub. Carpeta autónoma: copia los tokens de las dos marcas en `css/city.css`, no enlaza `../shared/`.
- Alquiler (`settings.rentRule`, por defecto `'ask'`): caer en una propiedad ajena no cobra nada; el dueño tiene que pedirlo antes de la siguiente tirada (`state.rentDue`, acción `claimRent`), si no, no se paga. `'pay'` es la regla antigua. Las cartas Chance nunca dependen de que otro jugador dé dinero o propiedades: los intercambios son parte del juego.
- Modo móviles (opcional, `settings.phones`): `server/index.js` (Node, `ws` y `qrcode`) sirve las páginas y crea salas con QR, pero no sabe nada del juego: solo pasa mensajes entre la ventana del profesor (`js/phones.js`) y los móviles (`js/phone.js`). El profesor sigue siendo la única fuente de verdad; `state.seats` une cada móvil con su jugador y `checkPhone` en `state.js` hace que un móvil solo actúe como su jugador. Cada móvil recibe su vista de `js/views.js`, que nunca incluye el dinero, las propiedades ni la misión de otros, ni quién es dueño de qué; en modo móviles el tablero también lo oculta. Con móviles (cada uno se apaga en Settings): `playerPay` (pestaña Pay: acción `payPlayer`, el dinero pasa al momento sin el profesor; `payRent`: el visitante paga el alquiler pedido desde su móvil; `state.lastPay` avisa a los dos móviles), `rentAlert` (solo el móvil del dueño recibe `view.rentAlert` cuando alguien cae en su propiedad) y `askSalary` (al pasar Start el sueldo queda en `player.salaryDue`; el alumno lo pide con `askSalary`, que va a `state.requests`, y el profesor paga con `paySalary`). En internet: el servicio `speak-plus-city` de `render.yaml`. Pruebas: `tests/server.mjs`.
- La ventana del profesor es la única fuente de verdad. Toda la lógica está en `js/state.js`: `apply(state, action, ctx)` devuelve un estado nuevo, sin DOM (se prueba en Node con `npm test`). El tablero solo envía acciones de `BOARD_ACTIONS`; el profesor las aplica, guarda en localStorage (`sp-city-state-v1`) tras cada acción y manda el estado (sin log ni notas). Mensajes en `js/sync.js`. Las animaciones son entradas de `state.fx` con id creciente.
- Contenido editable en `data/content.json` (casillas, cartas Chance y Mystery por nivel, misiones, reglas de la ronda, Black Market, retos de Coffee Break, `sayIt` = frases, vocabulario y ejemplos de cada acción, que también son el banco de pistas). `validateContent` en `js/content.js` lo comprueba; el editor guarda una copia en `sp-city-content-v1`. Las casillas se copian al estado al empezar, así que una partida guardada conserva su tablero.
- Tras cambiar reglas o contenido, ejecutar `npm test` dentro de `speak-plus-city/`.

## Lantern Island (carpeta `lantern-island/`)

- Aventura cooperativa con servidor Node (`ws`, `qrcode`) y tres páginas: host (pantalla de clase), phone (mando del alumno) y teacher. La especificación tiene 8 etapas; están hechas la 1 (servidor, lobby con QR, unirse desde el móvil, movimiento en tiempo real, grupos con guardado en archivos) y la 2 (12 habilidades repartidas según el número de jugadores en `data/abilities.json`, tarjeta de rol, y pistas de Look/Read/Listen que solo recibe el móvil del jugador que usa la habilidad; el texto de las pistas nunca se envía al host ni a otros móviles) y la 3 (objetos con estado en `server/things.js`: cofre, puerta con llave, puente roto, roca, objetos e inventario, Give; tablillas que sacan tarjetas según el nivel del grupo, de `data/questions.json` (todas las preguntas en una sola lista para copiar y pegar; `readBank` en `server/cards.js`; `npm run check` la comprueba y cuenta preguntas por tipo y nivel), de los packs y de las que crea el profesor en el panel (`data/cards/`); comprobación de respuestas en `server/cards.js`; las respuestas y códigos solo van a la página del profesor) y la 4 (misiones en `server/missions.js` con plantillas en los packs (`data/scenarios/<pack>/missions/`); panel del profesor con tres pestañas: `live.js` para el control en vivo con los comandos de `server/teacher.js`, `library.js` para el editor de tarjetas con CSV/JSON y subida de audio a `data/media/`, y grupos; pistas en tres pasos, NPC interpretado por el profesor, pausa, rescate; resultado de misión guardado en el grupo) y la 5 (`server/chat.js`: chat profesor→alumnos con enlaces solo http/https, mensajes compartibles bloqueados hasta que el profesor pulsa Unlock, ayudantes Listening/Reading, tarjetas `link` y `courier` con lugares con nombre en el JSON de la zona) y la 6 (`server/monster.js`: monstruo oculto con ira 0-100 y fases wander/chase/shoot, parámetros en `data/monster.json`; roles Seer/Healer/Slayer en `room.roles`, que también puede tener el profesor; la posición del monstruo solo se envía al móvil del Seer y al panel del profesor, nunca al host; no hay game over) y la 7 (zona de playa completa con puerta de código, compuerta, placa de presión y entrega de los faroles al farero; hitos restaurables en `landmarks` del JSON de la zona, guardados en `group.island.landmarks`; `server/solver.js` comprueba que una misión se puede terminar y se usa en `npm run check`, al empezar misión y al barajar habilidades; hojas imprimibles en `public/teacher/sheet.html`). También la 8: adaptador opcional de Supabase en `server/storage/supabase.js` (REST con `fetch`, sin dependencias; tablas en `supabase/schema.sql`; la service key solo vive en el servidor), `server/copy.js` para copiar entre almacenamientos, segunda zona `data/scenarios/forest/zones/forest.json` que se abre con 2 hitos restaurados, sonidos con Web Audio en `public/shared/audio.js`. Tras editar una zona, misión o `abilities.json`, ejecutar `npm run check`. El estado y las instrucciones están en `lantern-island/README.md`.
- Motor + packs de escenarios: todo el contenido está en `data/scenarios/<pack>/` (solo datos: `pack.json`, `zones/`, `missions/`, `cards/`), se recarga sin reiniciar y se comprueba con `npm run check -- <pack>`. Packs: `beach`, `forest`, `harbor` (el ejemplo con todo), `reef` y `city` (Maple City: el ejemplo de las funciones nuevas: códigos de palabras y símbolos, pistas que se combinan, puzzle lógico, puertas con reloj, comerciantes, tiendas con precios, objetos con dibujo propio; ver sección 12 de la guía). Para tareas de contenido, leer solo `lantern-island/docs/SCENARIO_GUIDE.md` y un pack de ejemplo; las instrucciones están en `lantern-island/CLAUDE.md`. Tipos de objeto en `server/kinds/` y de objetivo en `server/goals/`, un archivo cada uno.
- Personajes: al unirse, el alumno elige uno en el móvil: el "Islander" y los originales de `public/shared/heroes.js` (Fox, Robo, Frog, Penguin, dibujados a 16×16). Los 16 personajes de anime y videojuegos son fan art solo para clase y están en `public/shared/heroes-local.js`, que está en `.gitignore`: nunca subirlo al repositorio ni publicarlo. `heroes.js` lo importa si existe y los marca `fanArt`. El servidor solo acepta ids de la lista (`cleanHero(id, config.fanArt)`), y el cambio (`hero {id}`) solo vale fuera de una misión.
- Modo competitivo (`server/match.js`, números en `server/compete-config.js`, efectos en `server/sabotage.js`): una partida (match) son de 1 a 4 salas normales, una por equipo, con el mismo mapa y la misma misión pero estado totalmente separado. Solo `match.js` toca varias salas: lee sus contadores para puntuar y pone `room.effect` en la sala objetivo de un sabotaje (niebla). La pantalla grande nunca recibe el mapa de un equipo en una partida; el profesor ve todos los equipos en la tabla Teams de la pestaña Live. Una partida no se guarda en la isla del grupo. Pruebas: `test/compete.js`.
- El servidor manda en todo (posiciones, y más adelante inventarios, habilidades, monstruo); los clientes solo envían entradas. La lista de mensajes está al principio de `server/rooms.js`.
- No se abre con `file://`: se arranca con `npm start`. En el menú sale en la sección "Advanced" con el comando para arrancarlo. Pruebas: `npm test` (simula host y móviles).
- En internet: Render + Supabase con `render.yaml` en la raíz (región Singapur, `rootDir: lantern-island`, `STORAGE=supabase`); pasos en `lantern-island/docs/RENDER.md`. En modo hosted (`PUBLIC_URL` o `RENDER_EXTERNAL_URL`) el fan art está apagado (`config.fanArt`, `FAN_ART=on|off`): `/shared/heroes-local.js` nunca se sirve y el servidor rechaza sus ids; los personajes originales siguen disponibles. El repositorio puede ser público porque el fan art no está en él.
- Pixel art dibujado en código (`public/shared/pixel.js`), con paleta propia. El logo de Speak Plus del lobby y del panel del profesor solo se ve con `?brand=speakplus` (`public/shared/brand.js` y una regla en `base.css`).

## Dress Up Buddy (carpeta `dress-up-buddy/`)

- App para vestir un personaje (tema "What we wear") para niños de 4 a 10 años; luego se imprime como página para colorear. HTML/CSS/JS sin build, funciona con `file://` y en GitHub Pages (`.nojekyll` en la raíz). Documentación en `dress-up-buddy/README.md`.
- Sin la marca Speak Plus (lo pidió el profesor): ni logo ni texto de la escuela, paleta propia y fuente Fredoka (autoalojada en `fonts/`). No enlaza `../shared/`.
- Todo el dibujo es SVG en código: `art/core.js` (colores, modo `color`/`line`), `art/body.js` (cuerpo, pieles, caras, peinados), `art/clothes.js` (prendas, `LAYERS` = orden de capas, frases). Todas las piezas usan el mismo lienzo de 240×380 y el mismo esqueleto para los 3 cuerpos. Cada prenda tiene un `slot` (uno por slot; hat y cap comparten `head`).
- Modo `line` (impresión): rellenos blancos y líneas negras. Las frases usan a/an según el color y nada para plurales (`plural: true`).
- Elegir cuerpo, pelo o cara no habla (lo pidió el profesor). Guardado en localStorage `sp-dressup-v1` con try/catch.
- Tras tocar el dibujo: `node dress-up-buddy/tests/test.mjs` (encaje de cada prenda en los 3 cuerpos, abrigo sobre cada top, a/an, impresión solo contorno) y mirar `tests/sheet.html`.

## Stealth Squad (carpeta `Commands/stealth-squad/`)

- Juego cooperativo de sigilo en pixel art: hasta 6 alumnos con su móvil y el profesor en `/host`. Monorepo TypeScript (`shared/`, `server/` con Colyseus 0.16, `client/` con Phaser + Vite). Instrucciones completas en `Commands/stealth-squad/CLAUDE.md`; el encargo original en `Commands/claude-code-prompt-stealth-squad.md`.
- Necesita servidor y build: `npm install`, `npm run dev` en clase; `npm run build` + `npm start` en producción (un solo puerto sirve juego y página). En el menú sale en la sección "Advanced" (con el comando para arrancarlo).
- En internet: servicio `stealth-squad` en `render.yaml` (región Singapur, `rootDir: Commands/stealth-squad`, plan gratis que duerme tras 15 min sin visitas). Las salas viven en memoria: una sola instancia. Pasos en `Commands/stealth-squad/docs/DEPLOY.md`.
- `/colyseus` y `/metrics` (páginas de administración) solo se abren sin contraseña en el propio ordenador del servidor; desde otro dispositivo o en la nube piden `ADMIN_PASSWORD` (`adminOnly` en `server/src/index.ts`) y sin ella responden 404.
- La pantalla `/host` es para el portátil del profesor, no para el proyector: muestra los conos de visión, que solo debe ver el Scout.

## Al añadir juegos nuevos

- Seguir `CONTRIBUTING.md`: copiar `hot-seat/` a una carpeta en minúsculas con guiones, cambiar el juego, los textos de `strings.js` (en y es, con un prefijo propio), `game.json` y `card.svg`.
- No hace falta tocar el `index.html` de la raíz: `node tools/build.mjs` regenera `shared/registry.js` y `shared/precache.js`. Después, `node tools/check.mjs` debe decir "All checks passed."
- En el juego, "← All games" vuelve a `../index.html`.
- Botones grandes (mínimo 44 px), texto de juego que escala con la pantalla (`clamp`), ratón, táctil y teclado; nada cargado de otros sitios; dibujos propios (nunca personajes de películas, anime o videojuegos); ningún dato de alumnos fuera del navegador.
- Juegos nuevos entran con `"status": "experimental"` (etiqueta "New" en el menú) y pasan a `stable` tras probarlos en clase.
