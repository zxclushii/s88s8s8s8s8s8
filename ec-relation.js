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

// числа в формуле и показатели степени — без огромных: иначе 2^(x^y) считался бы вечно
const NUMBER_LIMIT = 1e9;
const EXPONENT_LIMIT = 1e6;

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
 * Показатель степени — обычное целое, без модуля, как в ffplot. null — дробный или слишком большой.
 * @param {Expression} node
 * @param {number} x
 * @param {number} y
 * @returns {number | null}
 */
function integer(node, x, y) {
    /** @param {number | null} value */
    const bounded = (value) => (value !== null && Math.abs(value) <= EXPONENT_LIMIT ? value : null);
    switch (node.kind) {
        case "number":
            return bounded(node.value);
        case "variable":
            return node.name === "x" ? x : y;
        case "negate": {
            const value = integer(node.arg, x, y);
            return value === null ? null : -value;
        }
        case "binary": {
            const left = integer(node.left, x, y);
            const right = integer(node.right, x, y);
            if (left === null || right === null) {
                return null;
            }
            switch (node.op) {
                case "+":
                    return bounded(left + right);
                case "-":
                    return bounded(left - right);
                case "*":
                    return bounded(left * right);
                case "/":
                    return right !== 0 && left % right === 0 ? left / right : null;
                case "^":
                    return right >= 0 && right <= 64 ? bounded(left ** right) : null;
            }
        }
    }
}

/**
 * Значение части формулы по модулю p в точке (x; y). null — посчитать нельзя: деление на необратимое,
 * слишком большой показатель.
 * @param {Expression} node
 * @param {number} x
 * @param {number} y
 * @param {number} p
 * @returns {number | null}
 */
export function evaluate(node, x, y, p) {
    switch (node.kind) {
        case "number":
            return mod(node.value, p);
        case "variable":
            return mod(node.name === "x" ? x : y, p);
        case "negate": {
            const value = evaluate(node.arg, x, y, p);
            return value === null ? null : mod(-value, p);
        }
        case "binary": {
            if (node.op === "^") {
                const base = evaluate(node.left, x, y, p);
                const exponent = integer(node.right, x, y);
                if (base === null || exponent === null) {
                    return null;
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
            const left = evaluate(node.left, x, y, p);
            const right = evaluate(node.right, x, y, p);
            if (left === null || right === null) {
                return null;
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
 * Верно ли сравнение в точке: обе части по модулю p, от 0 до p − 1, потом сравниваются как числа.
 * @param {Relation} relation
 * @param {number} x
 * @param {number} y
 * @param {number} p
 */
export function holds(relation, x, y, p) {
    const left = evaluate(relation.left, x, y, p);
    const right = evaluate(relation.right, x, y, p);
    if (left === null || right === null) {
        return false;
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
 * Все точки поля p × p, где сравнение верно, — по возрастанию x, потом y.
 * @param {Relation} relation
 * @param {number} p
 * @returns {{ x: number, y: number }[]}
 */
export function relationPoints(relation, p) {
    const found = [];
    for (let x = 0; x < p; x++) {
        for (let y = 0; y < p; y++) {
            if (holds(relation, x, y, p)) {
                found.push({ x, y });
            }
        }
    }
    return found;
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
