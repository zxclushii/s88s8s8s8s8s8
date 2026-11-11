// Глянцевые кнопки в духе Vista/Aero — как на monotonousreign.neocities.org.
// Всё рисуется из JS как SVG: векторное, чёткое на любом экране, без картинок.

const SVG_NS = "http://www.w3.org/2000/svg";
// id градиентов глобальны на всю страницу — у каждой иконки свои.
let nextId = 0;

function svg(tag, attrs = {}, children = []) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) {
        node.setAttribute(name, String(value));
    }
    node.append(...children);
    return node;
}

/** Вертикальный градиент в координатах иконки; stops: [offset, color, opacity]. */
function verticalGradient(id, y1, y2, stops) {
    return svg("linearGradient", { id, gradientUnits: "userSpaceOnUse", x1: 0, y1, x2: 0, y2 },
        stops.map(([offset, color, opacity = 1]) =>
            svg("stop", { offset, "stop-color": color, "stop-opacity": opacity })));
}

// Значки на сетке 24×24: "fill" — залитая фигура, "line" — линия.
const GLYPHS = {
    play: [["fill", "M8.6 5.6 L18.8 12 L8.6 18.4 Z"]],
    pause: [["fill", "M7 5.4 H10.6 V18.6 H7 Z"], ["fill", "M13.4 5.4 H17 V18.6 H13.4 Z"]],
    previous: [["fill", "M5.4 5.6 H8.2 V18.4 H5.4 Z"], ["fill", "M19.2 5.8 L9.6 12 L19.2 18.2 Z"]],
    next: [["fill", "M18.6 5.6 H15.8 V18.4 H18.6 Z"], ["fill", "M4.8 5.8 L14.4 12 L4.8 18.2 Z"]],
    shuffle: [
        ["line", "M3 17 H6.4 C10.8 17 12.6 7 17 7 H19.8"],
        ["line", "M17.4 4.6 L19.8 7 L17.4 9.4"],
        ["line", "M3 7 H6.4 C8.3 7 9.5 8.4 10.5 10.1"],
        ["line", "M13.5 13.9 C14.5 15.6 15.7 17 17 17 H19.8"],
        ["line", "M17.4 14.6 L19.8 17 L17.4 19.4"],
    ],
    repeat: [
        ["line", "M4.4 11.6 V9.8 A3.6 3.6 0 0 1 8 6.2 H18.8"],
        ["line", "M16.4 3.8 L18.8 6.2 L16.4 8.6"],
        ["line", "M19.6 12.4 V14.2 A3.6 3.6 0 0 1 16 17.8 H5.2"],
        ["line", "M7.6 15.4 L5.2 17.8 L7.6 20.2"],
    ],
    // динамик: громко (две волны), тихо (одна), без звука (крестик)
    volumeHigh: [
        ["fill", "M3.5 9.4 H7.2 L12.4 5.2 V18.8 L7.2 14.6 H3.5 Z"],
        ["line", "M15.4 9.3 C16.4 10.1 16.9 11 16.9 12 C16.9 13 16.4 13.9 15.4 14.7"],
        ["line", "M17.9 6.6 C19.6 8 20.5 9.9 20.5 12 C20.5 14.1 19.6 16 17.9 17.4"],
    ],
    volumeLow: [
        ["fill", "M3.5 9.4 H7.2 L12.4 5.2 V18.8 L7.2 14.6 H3.5 Z"],
        ["line", "M15.4 9.3 C16.4 10.1 16.9 11 16.9 12 C16.9 13 16.4 13.9 15.4 14.7"],
    ],
    volumeMute: [
        ["fill", "M3.5 9.4 H7.2 L12.4 5.2 V18.8 L7.2 14.6 H3.5 Z"],
        ["line", "M15.6 9.4 L20.8 14.6"],
        ["line", "M20.8 9.4 L15.6 14.6"],
    ],
};

function glyphPaths(kind, paint) {
    return GLYPHS[kind].map(([type, d]) => svg("path", type === "line"
        ? { d, fill: "none", stroke: paint, "stroke-width": 2.4, "stroke-linecap": "round", "stroke-linejoin": "round" }
        // обводка того же цвета скругляет острые углы треугольников
        : { d, fill: paint, stroke: paint, "stroke-width": 1.5, "stroke-linejoin": "round" }));
}

/** Чёрный глянцевый значок без подложки: тело-градиент и блик по верхней половине. */
export function glossyGlyph(kind, size) {
    const id = `gloss${++nextId}`;
    return svg("svg", { viewBox: "0 0 24 24", width: size, height: size, "aria-hidden": "true", overflow: "visible" }, [
        svg("defs", {}, [
            verticalGradient(`${id}-body`, 4, 20, [[0, "#6b6b6b"], [0.47, "#1c1c1c"], [0.53, "#020202"], [1, "#262626"]]),
            verticalGradient(`${id}-shine`, 4, 20, [
                [0, "#fff", 0.75], [0.46, "#fff", 0.16], [0.5, "#fff", 0], [0.86, "#fff", 0], [1, "#fff", 0.18],
            ]),
            // блик кладём только на сам значок, а не на весь квадрат
            svg("mask", { id: `${id}-mask`, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: 24, height: 24 },
                glyphPaths(kind, "#fff")),
        ]),
        ...glyphPaths(kind, `url(#${id}-body)`),
        svg("rect", { width: 24, height: 24, fill: `url(#${id}-shine)`, mask: `url(#${id}-mask)` }),
    ]);
}

/** Плоский значок цвета текста, высотой в букву — для надписей (бегущая строка). */
export function flatGlyph(kind) {
    return svg("svg", { viewBox: "0 0 24 24", width: "1em", height: "1em", "aria-hidden": "true" }, glyphPaths(kind, "currentColor"));
}

/** Цифра «1» внутри петли repeat — режим «повторять один трек», как в Spotify. */
export function repeatOneMark() {
    return svg("text", {
        x: 12, y: 14.7, "text-anchor": "middle", "font-size": 7.5, "font-weight": 700,
        "font-family": "Arial, sans-serif", fill: "#000",
    }, ["1"]);
}

/** Главная кнопка: чёрный глянцевый шар, внутри серебристый play или pause. */
export function glossyOrb(size) {
    const id = `orb${++nextId}`;
    const glyph = (kind, dx) => svg("g", {
        transform: `translate(${24 + dx} 24) scale(0.92) translate(-12 -12)`,
        filter: `url(#${id}-shadow)`,
    }, glyphPaths(kind, `url(#${id}-metal)`));
    // треугольник визуально кажется левее центра — сдвигаем чуть вправо
    const play = glyph("play", 1.2);
    const pause = glyph("pause", 0);

    const root = svg("svg", { viewBox: "0 0 48 48", width: size, height: size, "aria-hidden": "true", overflow: "visible" }, [
        svg("defs", {}, [
            svg("radialGradient", { id: `${id}-body`, cx: 0.5, cy: 0.78, r: 0.8 }, [
                svg("stop", { offset: 0, "stop-color": "#4d4d4d" }),
                svg("stop", { offset: 0.55, "stop-color": "#111" }),
                svg("stop", { offset: 1, "stop-color": "#000" }),
            ]),
            verticalGradient(`${id}-shine`, 3, 26, [[0, "#fff", 0.8], [1, "#fff", 0.04]]),
            svg("radialGradient", { id: `${id}-glow`, cx: 0.5, cy: 1, r: 0.7 }, [
                svg("stop", { offset: 0, "stop-color": "#fff", "stop-opacity": 0.5 }),
                svg("stop", { offset: 1, "stop-color": "#fff", "stop-opacity": 0 }),
            ]),
            verticalGradient(`${id}-metal`, 5, 19, [[0, "#fff"], [0.5, "#ececec"], [0.52, "#c2c2c2"], [1, "#f4f4f4"]]),
            svg("filter", { id: `${id}-shadow`, x: -0.3, y: -0.3, width: 1.6, height: 1.6 }, [
                svg("feDropShadow", { dx: 0, dy: 0.6, stdDeviation: 0.7, "flood-color": "#000", "flood-opacity": 0.9 }),
            ]),
        ]),
        svg("circle", { cx: 24, cy: 24, r: 23, fill: `url(#${id}-body)`, stroke: "#000", "stroke-width": 1 }),
        svg("circle", { cx: 24, cy: 24, r: 21.6, fill: "none", stroke: "#fff", "stroke-opacity": 0.22, "stroke-width": 0.8 }),
        svg("ellipse", { cx: 24, cy: 41, rx: 13, ry: 5, fill: `url(#${id}-glow)` }),
        svg("ellipse", { cx: 24, cy: 14.5, rx: 17.5, ry: 11.5, fill: `url(#${id}-shine)` }),
        play,
        pause,
    ]);

    return {
        root,
        setPlaying(isPlaying) {
            play.style.display = isPlaying ? "none" : "";
            pause.style.display = isPlaying ? "" : "none";
        },
    };
}
