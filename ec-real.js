// @ts-check
// Кривая y² = x³ + ax + b на обычной плоскости — математика для вкладки «на плоскости» в elept1c curv3ss.
// Только чистые функции: какая это кривая, её корни, ломаные для рисунка, сложение точек и ближайшая точка
// кривой — к ней прилипает точка, которую тащат мышью.

/** @typedef {{ x: number, y: number }} RealPoint */
/** @typedef {"one" | "two" | "singular"} Kind */

// a и b на вкладке идут с шагом 0,1, так что ноль у 4a³ + 27b² бывает точным; запас — на погрешность
const EPS = 1e-9;

/**
 * x³ + ax + b — правая часть уравнения.
 * @param {number} a
 * @param {number} b
 * @param {number} x
 */
export function rhs(a, b, x) {
    return x * x * x + a * x + b;
}

/**
 * Тип кривой по знаку 4a³ + 27b²: больше нуля — одна ветка, меньше — овал и ветка, ноль — особая
 * (петля, остриё или одинокая точка в стороне от ветки).
 * @param {number} a
 * @param {number} b
 * @returns {{ value: number, kind: Kind }}
 */
export function kindOf(a, b) {
    const value = 4 * a ** 3 + 27 * b ** 2;
    if (Math.abs(value) < EPS) {
        return { value: 0, kind: "singular" };
    }
    return { value, kind: value > 0 ? "one" : "two" };
}

/**
 * Вещественные корни x³ + ax + b по возрастанию: простые и кратные отдельно. У особой кривой кратный корень —
 * это место петли, острия или одинокой точки.
 * @param {number} a
 * @param {number} b
 * @returns {{ simple: number[], multiple: number[] }}
 */
export function roots(a, b) {
    const { value, kind } = kindOf(a, b);
    if (kind === "singular") {
        if (Math.abs(a) < EPS) {
            // a = b = 0: y² = x³, тройной корень, остриё в нуле
            return { simple: [], multiple: [0] };
        }
        return { simple: [(3 * b) / a], multiple: [(-3 * b) / (2 * a)] };
    }
    if (kind === "one") {
        // формула Кардано: (b/2)² + (a/3)³ = (4a³ + 27b²) / 108 > 0
        const root = Math.sqrt(value / 108);
        return { simple: [Math.cbrt(-b / 2 + root) + Math.cbrt(-b / 2 - root)], multiple: [] };
    }
    // три корня, a < 0: тригонометрическая формула Виета
    const radius = 2 * Math.sqrt(-a / 3);
    const cos = Math.min(1, Math.max(-1, ((3 * b) / (2 * a)) * Math.sqrt(-3 / a)));
    const angle = Math.acos(cos) / 3;
    const simple = [0, 1, 2].map((k) => radius * Math.cos(angle - (2 * Math.PI * k) / 3));
    return { simple: simple.sort((u, v) => u - v), multiple: [] };
}

/**
 * Точки кривой с абсциссами xs: сначала нижняя половина справа налево, потом верхняя слева направо —
 * одна линия через точку на оси.
 * @param {number} a
 * @param {number} b
 * @param {number[]} xs по возрастанию
 */
function arc(a, b, xs) {
    const upper = xs.map((x) => ({ x, y: Math.sqrt(Math.max(0, rhs(a, b, x))) }));
    const lower = [...upper].reverse().map(({ x, y }) => ({ x, y: -y }));
    return [...lower, ...upper];
}

/**
 * Кривая для рисунка: ломаные, все вершины которых лежат на самой кривой, и одинокие точки. Около корней
 * вершины гуще: там кривая встаёт вертикально.
 * @param {number} a
 * @param {number} b
 * @param {number} xMax до какого x тянуть ветку, уходящую вправо
 * @param {number} [count] сколько вершин на половину куска
 * @returns {{ lines: RealPoint[][], dots: RealPoint[] }}
 */
export function curveLines(a, b, xMax, count = 400) {
    const { simple, multiple } = roots(a, b);
    /** @type {RealPoint[][]} */
    const lines = [];
    /** @type {RealPoint[]} */
    const dots = [];

    /**
     * Ветка от корня start вправо до xMax; через кратные корни внутри она проходит (это петля).
     * @param {number} start
     * @param {number[]} through
     */
    const branch = (start, through) => {
        if (start >= xMax) {
            return;
        }
        const xs = [];
        for (let i = 0; i <= count; i++) {
            xs.push(start + (xMax - start) * (i / count) ** 2);
        }
        xs.push(...through.filter((x) => x > start && x < xMax));
        lines.push(
            arc(
                a,
                b,
                xs.sort((u, v) => u - v),
            ),
        );
    };

    if (simple.length === 3) {
        // овал между первыми двумя корнями: вершины гуще у обоих концов
        const [left, right] = simple;
        const xs = [];
        for (let i = 0; i <= count; i++) {
            xs.push(left + ((right - left) * (1 - Math.cos((Math.PI * i) / count))) / 2);
        }
        // нижняя половина начинается на оси справа, верхняя там же кончается: овал замкнут сам
        lines.push(arc(a, b, xs));
        branch(simple[2], []);
    } else if (simple.length === 1) {
        const [start] = simple;
        branch(
            start,
            multiple.filter((x) => x > start),
        );
        // кратный корень левее ветки — одинокая точка: кривая проходит только через неё саму
        for (const x of multiple.filter((x) => x < start)) {
            dots.push({ x, y: 0 });
        }
    } else {
        branch(multiple[0], []);
    }
    return { lines, dots };
}

/**
 * P + Q на плоскости: наклон прямой, третья точка, где прямая снова задевает кривую, и сумма — её отражение
 * через ось x. Для P = Q прямую заменяет касательная. null — прямая вертикальная: третьей точки нет, P + Q = O.
 * @param {number} a
 * @param {RealPoint} P
 * @param {RealPoint} Q
 * @returns {{ lambda: number, third: RealPoint, sum: RealPoint } | null}
 */
export function addReal(a, P, Q) {
    const sameX = Math.abs(P.x - Q.x) < EPS;
    // Q = −P или касательная в точке на оси
    if (sameX && Math.abs(P.y + Q.y) < EPS) {
        return null;
    }
    const lambda = sameX ? (3 * P.x * P.x + a) / (2 * P.y) : (Q.y - P.y) / (Q.x - P.x);
    const x = lambda * lambda - P.x - Q.x;
    const y = lambda * (P.x - x) - P.y;
    return { lambda, third: { x, y: -y }, sum: { x, y } };
}

/**
 * Ближайшая к (x; y) вершина ломаных кривой — она лежит на кривой точно. lines пустой — null.
 * @param {RealPoint[][]} lines
 * @param {RealPoint} target
 * @returns {{ line: number, index: number, point: RealPoint } | null}
 */
export function nearestPoint(lines, target) {
    /** @type {{ line: number, index: number, point: RealPoint } | null} */
    let best = null;
    let bestDistance = Infinity;
    for (let line = 0; line < lines.length; line++) {
        for (let index = 0; index < lines[line].length; index++) {
            const point = lines[line][index];
            const distance = (point.x - target.x) ** 2 + (point.y - target.y) ** 2;
            if (distance < bestDistance) {
                bestDistance = distance;
                best = { line, index, point };
            }
        }
    }
    return best;
}

/**
 * Шаг вдоль кривой от точки: steps вершин вперёд или назад по той же ломаной, без выхода за её концы.
 * Так точку двигают стрелками с клавиатуры.
 * @param {RealPoint[][]} lines
 * @param {RealPoint} from
 * @param {number} steps
 * @returns {RealPoint | null}
 */
export function stepAlong(lines, from, steps) {
    const start = nearestPoint(lines, from);
    if (!start) {
        return null;
    }
    const line = lines[start.line];
    return line[Math.min(line.length - 1, Math.max(0, start.index + steps))];
}
