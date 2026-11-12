# Classroom Games (Juegos para la clase)

Juegos gratuitos para clases de idiomas y de otras materias, pensados para un profe con un
portátil y un proyector, un televisor o una tablet. Los estudiantes hablan; el profe maneja la
pantalla. Cualquier materia, cualquier idioma, con la interfaz en español o en inglés. Sin
registro, sin seguimiento, y el hub funciona sin internet después de la primera visita.

*English version: [README.md](README.md).*

## Los juegos

| Juego | Qué hacen los estudiantes | Jugadores | Dispositivos de estudiantes | Necesita |
|---|---|---|---|---|
| **Lluvia de palabras** (Word Drop) | Caen palabras; los equipos responden en voz alta (o hacen una frase, la describen, preguntan) antes de que toquen el suelo | 1–8 equipos | Ninguno | Nada |
| **Silla caliente** (Hot Seat) | Un estudiante se sienta de espaldas a la pantalla; su equipo describe la palabra sin decirla | 1–8 equipos | Ninguno | Nada |
| **Carrera en la ciudad** (City Run) | Un navegador da instrucciones a un conductor que no ve el mapa | Parejas o hasta 4 equipos | Ninguno | Teclado, o el teclado de la tablet en Difícil |
| **La puerta del trueque** (Trade Gate) | Puzle cooperativo: hay que intercambiar, y cada intercambio pide una respuesta en voz alta | 2–4 | Ninguno | Teclados o mandos; una dirección web, no un archivo |
| **Talk City** | Juego de tablero tipo Monopoly: cada jugada es una frase y el profe es el banco | 2–6, niveles mezclados | Móviles opcionales | Una dirección web; Node.js para móviles |
| **Viste a tu amigo** (Dress Up Buddy) | Los más pequeños visten un personaje, oyen el nombre de la ropa en inglés y lo imprimen para colorear | 1 por dispositivo | Una tablet por niño o grupo | Nada |
| **Isla de los faroles** (avanzado) | Aventura cooperativa; cada móvil tiene habilidades que los demás necesitan | 2–6 por equipo | Un móvil cada uno | Servidor Node.js |
| **Escuadrón sigiloso** (avanzado) | Sigilo cooperativo con roles | 2–6 | Un móvil cada uno | Servidor Node.js |

## Empezar en un minuto

- **En línea**: abre la dirección de GitHub Pages del hub. Después de la primera visita también
  funciona sin conexión (en Chrome y Edge se puede instalar como una app).
- **Descargado**: descarga el ZIP, descomprímelo y abre `index.html` con doble clic. Lluvia de
  palabras, Silla caliente, Carrera en la ciudad y Viste a tu amigo funcionan así. La puerta del
  trueque y Talk City necesitan una dirección web: ejecuta `python3 -m http.server` en la carpeta
  y abre <http://localhost:8000>.

## Para profes

- **Tu propio contenido.** Escribe o pega una lista: un elemento por línea, con la respuesta
  después de `=` (`dog = perro`, `7 × 8 = 56`, `corazón = bombea la sangre`). **Listas listas para
  usar…** carga un paquete de `packs/`; **Guardar en archivo** y **Abrir archivo** guardan tus
  listas; **Copiar enlace para compartir** da un enlace que abre el juego con tu lista ya cargada
  (no se sube nada: la lista va dentro del enlace).
- **Clases.** Escribe los equipos como `Equipo A: Ana, Luis, Sara`, uno por línea, y los nombres
  salen en cada tarjeta de turno. **Guardar como clase** recuerda la lista en este computador para
  todos los juegos; **Hacer equipos** reparte los nombres al azar en 2 a 6 equipos.
- **Idioma.** El menú de arriba cambia la interfaz entre español e inglés. El contenido puede estar
  en cualquier idioma: en Carrera en la ciudad, si cargas el pueblo en español, el botón del profe
  dice "No habla en español".
- **Tus datos se quedan en el navegador.** Opciones, clases y listas se guardan solo en este
  navegador. No se envía nada.

## Colaborar

Juegos nuevos, paquetes de contenido y traducciones son bienvenidos: ver
[CONTRIBUTING.md](CONTRIBUTING.md) (tiene un resumen en español).

## Licencia

Código: [MIT](LICENSE). Contenido (listas, lugares, preguntas, cartas, misiones): CC BY 4.0.
Fuentes: SIL Open Font License. Los nombres y el logo de Speak Plus no están incluidos en la
licencia: ver [TRADEMARKS.md](TRADEMARKS.md).
