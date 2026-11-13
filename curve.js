// @ts-check
// Эллиптическая кривая y² = x³ + ax + b по модулю простого p — математика для демки лабы 9 во вкладке work
// и для программы elept1c curv3ss (лаба 10). Только чистые функции: точки кривой, сложение, удвоение,
// умножение точки на число, подгруппы, параметры кривой для шифра и прямая по модулю для рисунка.

/**
 * Точка кривой; null — точка на бесконечности O (ноль группы: P + O = P).
 * @typedef {{ x: number, y: number } | null} Point
 */

/** @typedef {{ p: number, a: number, b: number }} Curve */

/** Кривая из лабы 9, вариант 7: y² = x³ − x + 2 (mod 29). */
export const LAB = Object.freeze({ p: 29, a: -1, b: 2 });
/** Базовая точка варианта 7. */
export const G = Object.freeze({ x: 10, y: 8 });

/**
 * Остаток, который не бывает отрицательным: в JS −3 % 29 даёт −3, а нужно 26.
 * @param {number} n
 * @param {number} p
 */
export function mod(n, p) {
    return ((n % p) + p) % p;
}

/**
 * Обратное число по модулю p — расширенным алгоритмом Евклида, как в лабе.
 * @param {number} n
 * @param {number} p простое
 */
export function inverse(n, p) {
    let [r, nextR] = [p, mod(n, p)];
    let [t, nextT] = [0, 1];
    while (nextR !== 0) {
        const q = Math.floor(r / nextR);
        [r, nextR] = [nextR, r - q * nextR];
        [t, nextT] = [nextT, t - q * nextT];
    }
    if (r !== 1) {
        throw new RangeError(`у ${n} нет обратного по модулю ${p}`);
    }
    return mod(t, p);
}

/**
 * @param {Curve} curve
 * @param {Point} point
 */
export function onCurve({ p, a, b }, point) {
    if (point === null) {
        return true;
    }
    const { x, y } = point;
    return mod(y * y - (x * x * x + a * x + b), p) === 0;
}

/**
 * Все точки кривой, кроме O, — по возрастанию x, потом y.
 * @param {Curve} curve
 * @returns {{ x: number, y: number }[]}
 */
export function curvePoints(curve) {
    const found = [];
    for (let x = 0; x < curve.p; x++) {
        for (let y = 0; y < curve.p; y++) {
            if (onCurve(curve, { x, y })) {
                found.push({ x, y });
            }
        }
    }
    return found;
}

/**
 * Наклон прямой через P и Q — как дробь, которую пишут в тетради, и как число по модулю p.
 * Одно и то же x значит P = Q: тогда берётся касательная, (3x² + a) / 2y. Вертикаль (Q = −P или y = 0
 * у касательной) сюда не приходит: у неё наклона нет, это проверяет вызывающий.
 * @param {Curve} curve
 * @param {{ x: number, y: number }} P
 * @param {{ x: number, y: number }} Q
 * @returns {{ num: number, den: number, value: number }}
 */
export function slope({ p, a }, P, Q) {
    const tangent = P.x === Q.x;
    const num = tangent ? 3 * P.x * P.x + a : Q.y - P.y;
    const den = tangent ? 2 * P.y : Q.x - P.x;
    return { num, den, value: mod(num * inverse(den, p), p) };
}

/**
 * P + Q. Одинаковые точки — удвоение (касательная), P и −P дают O.
 * @param {Curve} curve
 * @param {Point} P
 * @param {Point} Q
 * @returns {Point}
 */
export function add(curve, P, Q) {
    if (P === null) {
        return Q;
    }
    if (Q === null) {
        return P;
    }
    const { p } = curve;
    // одна вертикаль: либо Q = −P, либо удвоение точки с y = 0 — прямая уходит в бесконечность
    if (P.x === Q.x && mod(P.y + Q.y, p) === 0) {
        return null;
    }
    const lambda = slope(curve, P, Q).value;
    const x = mod(lambda * lambda - P.x - Q.x, p);
    return { x, y: mod(lambda * (P.x - x) - P.y, p) };
}

/**
 * −P: то же x, а y отражён через p/2, потому что −y по модулю p — это p − y.
 * @param {Curve} curve
 * @param {Point} P
 * @returns {Point}
 */
export function negate({ p }, P) {
    return P === null ? null : { x: P.x, y: mod(-P.y, p) };
}

/**
 * kP тем же способом, что в лабе: удвоения P → 2P → 4P…, потом нужные степени двойки
 * складываются от старшей к младшей (7P = 4P + 2P + P). Путь — точки в том порядке,
 * в каком они появлялись: для 7 это P, 2P, 4P, 6P, 7P. Его рисует демка.
 * @param {Curve} curve
 * @param {number} k целое, от 1
 * @param {Point} P
 * @returns {{ result: Point, path: { k: number, point: Point }[] }}
 */
export function multiply(curve, k, P) {
    if (!Number.isInteger(k) || k < 1) {
        throw new RangeError(`умножать можно на целое от 1, а пришло ${k}`);
    }
    /** @type {Point[]} */
    const powers = [P];
    /** @type {{ k: number, point: Point }[]} */
    const path = [{ k: 1, point: P }];
    while (2 ** powers.length <= k) {
        const point = add(curve, powers[powers.length - 1], powers[powers.length - 1]);
        powers.push(point);
        path.push({ k: 2 ** (powers.length - 1), point });
    }
    const top = powers.length - 1;
    let sum = 2 ** top;
    let result = powers[top];
    for (let bit = top - 1; bit >= 0; bit--) {
        if (k & (2 ** bit)) {
            sum += 2 ** bit;
            result = add(curve, result, powers[bit]);
            path.push({ k: sum, point: result });
        }
    }
    return { result, path };
}

/**
 * Подгруппа, которую рождает P: P, 2P, 3P, … и O в конце. Её длина — порядок P.
 * Для простого p точек меньше 2p + 2, так что цикл обязательно кончается; если нет — p не простое.
 * @param {Curve} curve
 * @param {{ x: number, y: number }} P
 * @returns {Point[]}
 */
export function subgroup(curve, P) {
    /** @type {Point[]} */
    const multiples = [P];
    /** @type {Point} */
    let current = P;
    while (current !== null) {
        if (multiples.length > 2 * curve.p + 3) {
            throw new RangeError(`подгруппа точки (${P.x}; ${P.y}) не замкнулась: p = ${curve.p} не простое?`);
        }
        current = add(curve, current, P);
        multiples.push(current);
    }
    return multiples;
}

/**
 * Простое ли n — перебором делителей: числа здесь не больше сотни-другой.
 * @param {number} n
 */
export function isPrime(n) {
    if (!Number.isInteger(n) || n < 2) {
        return false;
    }
    for (let d = 2; d * d <= n; d++) {
        if (n % d === 0) {
            return false;
        }
    }
    return true;
}

/**
 * Самый большой простой делитель: 30 → 5, 32 → 2, 31 → 31.
 * @param {number} n целое от 2
 */
export function largestPrimeFactor(n) {
    if (!Number.isInteger(n) || n < 2) {
        throw new RangeError(`простой делитель есть только у целого от 2, а пришло ${n}`);
    }
    let rest = n;
    let largest = 1;
    for (let d = 2; d * d <= rest; d++) {
        while (rest % d === 0) {
            largest = d;
            rest /= d;
        }
    }
    return rest > 1 ? rest : largest;
}

/**
 * 4a³ + 27b² — как есть и по модулю p. Ноль по модулю — кривая особая: с петлёй или остриём.
 * @param {Curve} curve
 */
export function discriminant({ p, a, b }) {
    const value = 4 * a ** 3 + 27 * b ** 2;
    return { value, residue: mod(value, p) };
}

/**
 * Теорема Хассе: точек у кривой вместе с O — между p + 1 − 2√p и p + 1 + 2√p.
 * @param {number} p
 */
export function hasse(p) {
    const spread = 2 * Math.sqrt(p);
    return { low: p + 1 - spread, high: p + 1 + spread };
}

/**
 * Точка порядка q, где q — простой делитель числа точек. Точки берутся по очереди, начиная с first, и у
 * каждой считается порядок k; как только q делит k, n = k / q и P = nG: qP = kG = O, а раньше O не бывает,
 * потому что q простое. Просто умножить на m / q нельзя: на кривой y² = x³ − x по модулю 5 восемь точек,
 * но у всех 4G = O, и точку порядка 2 так не найти.
 * @param {Curve} curve
 * @param {number} q простое
 * @param {{ x: number, y: number } | null} [first] с какой точки начать, если она на кривой
 * @returns {{ base: { x: number, y: number }, n: number, point: { x: number, y: number } } | null}
 */
export function pointOfOrder(curve, q, first = null) {
    const points = curvePoints(curve);
    const start = first ? points.findIndex((point) => point.x === first.x && point.y === first.y) : -1;
    if (start > 0) {
        points.unshift(...points.splice(start, 1));
    }
    for (const base of points) {
        const k = subgroup(curve, base).length;
        if (k % q === 0) {
            const n = k / q;
            const point = n === 1 ? base : multiply(curve, n, base).result;
            if (point !== null) {
                return { base, n, point };
            }
        }
    }
    return null;
}

/**
 * Направление прямой с наклоном dy/dx по модулю p, которое меньше всего петляет по полю p × p: из всех
 * c · (dx; dy) по модулю p берётся самое короткое, с координатами от −p/2 до p/2. Все они дают одну и ту же
 * прямую по модулю — разница только в том, сколько раз она перескакивает через край рисунка.
 * @param {number} p
 * @param {number} dx
 * @param {number} dy (dx; dy) не (0; 0) по модулю p
 * @returns {{ dx: number, dy: number }}
 */
export function wrapDirection(p, dx, dy) {
    /** @param {number} v */
    const centered = (v) => {
        const r = mod(v, p);
        return r > p / 2 ? r - p : r;
    };
    if (centered(dx) === 0 && centered(dy) === 0) {
        throw new RangeError(`у прямой нет направления: (${dx}; ${dy}) ≡ (0; 0) по модулю ${p}`);
    }
    let best = { dx: centered(dx), dy: centered(dy) };
    for (let c = 2; c < p; c++) {
        const candidate = { dx: centered(c * dx), dy: centered(c * dy) };
        if (Math.abs(candidate.dx) + Math.abs(candidate.dy) < Math.abs(best.dx) + Math.abs(best.dy)) {
            best = candidate;
        }
    }
    return best;
}

/**
 * Прямая P + t · d при t от 0 до p, намотанная на поле от −½ до p − ½ по обеим осям, как змейка: ушла за
 * край — вышла с другого. При целом t она стоит в точке прямой по модулю, а при t = p возвращается в P.
 * Куски идут по порядку t, так их и рисуют.
 * @param {number} p
 * @param {{ x: number, y: number }} P
 * @param {{ dx: number, dy: number }} d из wrapDirection
 * @returns {{ from: { x: number, y: number }, to: { x: number, y: number }, t0: number, t1: number }[]}
 */
export function wrapSegments(p, P, d) {
    const low = -0.5;
    const high = p - 0.5;
    const segments = [];
    let { x, y } = P;
    let t = 0;
    while (t < p) {
        // перескоков через край не больше |dx| + |dy| ≤ p; больше — ошибка в направлении
        if (segments.length > 2 * p + 2) {
            throw new RangeError(`прямая по модулю ${p} не замкнулась: направление (${d.dx}; ${d.dy})`);
        }
        const toX = d.dx > 0 ? (high - x) / d.dx : d.dx < 0 ? (low - x) / d.dx : Infinity;
        const toY = d.dy > 0 ? (high - y) / d.dy : d.dy < 0 ? (low - y) / d.dy : Infinity;
        const step = Math.min(toX, toY, p - t);
        const to = { x: x + d.dx * step, y: y + d.dy * step };
        segments.push({ from: { x, y }, to, t0: t, t1: t + step });
        t += step;
        x = step === toX ? (d.dx > 0 ? low : high) : to.x;
        y = step === toY ? (d.dy > 0 ? low : high) : to.y;
    }
    return segments;
}

/**
 * Через сколько шагов t змейка из P по направлению d придёт в точку R прямой: P + t · d ≡ R по модулю p.
 * @param {number} p
 * @param {{ x: number, y: number }} P
 * @param {{ dx: number, dy: number }} d
 * @param {{ x: number, y: number }} R
 * @returns {number} целое от 0 до p − 1
 */
export function lineStep(p, P, d, R) {
    const t = mod(d.dx !== 0 ? (R.x - P.x) * inverse(d.dx, p) : (R.y - P.y) * inverse(d.dy, p), p);
    if (mod(P.x + t * d.dx - R.x, p) !== 0 || mod(P.y + t * d.dy - R.y, p) !== 0) {
        throw new RangeError(`точка (${R.x}; ${R.y}) не лежит на прямой через (${P.x}; ${P.y})`);
    }
    return t;
}
