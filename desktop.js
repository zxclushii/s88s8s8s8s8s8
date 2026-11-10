// «Рабочий стол» сайта: фон на весь экран, на нём живые часы и папки. Папка открывает и закрывает своё окно —
// как папки-вкладки на monotonousreign.neocities.org. Сами окна строят другие модули (плеер — ui.js).
// Цвет папки подстраивается под фон: на тёмном месте картинки она белая, на светлом — чёрная.

import { glossyFolder } from "./gloss.js";
import { FONT, LABEL_FADE_RIGHT, POSTER_FONT, TEXT_HALO, addHoverGlow, addPressBounce, el } from "./ui.js";

const BACKGROUND_IMAGE = "img/bg.jpg";
// Заливка страницы под фоном и её яркость (0…255) — её видно, если фон не загрузился.
const PAGE_COLOR = "#0d0d0d";
const PAGE_BRIGHTNESS = 13;
const PAGE_GUTTER = 16;
// Яркость фона под папкой, 0…255: темнее порога — папка белая, светлее — чёрная.
const DARK_BELOW = 128;
// Для замера яркости фон уменьшаем до такой ширины: под папкой остаётся с десяток клеток — для среднего хватает.
const BRIGHTNESS_MAP_WIDTH = 256;
// Папки двух цветов (обе рисует gloss.js). Ореол отделяет папку от фона, если тот окажется того же цвета;
// свечение при наведении — того цвета, который виден на фоне этой папки.
const TONES = {
    black: {
        halo: "drop-shadow(0 0 1px rgba(255, 255, 255, 0.9)) drop-shadow(0 0 5px rgba(255, 255, 255, 0.45))",
        hoverGlow: "0, 0, 0",
    },
    white: {
        halo: "drop-shadow(0 0 1px rgba(0, 0, 0, 0.9)) drop-shadow(0 0 6px rgba(255, 255, 255, 0.7))",
        hoverGlow: "255, 255, 255",
    },
};
// Часы стоят там, где в правом нижнем куске фона была нарисована надпись «11:00 PM» (с картинки она стёрта).
// Место — в пикселях самой картинки: правый край строки и линия, на которой стоят буквы; size — высота шрифта.
const CLOCK = { right: 2496, baseline: 828, size: 40 };
// От верха строки до линии букв, в долях высоты шрифта (у Helvetica и Arial при line-height: 1).
const CLOCK_BASELINE = 0.85;
// Где стоят папки, в долях экрана. По порядку: на белом пятне фотографии со спиной и на тёмной стене
// красной картинки — по обе стороны от стыка. Фон тянется вместе с экраном, поэтому доли, а не пиксели.
const FOLDER_CENTERS_X = [0.38, 0.64];
const FOLDER_CENTER_Y = 0.104;
// Сетка значка папки в gloss.js — 64×52.
const FOLDER_ASPECT = 52 / 64;
// Зазор между папками и окном под ними.
const FOLDER_GAP = 14;

/** Карта яркости картинки: уменьшенная и серая; считается один раз. */
function readBrightness(image) {
    const width = BRIGHTNESS_MAP_WIDTH;
    const height = Math.round(width * image.naturalHeight / image.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    const values = new Float32Array(width * height);
    for (let i = 0; i < values.length; i++) {
        // веса цветов — насколько ярким каждый видит глаз (Rec. 709): красный темнее, чем кажется по числу
        values[i] = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
    }
    return { values, width, height };
}

/**
 * Как картинка легла на экран. Она растянута как object-fit: cover — увеличена, пока не закроет экран,
 * лишнее обрезано поровну с двух сторон; повторяем тот же расчёт.
 * scale — во сколько раз увеличена; left и top — где на экране её левый верхний угол (обычно за краем экрана).
 */
function coverFit(image) {
    const box = image.getBoundingClientRect();
    const scale = Math.max(box.width / image.naturalWidth, box.height / image.naturalHeight);
    return {
        scale,
        left: box.left + (box.width - image.naturalWidth * scale) / 2,
        top: box.top + (box.height - image.naturalHeight * scale) / 2,
    };
}

/** Средняя яркость картинки под прямоугольником экрана. */
function brightnessUnder(map, image, rect) {
    const { scale, left, top } = coverFit(image);
    // сколько пикселей экрана в одной клетке карты
    const cell = image.naturalWidth * scale / map.width;
    const clamp = (value, max) => Math.min(max, Math.max(0, value));
    const x0 = clamp(Math.floor((rect.left - left) / cell), map.width - 1);
    const y0 = clamp(Math.floor((rect.top - top) / cell), map.height - 1);
    // хотя бы одна клетка, даже если прямоугольник вылез за картинку
    const x1 = Math.max(x0 + 1, clamp(Math.ceil((rect.right - left) / cell), map.width));
    const y1 = Math.max(y0 + 1, clamp(Math.ceil((rect.bottom - top) / cell), map.height));

    let sum = 0;
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            sum += map.values[y * map.width + x];
        }
    }
    return sum / ((x1 - x0) * (y1 - y0));
}

/**
 * Превращает root в рабочий стол: фон, место под папки сверху, окна — по центру под ними.
 * Возвращает addFolder.
 */
export function createDesktop(root) {
    document.documentElement.style.height = "100%";
    // размеры папок считает сам CSS — от ширины и высоты экрана, без пересчёта из JS
    root.style.setProperty("--folder-width", "clamp(64px, 3vw + 50px, 128px)");
    root.style.setProperty("--folder-height", `calc(var(--folder-width) * ${FOLDER_ASPECT})`);
    root.style.setProperty("--folder-top", `max(${PAGE_GUTTER}px, calc(${FOLDER_CENTER_Y * 100}vh - var(--folder-height) / 2))`);
    Object.assign(root.style, {
        position: "relative",
        margin: "0",
        minHeight: "100%",
        boxSizing: "border-box",
        // сверху — полоса под папки; окна начинаются под ней
        padding: `calc(var(--folder-top) + var(--folder-height) + ${FOLDER_GAP}px) ${PAGE_GUTTER}px ${PAGE_GUTTER}px`,
        display: "grid",
        placeItems: "start center",
        background: PAGE_COLOR,
        fontFamily: FONT,
    });

    const background = el("img", {
        position: "fixed",
        inset: "0",
        width: "100%",
        height: "100%",
        objectFit: "cover",
        zIndex: "-1",
    }, { alt: "", src: BACKGROUND_IMAGE, "data-part": "background" });
    root.append(background);

    // Часы — часть картинки: стоят в своём месте фона и растут вместе с ним. Пока фон не загрузился, их не видно.
    const clock = el("div", {
        position: "fixed",
        visibility: "hidden",
        whiteSpace: "nowrap",
        font: `700 1em/1 ${POSTER_FONT}`,
        color: "#fff",
        textShadow: "0 0 8px rgba(255, 255, 255, 0.5)",
        pointerEvents: "none",
    }, { "data-part": "clock" });
    root.append(clock);

    function placeClock() {
        const { scale, left, top } = coverFit(background);
        const size = CLOCK.size * scale;
        Object.assign(clock.style, {
            fontSize: `${size}px`,
            // правый край строки привязан к месту на картинке — задаём его отступом от правого края экрана
            right: `${document.documentElement.clientWidth - (left + CLOCK.right * scale)}px`,
            top: `${top + CLOCK.baseline * scale - size * CLOCK_BASELINE}px`,
            visibility: "visible",
        });
    }

    function tick() {
        const now = new Date();
        // как на кассете: «11:00 PM»
        clock.textContent = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        // следующее обновление — ровно на смене минуты
        setTimeout(tick, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
    }
    tick();

    const folders = [];
    // Яркость фона под прямоугольником экрана; пока фон грузится, она неизвестна.
    let brightnessAt = null;

    function pickTones() {
        if (!brightnessAt) {
            return;
        }
        for (const folder of folders) {
            folder.setTone(brightnessAt(folder.button.getBoundingClientRect()) < DARK_BELOW ? "white" : "black");
        }
    }

    background.addEventListener("load", () => {
        const map = readBrightness(background);
        brightnessAt = (rect) => brightnessUnder(map, background, rect);
        pickTones();
        placeClock();
        window.addEventListener("resize", placeClock);
    });
    background.addEventListener("error", () => {
        // картинки нет — под папками заливка страницы
        brightnessAt = () => PAGE_BRIGHTNESS;
        pickTones();
    });
    // на другом размере окна фон обрезан иначе, и под папкой оказывается другой его кусок
    window.addEventListener("resize", pickTones);

    return {
        /**
         * Ставит папку на следующее свободное место.
         * label — подпись на папке, title — что объявит скринридер,
         * window — окно с методом setOpen(true|false); без окна папка пустая и не нажимается.
         */
        addFolder({ label, title, window: target = null }) {
            // подпись поверх папки, с чёрной подложкой — как .tab-label на monotonousreign
            const caption = el("span", {
                position: "absolute",
                left: "9%",
                top: "45%",
                width: "112%",
                boxSizing: "border-box",
                padding: "2px 5px",
                textAlign: "left",
                whiteSpace: "nowrap",
                // буквы растут вместе с папкой — пропорция как на monotonousreign (15px на папке 96px)
                font: `700 max(11px, calc(var(--folder-width) * 0.15))/1.25 ${FONT}`,
                color: "#fff",
                textShadow: TEXT_HALO,
                background: LABEL_FADE_RIGHT,
            }, {}, [label]);

            // точка под открытой папкой — как у включённых shuffle и repeat в плеере
            const dot = el("span", {
                position: "absolute",
                left: "50%",
                bottom: "-10px",
                width: "6px",
                height: "6px",
                marginLeft: "-3px",
                borderRadius: "50%",
                background: "#000",
                boxShadow: "0 0 2px 1px rgba(255, 255, 255, 0.9)",
                opacity: "0",
                transition: "opacity 0.2s",
            });

            const button = el("button", {
                position: "absolute",
                top: "var(--folder-top)",
                left: `${FOLDER_CENTERS_X[folders.length] * 100}%`,
                // высота задана явно: место папки на фоне нужно знать ещё до того, как в ней появится значок
                width: "var(--folder-width)",
                height: "var(--folder-height)",
                // не transform: его занимает анимация нажатия
                marginLeft: "calc(var(--folder-width) / -2)",
                padding: "0",
                border: "0",
                background: "none",
                cursor: target ? "pointer" : "default",
                WebkitTapHighlightColor: "transparent",
                // пока цвет не выбран (фон ещё грузится), папку не показываем — иначе она мигнула бы не тем цветом
                visibility: "hidden",
            }, { type: "button", "aria-label": title, "data-part": "folder" }, [caption, dot]);

            let tone = null;
            let icon = null;
            function setTone(next) {
                if (next === tone) {
                    return;
                }
                tone = next;
                const fresh = glossyFolder(tone);
                Object.assign(fresh.style, { display: "block", width: "100%", height: "auto", filter: TONES[tone].halo });
                if (icon) {
                    icon.replaceWith(fresh);
                } else {
                    button.prepend(fresh);
                }
                icon = fresh;
                button.dataset.tone = tone;
                button.style.visibility = "visible";
            }

            if (target) {
                let open = false;
                button.setAttribute("aria-pressed", "false");
                addHoverGlow(button, () => TONES[tone].hoverGlow);
                addPressBounce(button);
                button.addEventListener("click", () => {
                    open = !open;
                    target.setOpen(open);
                    dot.style.opacity = open ? "1" : "0";
                    button.setAttribute("aria-pressed", String(open));
                });
            } else {
                button.disabled = true;
            }
            root.append(button);
            folders.push({ button, setTone });
            // фон мог успеть загрузиться раньше, чем добавили папку
            pickTones();
        },
    };
}
