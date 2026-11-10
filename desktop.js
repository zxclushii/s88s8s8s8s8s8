// «Рабочий стол» сайта: фон на весь экран и папки поверх него. Папка открывает и закрывает своё окно —
// как папки-вкладки на monotonousreign.neocities.org. Сами окна строят другие модули (плеер — ui.js).

import { glossyFolder } from "./gloss.js";
import { FONT, LABEL_FADE_RIGHT, TEXT_HALO, addHoverGlow, addPressBounce, el } from "./ui.js";

const BACKGROUND_IMAGE = "img/bg.jpg";
const PAGE_GUTTER = 16;
// Цвет папок: "black" или "white" — обе рисует gloss.js.
const FOLDER_TONE = "black";
// Ореол отделяет папку от фона того же цвета: чёрную — от тёмной стены, белую — от белой бумаги.
const FOLDER_HALO = {
    black: "drop-shadow(0 0 1px rgba(255, 255, 255, 0.9)) drop-shadow(0 0 5px rgba(255, 255, 255, 0.45))",
    white: "drop-shadow(0 0 1px rgba(0, 0, 0, 0.9)) drop-shadow(0 0 6px rgba(255, 255, 255, 0.7))",
};
// Где стоят папки, в долях экрана. По порядку: на белом пятне фотографии со спиной и на тёмной стене
// красной картинки — по обе стороны от стыка. Фон тянется вместе с экраном, поэтому доли, а не пиксели.
const FOLDER_CENTERS_X = [0.38, 0.64];
const FOLDER_CENTER_Y = 0.104;
// Сетка значка папки в gloss.js — 64×52.
const FOLDER_ASPECT = 52 / 64;
// Зазор между папками и окном под ними.
const FOLDER_GAP = 14;

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
        background: "#0d0d0d",
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

    let count = 0;

    return {
        /**
         * Ставит папку на следующее свободное место.
         * label — подпись на папке, title — что объявит скринридер,
         * window — окно с методом setOpen(true|false); без окна папка пустая и не нажимается.
         */
        addFolder({ label, title, window: target = null }) {
            const icon = glossyFolder(FOLDER_TONE);
            Object.assign(icon.style, { display: "block", width: "100%", height: "auto", filter: FOLDER_HALO[FOLDER_TONE] });

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
                left: `${FOLDER_CENTERS_X[count] * 100}%`,
                width: "var(--folder-width)",
                // не transform: его занимает анимация нажатия
                marginLeft: "calc(var(--folder-width) / -2)",
                padding: "0",
                border: "0",
                background: "none",
                cursor: target ? "pointer" : "default",
                WebkitTapHighlightColor: "transparent",
            }, { type: "button", "aria-label": title, "data-part": "folder" }, [icon, caption, dot]);
            count += 1;

            if (target) {
                let open = false;
                button.setAttribute("aria-pressed", "false");
                addHoverGlow(button);
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
        },
    };
}
