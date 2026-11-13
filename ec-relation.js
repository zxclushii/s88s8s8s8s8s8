// @ts-check
// Любое уравнение или неравенство с x и y по модулю p — математика для вкладки «любая кривая» (как ffplot).
// Свой разбор формулы, без eval: что бы ни набрали в поле, это только числа, x, y, скобки и знаки.
// Считается как в ffplot: обе части берутся по модулю p и потом сравниваются; деление — умножение на
// обратное; показатель степени — обычное целое, без модуля.

/**
 * @typedef {{ kind: "number", value: number }
 *     | { kind: "variable", name: "x" | "y" }
 *     | { kind: "negate", arg: Expression }
 *     | { kind: "binary", op: "+" | "-" | "*" | "/" | "^", left: Expression, right: Expression }} Expression
 */
/** @typedef {"=" | "<" | ">" | "<=" | ">=" | "!="} Comparison */
/** @typedef {{ op: Comparison, left: Expression, right: Expression }} Relation */
/** @typedef {{ type: "number", value: number } | { type: "name", value: "x" | "y" } | { type: "symbol", value: string }} Token */

// числа в формуле — без огромных
const NUMBER_LIMIT = 1e9;
// В тетради формулы короче; а очень длинную или глубоко вложенную разбор и подсчёт прошли бы рекурсией
// глубже, чем держит стек браузера, — и вместо понятной ошибки вкладка молча застывала бы.
const LENGTH_LIMIT = 300;
// Показатель степени считается точным целым, а JS хранит целые без потерь только до 2⁵³ − 1. Больше — это
// «посчитать нельзя», а не «точки нет»: такие клетки не теряются молча, их пересчитывает scanRelation.
const TOO_BIG = Symbol("показатель степени больше 2⁵³ − 1");

const SUPERSCRIPTS = new Map([..."⁰¹²³⁴⁵⁶⁷⁸⁹"].map((digit, value) => [digit, String(value)]));
// как набирают на клавиатуре и как пишут в тетради — к одному виду
const SPELLINGS = new Map([
    ["−", "-"],
    ["–", "-"],
    ["·", "*"],
    ["×", "*"],
    ["∙", "*"],
    ["÷", "/"],
    ["≤", "<="],
    ["≥", ">="],
    ["≠", "!="],
    ["==", "="],
]);
const COMPARISONS = ["<=", ">=", "!=", "=", "<", ">"];
const SYMBOLS = [...COMPARISONS, "+", "-", "*", "/", "^", "(", ")"];

/**
 * Формула — в токены: числа, x и y, знаки. Надстрочные цифры — это степень: y² = y^2.
 * @param {string} text
 * @returns {Token[]}
 */
function tokenize(text) {
    let source = text;
    for (const [from, to] of SPELLINGS) {
        source = source.replaceAll(from, to);
    }
    source = source.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (digits) => `^${[...digits].map((d) => SUPERSCRIPTS.get(d)).join("")}`);
    /** @type {Token[]} */
    const tokens = [];
    let i = 0;
    while (i < source.length) {
        const char = source[i];
        if (/\s/.test(char)) {
            i += 1;
        } else if (/\d/.test(char)) {
            const digits = /^\d+/.exec(source.slice(i))?.[0] ?? "";
            const value = Number(digits);
            if (value > NUMBER_LIMIT) {
                throw new SyntaxError(`число ${digits} слишком большое`);
            }
            tokens.push({ type: "number", value });
            i += digits.length;
        } else if (char === "x" || char === "y" || char === "X" || char === "Y") {
            tokens.push({ type: "name", value: char === "x" || char === "X" ? "x" : "y" });
            i += 1;
        } else {
            const symbol = ["<=", ">=", "!="].find((pair) => source.startsWith(pair, i)) ?? char;
            if (!SYMBOLS.includes(symbol)) {
                throw new SyntaxError(`не понял «${char}»: можно числа, x, y, скобки и + − · / ^ = < >`);
            }
            tokens.push({ type: "symbol", value: symbol });
            i += symbol.length;
        }
    }
    return tokens;
}

/**
 * Разбор по старшинству: сравнение, потом + и −, потом · и /, потом унарный минус, потом степень.
 * Знак умножения перед x, y и скобкой можно не писать: 3x², 2(x + 1).
 * @param {string} text
 * @returns {Relation}
 */
export function parseRelation(text) {
    if (text.length > LENGTH_LIMIT) {
        throw new SyntaxError(`формула длиннее ${LENGTH_LIMIT} знаков`);
    }
    const tokens = tokenize(text);
    let at = 0;
    const peek = () => tokens[at];
    /** @param {string} value */
    const isSymbol = (value) => {
        const token = peek();
        return token?.type === "symbol" && token.value === value;
    };

    /** @returns {Expression} */
    function atom() {
        const token = peek();
        if (!token) {
            throw new SyntaxError("формула оборвалась: не хватает числа, x или y");
        }
        at += 1;
        if (token.type === "number") {
            return { kind: "number", value: token.value };
        }
        if (token.type === "name") {
            return { kind: "variable", name: token.value };
        }
        if (token.value === "(") {
            const inside = sum();
            if (!isSymbol(")")) {
                throw new SyntaxError("не хватает закрывающей скобки");
            }
            at += 1;
            return inside;
        }
        throw new SyntaxError(`«${token.value}» стоит там, где ждали число, x или y`);
    }

    /** @returns {Expression} */
    function power() {
        const base = atom();
        if (isSymbol("^")) {
            at += 1;
            // a^b^c = a^(b^c), а −x² = −(x²): показатель разбирается вместе с минусом
            return { kind: "binary", op: "^", left: base, right: unary() };
        }
        return base;
    }

    /** @returns {Expression} */
    function unary() {
        if (isSymbol("-")) {
            at += 1;
            return { kind: "negate", arg: unary() };
        }
        if (isSymbol("+")) {
            at += 1;
            return unary();
        }
        return power();
    }

    /** @returns {Expression} */
    function product() {
        let left = unary();
        for (;;) {
            const token = peek();
            if (token?.type === "symbol" && (token.value === "*" || token.value === "/")) {
                at += 1;
                left = { kind: "binary", op: token.value, left, right: unary() };
            } else if (token?.type === "name" || (token?.type === "symbol" && token.value === "(")) {
                // 3x, 2(x + 1), xy — умножение без знака
                left = { kind: "binary", op: "*", left, right: unary() };
            } else {
                return left;
            }
        }
    }

    /** @returns {Expression} */
    function sum() {
        let left = product();
        for (;;) {
            const token = peek();
            if (token?.type === "symbol" && (token.value === "+" || token.value === "-")) {
                at += 1;
                left = { kind: "binary", op: token.value, left, right: product() };
            } else {
                return left;
            }
        }
    }

    const left = sum();
    const sign = peek();
    if (!sign || sign.type !== "symbol" || !COMPARISONS.includes(sign.value)) {
        throw new SyntaxError(sign ? `не понял «${sign.value}» здесь` : "нужен знак сравнения: =, <, >, ≤, ≥ или ≠");
    }
    at += 1;
    const right = sum();
    if (at < tokens.length) {
        const extra = tokens[at];
        throw new SyntaxError(`лишнее в конце: «${extra.value}»`);
    }
    return { op: /** @type {Comparison} */ (sign.value), left, right };
}

/**
 * @param {number} n
 * @param {number} p
 */
function mod(n, p) {
    return ((n % p) + p) % p;
}

/**
 * Обратное по модулю p, если оно есть: у 4 по модулю 6 его нет — тогда null.
 * @param {number} n
 * @param {number} p
 */
function inverseOrNull(n, p) {
    let [r, nextR] = [p, mod(n, p)];
    let [t, nextT] = [0, 1];
    while (nextR !== 0) {
        const q = Math.floor(r / nextR);
        [r, nextR] = [nextR, r - q * nextR];
        [t, nextT] = [nextT, t - q * nextT];
    }
    return r === 1 ? mod(t, p) : null;
}

/**
 * Целое, пока JS хранит его без потерь, иначе TOO_BIG. Сумма или произведение точных целых, которые
 * на деле больше 2⁵³ − 1, и после округления остаются больше, так что проверка после действия честная.
 * @param {number} value
 * @returns {number | typeof TOO_BIG}
 */
function exact(value) {
    return Number.isSafeInteger(value) ? value : TOO_BIG;
}

/**
 * Целая степень целого. Не через **: он считает с плавающей точкой и на больших числах может ошибиться
 * в последнем знаке. Умножаем по одному — при |base| ≥ 2 за 2⁵³ выходим меньше чем за 54 шага.
 * @param {number} base
 * @param {number} exponent
 * @returns {number | null | typeof TOO_BIG}
 */
function power(base, exponent) {
    // 1 и −1 в любой степени — снова ±1, 0 — снова 0: без перебора, даже при показателе около 2⁵³
    if (base === 1 || (base === 0 && exponent > 0)) {
        return base;
    }
    if (base === -1) {
        return exponent % 2 === 0 ? 1 : -1;
    }
    // 0⁻¹ не бывает, у остальных отрицательная степень — дробь
    if (exponent < 0) {
        return null;
    }
    let result = 1;
    for (let i = 0; i < exponent; i++) {
        result *= base;
        if (!Number.isSafeInteger(result)) {
            return TOO_BIG;
        }
    }
    return result;
}

/**
 * Показатель степени — обычное целое, без модуля, как в ffplot. null — дробный; TOO_BIG — больше 2⁵³ − 1.
 * @param {Expression} node
 * @param {number} x
 * @param {number} y
 * @returns {number | null | typeof TOO_BIG}
 */
function integer(node, x, y) {
    switch (node.kind) {
        case "number":
            return node.value;
        case "variable":
            return node.name === "x" ? x : y;
        case "negate": {
            const value = integer(node.arg, x, y);
            return typeof value === "number" ? -value : value;
        }
        case "binary": {
            const left = integer(node.left, x, y);
            const right = integer(node.right, x, y);
            if (left === null || right === null) {
                return null;
            }
            if (left === TOO_BIG || right === TOO_BIG) {
                return TOO_BIG;
            }
            switch (node.op) {
                case "+":
                    return exact(left + right);
                case "-":
                    return exact(left - right);
                case "*":
                    return exact(left * right);
                case "/":
                    return right !== 0 && left % right === 0 ? left / right : null;
                case "^":
                    return power(left, right);
            }
        }
    }
}

/**
 * Значение части формулы по модулю p в точке (x; y). null — значения нет: деление на необратимое, дробный
 * показатель; TOO_BIG — посчитать нельзя: показатель больше 2⁵³ − 1.
 * @param {Expression} node
 * @param {number} x
 * @param {number} y
 * @param {number} p
 * @returns {number | null | typeof TOO_BIG}
 */
function calculate(node, x, y, p) {
    switch (node.kind) {
        case "number":
            return mod(node.value, p);
        case "variable":
            return mod(node.name === "x" ? x : y, p);
        case "negate": {
            const value = calculate(node.arg, x, y, p);
            return typeof value === "number" ? mod(-value, p) : value;
        }
        case "binary": {
            if (node.op === "^") {
                const base = calculate(node.left, x, y, p);
                const exponent = integer(node.right, x, y);
                if (base === null || exponent === null) {
                    return null;
                }
                if (base === TOO_BIG || exponent === TOO_BIG) {
                    return TOO_BIG;
                }
                // отрицательный показатель — степень обратного: 2^−1 = 1/2
                const start = exponent < 0 ? inverseOrNull(base, p) : base;
                if (start === null) {
                    return null;
                }
                let result = 1 % p;
                let square = start;
                for (let rest = Math.abs(exponent); rest > 0; rest = Math.floor(rest / 2)) {
                    if (rest % 2 === 1) {
                        result = (result * square) % p;
                    }
                    square = (square * square) % p;
                }
                return result;
            }
            const left = calculate(node.left, x, y, p);
            const right = calculate(node.right, x, y, p);
            if (left === null || right === null) {
                return null;
            }
            if (left === TOO_BIG || right === TOO_BIG) {
                return TOO_BIG;
            }
            switch (node.op) {
                case "+":
                    return mod(left + right, p);
                case "-":
                    return mod(left - right, p);
                case "*":
                    return mod(left * right, p);
                case "/": {
                    const flipped = inverseOrNull(right, p);
                    return flipped === null ? null : mod(left * flipped, p);
                }
            }
        }
    }
}

/**
 * Значение части формулы по модулю p в точке (x; y). null — посчитать нельзя: деление на необратимое,
 * показатель дробный или больше 2⁵³ − 1.
 * @param {Expression} node
 * @param {number} x
 * @param {number} y
 * @param {number} p
 * @returns {number | null}
 */
export function evaluate(node, x, y, p) {
    const value = calculate(node, x, y, p);
    return value === TOO_BIG ? null : value;
}

/**
 * Верно ли сравнение в точке: обе части по модулю p, от 0 до p − 1, потом сравниваются как числа.
 * @param {Relation} relation
 * @param {number} x
 * @param {number} y
 * @param {number} p
 */
export function holds(relation, x, y, p) {
    return verdict(relation, x, y, p) === true;
}

/**
 * То же, что holds, но TOO_BIG — проверить нельзя: показатель степени больше 2⁵³ − 1.
 * @param {Relation} relation
 * @param {number} x
 * @param {number} y
 * @param {number} p
 * @returns {boolean | typeof TOO_BIG}
 */
function verdict(relation, x, y, p) {
    const left = calculate(relation.left, x, y, p);
    const right = calculate(relation.right, x, y, p);
    if (left === null || right === null) {
        return false;
    }
    if (left === TOO_BIG || right === TOO_BIG) {
        return TOO_BIG;
    }
    switch (relation.op) {
        case "=":
            return left === right;
        case "<":
            return left < right;
        case ">":
            return left > right;
        case "<=":
            return left <= right;
        case ">=":
            return left >= right;
        case "!=":
            return left !== right;
    }
}

/**
 * Все точки поля p × p, где сравнение верно, — по возрастанию x, потом y, — и сколько клеток проверить
 * не вышло: показатель степени в них больше 2⁵³ − 1.
 * @param {Relation} relation
 * @param {number} p
 * @returns {{ points: { x: number, y: number }[], unknown: number }}
 */
export function scanRelation(relation, p) {
    /** @type {{ x: number, y: number }[]} */
    const points = [];
    let unknown = 0;
    for (let x = 0; x < p; x++) {
        for (let y = 0; y < p; y++) {
            const result = verdict(relation, x, y, p);
            if (result === TOO_BIG) {
                unknown += 1;
            } else if (result) {
                points.push({ x, y });
            }
        }
    }
    return { points, unknown };
}

/**
 * Все точки поля p × p, где сравнение верно, — по возрастанию x, потом y.
 * @param {Relation} relation
 * @param {number} p
 * @returns {{ x: number, y: number }[]}
 */
export function relationPoints(relation, p) {
    return scanRelation(relation, p).points;
}

/**
 * Формула, как её пишут в тетради: степени надстрочными цифрами, настоящий минус, точка умножения.
 * Меняется только запись — смысл тот, что набрали.
 * @param {string} text
 */
export function prettyRelation(text) {
    const superscript = [..."⁰¹²³⁴⁵⁶⁷⁸⁹"];
    return text
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\^\s*(\d+)/g, (_, digits) => [...digits].map((d) => superscript[Number(d)]).join(""))
        .replace(/\s*\*\s*/g, " · ")
        .replace(/<=/g, "≤")
        .replace(/>=/g, "≥")
        .replace(/!=/g, "≠")
        .replace(/-/g, "−");
}
