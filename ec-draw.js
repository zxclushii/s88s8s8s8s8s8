// @ts-check
// Общее для рисунков elept1c curv3ss: SVG-элементы, звезда, нимб — так нарисована точка O, — сетка p × p,
// числа и уравнение в тетрадном виде и покадровая анимация построения.

/** @typedef {import("./curve.js").Curve} Curve */

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * @param {string} tag
 * @param {Record<string, string | number>} attributes
 * @param {Element} [parent]
 * @returns {SVGElement}
 */
export function svg(tag, attributes, parent) {
    const node = /** @type {SVGElement} */ (document.createElementNS(SVG_NS, tag));
    for (const [name, value] of Object.entries(attributes)) {
        node.setAttribute(name, String(value));
    }
    parent?.append(node);
    return node;
}

/**
 * Текст в SVG.
 * @param {Element} parent
 * @param {number} x
 * @param {number} y
 * @param {string} text
 * @param {string} className
 * @param {"start" | "middle" | "end"} [anchor]
 */
export function svgText(parent, x, y, text, className, anchor = "start") {
    const node = svg("text", { class: className, x, y, "text-anchor": anchor }, parent);
    node.textContent = text;
    return node;
}

/**
 * Звезда из спрайта в index.html, центр в (x; y): так отмечена сумма.
 * @param {Element} parent
 * @param {number} x
 * @param {number} y
 * @param {number} size
 */
export function star(parent, x, y, size) {
    return svg(
        "use",
        { href: "#star", class: "ec-star", x: x - size / 2, y: y - size / 2, width: size, height: size },
        parent,
    );
}

/**
 * Нимб — точка O «на бесконечности»: в неё уходят вертикальные прямые, у которых нет третьей точки.
 * @param {Element} parent
 * @param {number} x
 * @param {number} y центр нимба
 */
export function halo(parent, x, y) {
    const group = svg("g", { class: "ec-halo", transform: `translate(${x} ${y})` }, parent);
    svg("ellipse", { class: "ec-halo-glow", rx: 24, ry: 7, transform: "rotate(-7)" }, group);
    svg("ellipse", { rx: 24, ry: 7, transform: "rotate(-7)" }, group);
    svgText(group, 34, 8, "O", "ec-halo-name");
    return group;
}

/** Человек попросил систему поменьше двигать на экране. */
export function stillMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Покадровая анимация: frame получает, сколько миллисекунд прошло; последний кадр — ровно duration.
 * Без анимации (animate = false или человек просил меньше движения) приходит сразу последний кадр.
 * @param {number} duration
 * @param {(elapsed: number) => void} frame
 * @param {boolean} [animate]
 * @returns {() => void} остановить: кадров больше не будет
 */
export function play(duration, frame, animate = true) {
    if (!animate || duration <= 0 || stillMotion()) {
        frame(duration);
        return () => {};
    }
    let id = 0;
    let start = -1;
    /** @param {number} now */
    const tick = (now) => {
        if (start < 0) {
            start = now;
        }
        const elapsed = Math.min(duration, now - start);
        frame(elapsed);
        if (elapsed < duration) {
            id = requestAnimationFrame(tick);
        }
    };
    frame(0);
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
}

/**
 * Насколько прошёл этап анимации: 0 до start, 1 после start + length, между ними — плавно.
 * @param {number} elapsed
 * @param {number} start
 * @param {number} length
 */
export function stage(elapsed, start, length) {
    if (length <= 0) {
        return elapsed >= start ? 1 : 0;
    }
    const t = Math.min(1, Math.max(0, (elapsed - start) / length));
    return t * t * (3 - 2 * t);
}

/**
 * Число как в тетради: запятая и настоящий минус. digits — сколько знаков после запятой, лишние нули
 * в конце убираются: 2 → «2», −1,3 → «−1,3», 0,197 при digits 2 → «0,2».
 * @param {number} value
 * @param {number} [digits]
 */
export function formatNumber(value, digits = 2) {
    const rounded = Number(value.toFixed(digits));
    // −0 после округления — это 0
    const text = String(rounded === 0 ? 0 : rounded);
    return text.replace("-", "−").replace(".", ",");
}

/**
 * Число с фиксированным числом знаков: −1,30. Для координат и наклона на плоскости.
 * @param {number} value
 */
export function formatFixed(value) {
    const text = Math.abs(value) < 0.005 ? "0,00" : value.toFixed(2);
    return text.replace("-", "−").replace(".", ",");
}

/**
 * Точка в тетрадном виде: (8; 10). null — O.
 * @param {{ x: number, y: number } | null} point
 * @param {(value: number) => string} [format]
 */
export function formatPoint(point, format = String) {
    return point === null ? "O" : `(${format(point.x)}; ${format(point.y)})`;
}

/**
 * Уравнение кривой, как его пишут: y² = x³ − x + 2. Нулевые члены пропускаются, единица при x не пишется.
 * @param {number} a
 * @param {number} b
 * @param {(value: number) => string} [format]
 */
export function equation(a, b, format = String) {
    let text = "y² = x³";
    if (a !== 0) {
        text += ` ${a < 0 ? "−" : "+"} ${Math.abs(a) === 1 ? "" : format(Math.abs(a))}x`;
    }
    if (b !== 0) {
        text += ` ${b < 0 ? "−" : "+"} ${format(Math.abs(b))}`;
    }
    return text;
}

/**
 * Окончание слова после числа: 1 точка, 3 точки, 29 точек.
 * @param {number} n
 * @param {[string, string, string]} forms
 */
export function plural(n, [one, few, many]) {
    const tens = n % 100;
    const units = n % 10;
    if (tens >= 11 && tens <= 14) {
        return many;
    }
    if (units === 1) {
        return one;
    }
    return units >= 2 && units <= 4 ? few : many;
}

/**
 * Сетка p × p в SVG: каждая точка — в середине своей клетки, поэтому змейка перескакивает через край ровно
 * на границе поля. Сверху — полоса под нимб, слева и снизу — место под цифры.
 * @typedef {object} Field
 * @property {(x: number) => number} X
 * @property {(y: number) => number} Y
 * @property {number} cell сторона клетки
 * @property {{ left: number, top: number, size: number }} area само поле
 */

/**
 * @param {number} p
 * @param {{ left: number, top: number, size: number }} area
 * @returns {Field}
 */
export function fieldScale(p, area) {
    const cell = area.size / p;
    return {
        X: (x) => area.left + (x + 0.5) * cell,
        Y: (y) => area.top + area.size - (y + 0.5) * cell,
        cell,
        area,
    };
}

/**
 * Неподвижная часть рисунка по модулю p: цифры осей, зеркало y = p/2 и все точки кривой.
 * Зеркало есть только у эллиптических кривых: у них −P = (x; p − y).
 * @param {Element} parent
 * @param {number} p
 * @param {Field} field
 * @param {{ x: number, y: number }[]} points
 * @param {boolean} [mirrored]
 */
export function drawFieldBase(parent, p, field, points, mirrored = true) {
    const { X, Y, cell, area } = field;
    const step = Math.max(1, Math.ceil((p - 1) / 4));
    for (let tick = 0; tick < p; tick += step) {
        svgText(parent, X(tick), area.top + area.size + 22, String(tick), "ec-tick", "middle");
        svgText(parent, area.left - 10, Y(tick) + 4, String(tick), "ec-tick", "end");
    }
    if (mirrored) {
        // −P = (x; p − y): точка и минус точка смотрят друг на друга через y = p/2
        const mirror = Y(p / 2);
        svg("line", { class: "ec-mirror", x1: area.left, y1: mirror, x2: area.left + area.size, y2: mirror }, parent);
        svgText(parent, area.left + area.size, mirror - 9, "y = p/2", "ec-mirror-name", "end");
    }
    for (const point of points) {
        svg("circle", { class: "ec-dot", cx: X(point.x), cy: Y(point.y), r: dotRadius(cell) }, parent);
    }
}

/**
 * Радиус точки на сетке: при большом p клетки мелкие, и точки мельче, чтобы не слипались.
 * @param {number} cell сторона клетки
 */
export function dotRadius(cell) {
    return Math.min(3.6, Math.max(1.6, cell * 0.22));
}

/**
 * Подпись у точки: справа сверху, а у правого и верхнего края — с другой стороны, чтобы не обрезалась.
 * place просит сторону сам: слева или справа, под точкой или над ней — чтобы подпись не легла на прямую.
 * @param {Element} parent
 * @param {number} x
 * @param {number} y
 * @param {string} text
 * @param {string} className
 * @param {{ right: number, top: number }} edges
 * @param {{ left?: boolean, below?: boolean }} [place]
 */
export function pointName(parent, x, y, text, className, edges, place = {}) {
    const left = place.left ?? x > edges.right - 110;
    const below = place.below ?? y < edges.top + 30;
    return svgText(parent, left ? x - 14 : x + 14, below ? y + 28 : y - 12, text, className, left ? "end" : "start");
}

/**
 * Строки «что — чему равно» в <dl>: старые уходят, новые встают.
 * @param {HTMLElement} list
 * @param {[string, string][]} rows
 */
export function fillRows(list, rows) {
    list.replaceChildren(
        ...rows.map(([term, value]) => {
            const row = document.createElement("div");
            const dt = document.createElement("dt");
            const dd = document.createElement("dd");
            dt.textContent = term;
            dd.textContent = value;
            row.append(dt, dd);
            return row;
        }),
    );
}
