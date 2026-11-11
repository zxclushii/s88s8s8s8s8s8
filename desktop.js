// «Рабочий стол» сайта: фон на весь экран, на нём живые часы, табличка «main» и папки из чёрного стекла.
// Папка открывает и закрывает своё окно. Сами окна строят другие модули (плеер — ui.js), папки — glass.js.

import { FOLDER_ASPECT, GLASS_PLATE, glassFolder } from "./glass.js";
import { FONT, POSTER_FONT, addPressBounce, el } from "./ui.js";

const BACKGROUND_IMAGE = "img/bg.jpg";
// Заливка страницы под фоном — её видно, если фон не загрузился.
const PAGE_COLOR = "#0d0d0d";
const PAGE_GUTTER = 16;
// Часы стоят там, где в правом нижнем куске фона была нарисована надпись «11:00 PM» (с картинки она стёрта).
// Место — в пикселях самой картинки: правый край строки и линия, на которой стоят буквы; size — высота шрифта.
const CLOCK = { right: 2496, baseline: 828, size: 40 };
// От верха строки до линии букв, в долях высоты шрифта (у Helvetica и Arial при line-height: 1).
const CLOCK_BASELINE = 0.85;
// Где стоят папки (центр), в долях экрана: на белом пятне фотографии со спиной и на тёмной стене
// красной картинки — по обе стороны от стыка. Фон тянется вместе с экраном, поэтому доли, а не пиксели.
const FOLDER_CENTERS_X = [0.366, 0.62];
const FOLDER_CENTER_Y = 0.222;
// Ширина папки: на экране 1920 — 168px, как в утверждённом наброске.
const FOLDER_WIDTH = "clamp(84px, 8.75vw, 210px)";
// Зазор между папками и окном под ними.
const FOLDER_GAP = 14;
// Табличка «main» в левом верхнем углу.
const PLATE_INSET = 32;

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

/**
 * Превращает root в рабочий стол: фон, место под папки сверху, окна — по центру под ними.
 * Возвращает addFolder.
 */
export function createDesktop(root) {
    document.documentElement.style.height = "100%";
    // размеры папок считает сам CSS — от ширины экрана, без пересчёта из JS
    root.style.setProperty("--folder-width", FOLDER_WIDTH);
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

    // где мы: главный экран
    const plate = el("div", {
        position: "fixed",
        left: `${PLATE_INSET}px`,
        top: `${PLATE_INSET}px`,
        padding: "11px 18px 12px",
        borderRadius: "12px",
        ...GLASS_PLATE,
        font: `600 20px/1 ${GLASS_PLATE.fontFamily}`,
        letterSpacing: "-0.01em",
        pointerEvents: "none",
    }, { "data-part": "location" }, ["main"]);
    root.append(plate);

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

    background.addEventListener("load", () => {
        placeClock();
        window.addEventListener("resize", placeClock);
    });

    let placed = 0;

    return {
        /**
         * Ставит папку на следующее свободное место.
         * label — название на папке, title — что объявит скринридер,
         * window — окно с методом setOpen(true|false); без окна папка пустая и не нажимается.
         */
        addFolder({ label, title, window: target = null }) {
            const folder = glassFolder(label);
            const button = el("button", {
                position: "absolute",
                top: "var(--folder-top)",
                left: `${FOLDER_CENTERS_X[placed++] * 100}%`,
                width: "var(--folder-width)",
                height: "var(--folder-height)",
                // не transform: его занимает анимация нажатия
                marginLeft: "calc(var(--folder-width) / -2)",
                padding: "0",
                border: "0",
                background: "none",
                cursor: target ? "pointer" : "default",
                WebkitTapHighlightColor: "transparent",
            }, { type: "button", "aria-label": title, "data-part": "folder" }, [folder.node]);

            if (target) {
                let open = false;
                let hovered = false;
                const paint = () => folder.setLit(open || hovered);
                button.setAttribute("aria-pressed", "false");
                // на тачскрине «наведения» нет — подсветка залипла бы после тапа
                button.addEventListener("pointerenter", (event) => {
                    hovered = event.pointerType === "mouse";
                    paint();
                });
                button.addEventListener("pointerleave", () => {
                    hovered = false;
                    paint();
                });
                addPressBounce(button);
                button.addEventListener("click", () => {
                    open = !open;
                    target.setOpen(open);
                    button.setAttribute("aria-pressed", String(open));
                    paint();
                });
            } else {
                button.disabled = true;
            }
            root.append(button);
        },
    };
}
