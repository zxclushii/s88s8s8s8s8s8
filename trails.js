// @ts-check
// След за курсором: из-под указателя сыплются звёздочки или сердечки и гаснут. Включают его команды терминала
// star_cursive и heart_cursive, по умолчанию он выключен. Рисует один canvas поверх страницы; кадры идут,
// только пока на экране есть частицы.

/** @typedef {import("./commands.js").Trail} Trail */
/** @typedef {import("./commands.js").Trails} Trails */

/**
 * @typedef {object} TrailSwitch
 * @property {() => Trails} state что сейчас включено
 * @property {(trail: Trail, on: boolean) => void} set включить или выключить
 * @property {() => boolean} calm в системе просят меньше движения — тогда не включаем
 */

/**
 * @typedef {object} Particle
 * @property {Trail} kind
 * @property {number} x
 * @property {number} y
 * @property {number} vx скорость, пикселей в миллисекунду
 * @property {number} vy
 * @property {number} age сколько уже живёт, мс
 * @property {number} life сколько проживёт, мс
 * @property {number} size
 * @property {number} angle
 * @property {number} spin радиан в миллисекунду
 */

// та же восьмиконечная звезда, что над i в lushii; обе фигуры — в квадрате −100…100
const STAR_PATH =
    "M-6.9 16.6L0 100L6.9 16.6L31.1 31.1L16.6 6.9L72 0L16.6 -6.9L31.1 -31.1L6.9 -16.6L0 -100L-6.9 -16.6" +
    "L-31.1 -31.1L-16.6 -6.9L-72 0L-16.6 6.9L-31.1 31.1L-6.9 16.6Z";
const HEART_PATH =
    "M0 82C-58 40 -96 6 -96 -34C-96 -66 -72 -88 -46 -88C-24 -88 -8 -74 0 -58" +
    "C8 -74 24 -88 46 -88C72 -88 96 -66 96 -34C96 6 58 40 0 82Z";
// --white из css/site.css: белый как бумага, а не чистый
const COLOR = "#e8e6e1";
// сколько пикселей пройти указателем до следующей частицы
const SPACING = 14;
const MAX_PARTICLES = 220;
// ускорение вниз, пикселей в мс²: за секунду частица падает примерно на 125 px
const GRAVITY = 0.00025;
// после спрятанной вкладки не прыгаем на секунды вперёд
const MAX_FRAME_MS = 48;

/** @param {HTMLCanvasElement} canvas */
function context2d(canvas) {
    const context = canvas.getContext("2d");
    if (!context) {
        throw new Error("след за курсором: браузер не дал 2d-контекст canvas");
    }
    return context;
}

/** Создаёт выключенный след; canvas появляется на странице, когда след включат впервые. */
export function createTrails() {
    /** @type {Trails} */
    const on = { star: false, heart: false };
    const canvas = document.createElement("canvas");
    canvas.className = "trail";
    canvas.setAttribute("aria-hidden", "true");
    const context = context2d(canvas);
    const shapes = { star: new Path2D(STAR_PATH), heart: new Path2D(HEART_PATH) };

    /** @type {Particle[]} */
    let particles = [];
    let frame = 0;
    let last = 0;
    let travelled = 0;
    /** @type {{ x: number, y: number } | null} */
    let previous = null;
    // когда включены оба следа — звёздочка и сердечко по очереди
    let flip = false;

    function resize() {
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.round(window.innerWidth * ratio);
        canvas.height = Math.round(window.innerHeight * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    /** @param {number} now */
    function tick(now) {
        const dt = Math.min(MAX_FRAME_MS, now - last);
        last = now;
        for (const particle of particles) {
            particle.age += dt;
        }
        particles = particles.filter((particle) => particle.age < particle.life);
        context.clearRect(0, 0, window.innerWidth, window.innerHeight);
        context.fillStyle = COLOR;
        // light_star on — у звёздочек из следа тоже сияние; размытие тени считается в пикселях холста
        const glow = document.body.classList.contains("light-stars") ? 9 * (window.devicePixelRatio || 1) : 0;
        for (const particle of particles) {
            particle.vy += GRAVITY * dt;
            particle.x += particle.vx * dt;
            particle.y += particle.vy * dt;
            particle.angle += particle.spin * dt;
            const fade = 1 - particle.age / particle.life;
            const scale = (particle.size * (0.6 + 0.4 * fade)) / 200;
            context.save();
            context.globalAlpha = fade;
            context.translate(particle.x, particle.y);
            // сердечко только чуть покачивается, звезда крутится
            context.rotate(particle.kind === "star" ? particle.angle : Math.sin(particle.angle) * 0.35);
            context.scale(scale, scale);
            context.shadowColor = COLOR;
            context.shadowBlur = particle.kind === "star" ? glow : 0;
            context.fill(shapes[particle.kind]);
            context.restore();
        }
        frame = particles.length > 0 ? requestAnimationFrame(tick) : 0;
    }

    /**
     * @param {number} x
     * @param {number} y
     */
    function spawn(x, y) {
        flip = !flip;
        /** @type {Trail} */
        const kind = on.star && on.heart ? (flip ? "star" : "heart") : on.star ? "star" : "heart";
        particles.push({
            kind,
            x,
            y,
            vx: (Math.random() - 0.5) * 0.08,
            vy: (Math.random() - 0.6) * 0.06,
            age: 0,
            life: 900 + Math.random() * 600,
            size: kind === "star" ? 12 + Math.random() * 9 : 10 + Math.random() * 6,
            angle: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.006,
        });
        if (particles.length > MAX_PARTICLES) {
            particles.splice(0, particles.length - MAX_PARTICLES);
        }
        if (frame === 0) {
            last = performance.now();
            frame = requestAnimationFrame(tick);
        }
    }

    // мышь, перо и палец: на телефоне сыплется, пока палец ведут по экрану
    window.addEventListener(
        "pointermove",
        (event) => {
            if (!on.star && !on.heart) {
                previous = null;
                return;
            }
            const point = { x: event.clientX, y: event.clientY };
            if (previous) {
                travelled += Math.hypot(point.x - previous.x, point.y - previous.y);
            }
            previous = point;
            if (travelled >= SPACING) {
                travelled = 0;
                spawn(point.x, point.y);
            }
        },
        { passive: true },
    );

    return {
        state: () => ({ ...on }),
        calm: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        /**
         * @param {Trail} trail
         * @param {boolean} value
         */
        set(trail, value) {
            on[trail] = value;
            if (value && !canvas.isConnected) {
                document.body.append(canvas);
                resize();
                window.addEventListener("resize", resize);
            }
        },
    };
}
