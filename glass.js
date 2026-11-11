// Чёрное матовое стекло — как панели в десктопных плеерах с референсов: тёмная полупрозрачная заливка,
// под ней размытый фон, тонкая кромка — ярче сверху, к низу почти пропадает.
// Здесь папка и табличка на таком стекле. Размывает фон backdrop-filter у div'ов, кромки рисует SVG поверх.
// Важно: у предков стекла не должно быть filter, opacity < 1, mask и clip-path — иначе браузер размывает
// не страницу под стеклом, а пустоту внутри предка.

import { el } from "./ui.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export const GLASS_FONT = 'Inter, "Helvetica Neue", Arial, sans-serif';
export const GLASS_TEXT = "#ededed";

// Сетка, в которой нарисована папка (пиксели при ширине 168); настоящая папка — та же форма под свою ширину.
const GRID_WIDTH = 168;
export const FOLDER_ASPECT = 136 / GRID_WIDTH;
// Язычок: высота и где кончается его ровный верх (дальше — пологий скат вниз к телу).
const TAB_HEIGHT = 12;
const TAB_END = 50;
// Скат язычка: точки по горизонтали от TAB_END и по вертикали в долях высоты язычка.
const TAB_SLOPE = [[5, 0], [7.5, 0.12], [10.5, 0.38], [14, 0.72], [16.2, 0.92], [18.4, 1], [22, 1]];
const TAB_RADIUS = 11;
// Верх передней стенки; углы: верхние — у тела и стенки, нижние — общие.
const FRONT_TOP = 27;
const TOP_RADIUS = 13;
const BOTTOM_RADIUS = 17;

// Задник плотнее, передняя стенка — главное стекло: сквозь неё видно размытый фон.
const BACK = {
    background: "linear-gradient(180deg, rgba(34, 34, 34, 0.78), rgba(8, 8, 8, 0.86) 40%)",
    backdropFilter: "blur(18px) saturate(1.3)",
    WebkitBackdropFilter: "blur(18px) saturate(1.3)",
};
const FRONT = {
    background: "linear-gradient(180deg, rgba(44, 44, 44, 0.68), rgba(16, 16, 16, 0.78) 45%, rgba(3, 3, 3, 0.88))",
    backdropFilter: "blur(16px) saturate(1.2)",
    WebkitBackdropFilter: "blur(16px) saturate(1.2)",
};
// Блик сверху слева; под мышью он ярче.
const SHINE = "radial-gradient(120% 90% at 15% 0%, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0) 55%)";
const SHINE_OPACITY = { idle: 0.7, lit: 1 };
// Тени передней стенки: светлая полоска по верхнему краю, затемнение к низу, тень на фон.
const FRONT_SHADOW = {
    idle: "inset 0 1px 0 rgba(255, 255, 255, 0.20), inset 0 -14px 22px rgba(0, 0, 0, 0.35), 0 1px 1px rgba(0, 0, 0, 0.5), 0 14px 34px rgba(0, 0, 0, 0.55)",
    lit: "inset 0 1px 0 rgba(255, 255, 255, 0.30), inset 0 -14px 22px rgba(0, 0, 0, 0.35), 0 1px 1px rgba(0, 0, 0, 0.5), 0 20px 44px rgba(0, 0, 0, 0.6)",
};
// Кромки: [доля высоты, прозрачность белого].
const BACK_RIM = [[0, 0.30], [0.25, 0.08], [1, 0.05]];
const FRONT_RIM = [[0, 0.34], [0.38, 0.07], [0.7, 0.04], [1, 0.12]];
const RIM_OPACITY = { idle: 1, lit: 1.6 };
// Насколько папка приподнимается под мышью, в пикселях сетки.
const LIFT = 3;
const TRANSITION = "0.2s ease-out";

// Табличка (например, «main» в углу): то же стекло, что у передней стенки папки.
export const GLASS_PLATE = {
    ...FRONT,
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.20), inset 0 0 0 1px rgba(255, 255, 255, 0.08), 0 10px 28px rgba(0, 0, 0, 0.5)",
    color: GLASS_TEXT,
    fontFamily: GLASS_FONT,
};

let nextId = 0;

function svg(tag, attrs = {}, children = []) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) {
        node.setAttribute(name, String(value));
    }
    node.append(...children);
    return node;
}

/** Вертикальная белая кромка: stops — [доля высоты, прозрачность]. */
function rimGradient(id, stops) {
    return svg("linearGradient", { id, x1: 0, y1: 0, x2: 0, y2: 1 },
        stops.map(([offset, opacity]) => svg("stop", { offset, "stop-color": "#fff", "stop-opacity": opacity })));
}

/** Контур задника: тело со скруглёнными углами и язычок слева сверху. inset — насколько отступить внутрь (под обводку). */
function backPath(width, height, inset = 0) {
    const k = width / GRID_WIDTH;
    const left = inset;
    const right = width - inset;
    const top = inset;
    const bottom = height - inset;
    const joint = TAB_HEIGHT * k + inset;
    const end = TAB_END * k;
    const r = TAB_RADIUS * k;
    const rt = TOP_RADIUS * k;
    const rb = BOTTOM_RADIUS * k;
    const slope = TAB_SLOPE.map(([dx, f]) => `${end + dx * k} ${top + f * (joint - top)}`);
    return [
        `M${left} ${top + r}`, `A${r} ${r} 0 0 1 ${left + r} ${top}`, `H${end}`,
        `C${slope[0]} ${slope[1]} ${slope[2]}`, `L${slope[3]}`, `C${slope[4]} ${slope[5]} ${slope[6]}`,
        `H${right - rt}`, `A${rt} ${rt} 0 0 1 ${right} ${joint + rt}`,
        `V${bottom - rb}`, `A${rb} ${rb} 0 0 1 ${right - rb} ${bottom}`,
        `H${left + rb}`, `A${rb} ${rb} 0 0 1 ${left} ${bottom - rb}`, "Z",
    ].join(" ");
}

/** Контур передней стенки — под обводку, с отступом внутрь. */
function frontPath(width, height, inset) {
    const k = width / GRID_WIDTH;
    const left = inset;
    const right = width - inset;
    const top = FRONT_TOP * k + inset;
    const bottom = height - inset;
    const rt = TOP_RADIUS * k;
    const rb = BOTTOM_RADIUS * k;
    return [
        `M${left} ${top + rt}`, `A${rt} ${rt} 0 0 1 ${left + rt} ${top}`,
        `H${right - rt}`, `A${rt} ${rt} 0 0 1 ${right} ${top + rt}`,
        `V${bottom - rb}`, `A${rb} ${rb} 0 0 1 ${right - rb} ${bottom}`,
        `H${left + rb}`, `A${rb} ${rb} 0 0 1 ${left} ${bottom - rb}`, "Z",
    ].join(" ");
}

/**
 * Папка из чёрного стекла с названием внизу слева. Размер — у того, кто её вставит (ширина и высота 100%);
 * форма пересчитывается под настоящую ширину. Возвращает node и setLit: подсветить (под мышью, открыта).
 */
export function glassFolder(label) {
    const id = `glass${++nextId}`;

    const back = el("div", { position: "absolute", inset: "0", ...BACK });
    const backRim = svg("path", { fill: "none", stroke: `url(#${id}-back)`, "stroke-width": 1 });
    const backEdge = svg("svg", { width: "100%", height: "100%", "aria-hidden": "true" }, [
        svg("defs", {}, [rimGradient(`${id}-back`, BACK_RIM)]),
        backRim,
    ]);

    const shine = el("div", {
        position: "absolute",
        inset: "0",
        borderRadius: "inherit",
        background: SHINE,
        opacity: String(SHINE_OPACITY.idle),
        transition: `opacity ${TRANSITION}`,
    });
    const name = el("span", {
        position: "absolute",
        whiteSpace: "nowrap",
        font: `600 1em/1 ${GLASS_FONT}`,
        letterSpacing: "-0.01em",
        color: GLASS_TEXT,
        textShadow: "0 1px 2px rgba(0, 0, 0, 0.4)",
    }, {}, [label]);
    const front = el("div", {
        position: "absolute",
        left: "0",
        right: "0",
        bottom: "0",
        ...FRONT,
        boxShadow: FRONT_SHADOW.idle,
        transition: `box-shadow ${TRANSITION}`,
    }, {}, [shine, name]);
    const frontRim = svg("path", { fill: "none", stroke: `url(#${id}-front)`, "stroke-width": 1 });
    const frontEdge = svg("svg", { width: "100%", height: "100%", "aria-hidden": "true" }, [
        svg("defs", {}, [rimGradient(`${id}-front`, FRONT_RIM)]),
        frontRim,
    ]);
    for (const edge of [backEdge, frontEdge]) {
        Object.assign(edge.style, { position: "absolute", inset: "0", overflow: "visible", pointerEvents: "none" });
    }

    // поднимается обёртка, а не сама кнопка: у кнопки transform занят анимацией нажатия
    const node = el("div", {
        position: "absolute",
        inset: "0",
        transition: `transform ${TRANSITION}`,
    }, { "aria-hidden": "true" }, [back, backEdge, front, frontEdge]);

    let scale = 1;
    let lit = false;

    function fit(width, height) {
        if (width === 0 || height === 0) {
            return;
        }
        scale = width / GRID_WIDTH;
        back.style.clipPath = `path("${backPath(width, height)}")`;
        backRim.setAttribute("d", backPath(width, height, 0.5));
        frontRim.setAttribute("d", frontPath(width, height, 0.5));
        Object.assign(front.style, {
            top: `${FRONT_TOP * scale}px`,
            borderRadius: `${TOP_RADIUS * scale}px ${TOP_RADIUS * scale}px ${BOTTOM_RADIUS * scale}px ${BOTTOM_RADIUS * scale}px`,
        });
        Object.assign(name.style, {
            left: `${15 * scale}px`,
            bottom: `${13 * scale}px`,
            fontSize: `${17 * scale}px`,
        });
        node.style.transform = lit ? `translateY(${-LIFT * scale}px)` : "";
    }
    new ResizeObserver(([entry]) => {
        const { inlineSize, blockSize } = entry.contentBoxSize[0];
        fit(inlineSize, blockSize);
    }).observe(node);

    return {
        node,
        setLit(next) {
            lit = next;
            const state = lit ? "lit" : "idle";
            node.style.transform = lit ? `translateY(${-LIFT * scale}px)` : "";
            front.style.boxShadow = FRONT_SHADOW[state];
            shine.style.opacity = String(SHINE_OPACITY[state]);
            // кромка ярче: прозрачность стопов умножаем, но не выше 1
            for (const [edge, stops] of [[backEdge, BACK_RIM], [frontEdge, FRONT_RIM]]) {
                [...edge.querySelectorAll("stop")].forEach((stop, i) => {
                    stop.setAttribute("stop-opacity", String(Math.min(1, stops[i][1] * RIM_OPACITY[state])));
                });
            }
        },
    };
}
