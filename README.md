# Speak Plus Games

Juegos y actividades para profesores de inglés, con la marca de Speak Plus (スピークプラス).
Juegos: **Word Drop** y **City Run**.

## Cómo abrirlo

No necesita instalación ni servidor. Abre `index.html` en el navegador.

En VS Code también puedes usar la extensión **Live Server** (clic derecho en `index.html` → *Open with Live Server*) para que la página se recargue sola al guardar cambios.

## Estructura

```
speak-plus-games/
├── index.html          Pantallas: menú de juegos, configuración y juego
├── css/styles.css      Estilos, colores de marca y modo oscuro
├── css/city-run.css    Estilos de City Run
├── js/word-drop.js     Toda la lógica de Word Drop
├── js/city-run.js      Toda la lógica de City Run
├── CLAUDE.md           Contexto del proyecto para Claude Code
└── README.md
```

## Word Drop: reglas

- El profesor escribe las palabras (separadas por `,`, `、` o saltos de línea) y los equipos o alumnos (máximo 8).
- Las palabras se reparten por igual entre los equipos; cada equipo solo ve las suyas.
- Las palabras caen. Si la respuesta es correcta, el profesor toca la palabra: desaparece y el equipo suma 1 punto.
- Si una palabra llega al suelo, el equipo pierde una vida y el turno pasa al siguiente equipo.
- La palabra fallada pasa una sola vez al siguiente equipo como palabra **Bonus**. Si también la falla, se pierde.
- Al final se muestran las palabras que nadie respondió, para dar feedback, y las que se respondieron en el bonus.
- Opciones: vidas (1–5), velocidad (5 niveles), palabras en pantalla a la vez (1–4) y sonido.
- Atajos: `Espacio` empezar / pausar, `Esc` pausar.

La configuración se guarda en el navegador (localStorage).

## City Run: reglas

- Dos equipos o parejas (máximo 4). El **conductor** se sienta de espaldas a la pantalla con el teclado; el **navegador** ve el mapa y da instrucciones en inglés.
- Una tecla es un paso: `↑` avanza una casilla, `←` `→` giran sin moverse, `Espacio` abre la puerta de una parada.
- Hay que visitar todas las paradas y después llegar a **B**. Gana el menor tiempo total.
- Penalizaciones: choque +3 s, semáforo en rojo +5 s, letra equivocada +2 s, y el botón del profesor "Not English" +5 s.
- Niveles: Easy (1 parada), Medium (2 paradas y semáforos), Hard (3 paradas, semáforos y una palabra que deletrear en cada puerta).
- Misiones (se eligen en la configuración, o **Mix** para una distinta en cada ronda):
  - **Classic**: visitar las paradas en cualquier orden.
  - **Delivery**: recoger cada paquete y entregarlo, en el orden de la lista.
  - **Taxi**: el destino aparece al recoger al pasajero, y el siguiente pasajero al dejarlo.
  - **Mystery**: las paradas son pistas, no nombres. Puerta equivocada +3 s.
  - **Road works**: se cierran calles a mitad de carrera.
  - **Train crossing**: una vía corta la ciudad. Estar en un cruce cuando pasa el tren +5 s.
  - **Low fuel**: gasolina para pocos pasos de más; si se acaba, termina la carrera.
  - **Quiz doors**: en cada puerta el navegador hace una pregunta y el conductor escribe la respuesta. Necesita teclado.
- Cada equipo juega la misma ciudad en espejo. Cada ronda genera una ciudad nueva.
- En un portátil conviene usar un teclado aparte o extender la pantalla, para que el conductor no vea el mapa.
