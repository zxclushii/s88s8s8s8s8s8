// Внешний вид плеера — всё строится и рисуется из JS.
// На большом экране плеер занимает его целиком: слева список треков, по центру обложка,
// справа над ней бегущая строка, внизу во всю ширину панель с кнопками (раскладка как у Spotify).
// На маленьком — обложка и панель под ней, столбиком по центру.
// Стеклянная панель и чёрный глянец — как на monotonousreign.neocities.org (7.css, Aero).
// Страницу вокруг (фон, папки) строит desktop.js; плеер — окно, которое открывает папка.

import { flatGlyph, glossyGlyph, glossyOrb, repeatOneMark } from "./gloss.js";

// Noto Sans Mono — латиница и кириллица, M PLUS 1 Code — японский; MS Gothic как у того сайта — запасной.
export const FONT = '"Noto Sans Mono", "M PLUS 1 Code", "MS Gothic", monospace';
// Белый текст на стекле читается на любой обложке благодаря тёмному ореолу.
// (Жёсткая обводка 1px, как у подписей на monotonousreign, на мелком тонком шрифте выглядит полой.)
export const TEXT_HALO = "0 0 3px rgba(0, 0, 0, 0.95), 0 1px 1px #000";
// Шрифт надписи «ofc angels are real..» на фоне — гротеск вроде Helvetica; им набраны часы и бегущая строка.
export const POSTER_FONT = 'Helvetica, Arial, "Liberation Sans", sans-serif';
// Обложка квадратная, по центру над плеером; плеер шире неё.
const COVER_MAX_SIZE = 480;
const COVER_MIN_SIZE = 220;
const TRAY_MAX_WIDTH = 720;
// Экран не меньше этого — плеер разворачивается на весь экран; меньше — остаётся столбиком.
const FULL_MIN_WIDTH = 1100;
const FULL_MIN_HEIGHT = 600;
// На весь экран обложка крупнее, а её центр чуть выше середины экрана: снизу место занимает панель.
const FULL_COVER_MAX_SIZE = 560;
const FULL_COVER_CENTER_Y = 0.46;
// Список треков: левый край и верх — в долях экрана, ширина — доля экрана, но не шире предела.
const TRACKLIST_LEFT = 0.05;
const TRACKLIST_TOP = 0.21;
const TRACKLIST_WIDTH = 0.22;
const TRACKLIST_MAX_WIDTH = 560;
// Столько строк видно разом на большом мониторе; остальные — прокруткой.
const TRACKLIST_MAX_ROWS = 11;
const TRACK_ROW_HEIGHT = 40;
const TRACK_ROW_GAP = 8;
// Запас внутри прокрутки: без него она обрезала бы ореол строк.
const TRACKLIST_PADDING = 6;
// Просвет между обложкой и тем, что стоит сбоку от неё.
const SIDE_GAP = 40;
// Бегущая строка: ширина — доля экрана, скорость — пикселей в секунду.
const MARQUEE_WIDTH = 0.3;
const MARQUEE_SPEED = 70;
// Края бегущей строки тают на такой ширине (в высотах шрифта), чтобы буквы не обрубались.
const MARQUEE_FADE = "0.7em";
// Уже этого плеер перестраивается в столбик (телефоны): три колонки —
// название 130px, кнопки с полосой 300px, громкость 130px — плюс зазоры и отступы панели.
const WIDE_TRAY_MIN_WIDTH = 630;
// Расстояние между обложкой и плеером.
const BLOCK_GAP = 14;
const SEEK_STEP_SECONDS = 5;
const VOLUME_STEP = 0.05;
// Окно плеера проявляется и тает, как .tab-content на monotonousreign.
const WINDOW_FADE_MS = 400;

const REPEAT_LABELS = { off: "Повтор: выключен", all: "Повтор: весь плейлист", one: "Повтор: один трек" };

export function el(tag, style = {}, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.assign(node.style, style);
    for (const [name, value] of Object.entries(attrs)) {
        node.setAttribute(name, value);
    }
    node.append(...children);
    return node;
}

export function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return "0:00";
    }
    const whole = Math.floor(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Заглушка для трека без обложки: серебристый фон, полутоновые точки, чёрная глянцевая нота. */
function drawPlaceholderCover() {
    const size = 600;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    const backdrop = ctx.createRadialGradient(size * 0.5, size * 0.3, size * 0.05, size * 0.5, size * 0.45, size * 0.8);
    backdrop.addColorStop(0, "#f4f4f4");
    backdrop.addColorStop(0.55, "#b4b4b4");
    backdrop.addColorStop(1, "#585858");
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, size, size);

    // полутоновые точки: у краёв крупные, к центру тают
    const step = 16;
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    for (let y = step / 2; y < size; y += step) {
        for (let x = step / 2; x < size; x += step) {
            const t = Math.min(1, Math.hypot(x - size / 2, y - size * 0.4) / (size * 0.62));
            const radius = t * t * step * 0.42;
            if (radius > 0.4) {
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // нота на сетке 100×100
    const note = new Path2D();
    const heads = [[32, 74], [72, 66]];
    for (const [cx, cy] of heads) {
        const rx = 13;
        const tilt = -0.35;
        // moveTo — иначе Path2D соединит эллипс линией с предыдущей фигурой
        note.moveTo(cx + rx * Math.cos(tilt), cy + rx * Math.sin(tilt));
        note.ellipse(cx, cy, rx, 9.5, tilt, 0, Math.PI * 2);
    }
    note.rect(41.5, 25, 4.5, 48);
    note.rect(81.5, 17, 4.5, 48);
    note.moveTo(41.5, 25);
    note.lineTo(86, 15.5);
    note.lineTo(86, 28);
    note.lineTo(41.5, 37.5);
    note.closePath();

    ctx.save();
    const scale = 3.2;
    ctx.translate(size / 2 - 52 * scale, size * 0.4 - 50 * scale);
    ctx.scale(scale, scale);

    const body = ctx.createLinearGradient(0, 15, 0, 84);
    body.addColorStop(0, "#666");
    body.addColorStop(0.42, "#161616");
    body.addColorStop(0.5, "#000");
    body.addColorStop(1, "#2b2b2b");
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = body;
    ctx.fill(note);

    ctx.shadowColor = "transparent";
    ctx.clip(note);
    const shine = ctx.createLinearGradient(0, 15, 0, 50);
    shine.addColorStop(0, "rgba(255, 255, 255, 0.7)");
    shine.addColorStop(0.9, "rgba(255, 255, 255, 0.1)");
    shine.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = shine;
    ctx.fillRect(0, 15, 100, 35);
    for (const [cx, cy] of heads) {
        const glint = ctx.createRadialGradient(cx - 4, cy - 5, 0, cx - 4, cy - 5, 9);
        glint.addColorStop(0, "rgba(255, 255, 255, 0.55)");
        glint.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = glint;
        ctx.fillRect(cx - 14, cy - 14, 28, 28);
    }
    ctx.restore();

    return canvas.toDataURL("image/png");
}

/**
 * Свечение при наведении — как .tab:hover на monotonousreign. Обычно чёрное;
 * glowRgb на момент наведения говорит другой цвет ("r, g, b"): на тёмном фоне чёрного свечения не видно.
 */
export function addHoverGlow(node, glowRgb = () => "0, 0, 0") {
    let glow = null;
    node.addEventListener("pointerenter", (event) => {
        // на тачскрине «наведения» нет — свечение залипло бы после тапа
        if (event.pointerType !== "mouse") {
            return;
        }
        glow?.cancel();
        const rgb = glowRgb();
        glow = node.animate(
            [{ filter: `drop-shadow(0 0 0 rgba(${rgb}, 0))` }, { filter: `drop-shadow(0 0 8px rgba(${rgb}, 0.95))` }],
            { duration: 200, easing: "ease-out", fill: "forwards" },
        );
    });
    node.addEventListener("pointerleave", () => glow?.reverse());
}

/** Короткое «вдавливание» при нажатии. */
export function addPressBounce(node) {
    node.addEventListener("pointerdown", () => {
        node.animate(
            [{ transform: "scale(1)" }, { transform: "scale(0.86)" }, { transform: "scale(1)" }],
            { duration: 240, easing: "ease-out" },
        );
    });
}

function iconButton(label, part, content, size) {
    const button = el("button", {
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: `${size}px`,
        height: `${size}px`,
        padding: "0",
        border: "0",
        borderRadius: "50%",
        background: "none",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
    }, { type: "button", "aria-label": label, "data-part": part }, [content]);
    addHoverGlow(button);
    addPressBounce(button);
    return button;
}

/** Чёрный глянцевый значок; тонкий белый ореол отделяет его от тёмной обложки (как у их орнамента). */
function glyph(kind, size) {
    const icon = glossyGlyph(kind, size);
    icon.style.filter = "drop-shadow(0 0 1px rgba(255, 255, 255, 0.85))";
    return icon;
}

/** Кнопка-переключатель (shuffle, repeat): включена — ярче и с точкой снизу, как в Spotify. */
function toggleButton(label, part, icon) {
    const dot = el("span", {
        position: "absolute",
        left: "50%",
        bottom: "-3px",
        width: "4px",
        height: "4px",
        marginLeft: "-2px",
        borderRadius: "50%",
        background: "#000",
        boxShadow: "0 0 2px rgba(255, 255, 255, 0.9)",
        transition: "opacity 0.2s",
    });
    const button = iconButton(label, part, icon, 34);
    button.append(dot);
    return {
        button,
        setActive(active) {
            icon.style.opacity = active ? "1" : "0.5";
            dot.style.opacity = active ? "1" : "0";
            button.setAttribute("aria-pressed", String(active));
        },
    };
}

/**
 * Ползунок на div'ах — для перемотки и громкости: клик и перетаскивание мышью или пальцем, стрелки с клавиатуры.
 * Работает в долях 0…1: onDrag — пока тянут, onCommit — когда отпустили или нажали клавишу.
 */
function createSlider({ label, part, knobSize, keyStep, onDrag, onCommit }) {
    const fill = el("div", {
        position: "absolute",
        left: "0",
        top: "0",
        bottom: "0",
        width: "0%",
        borderRadius: "3px",
        background: "linear-gradient(#ffffff, #e2e2e2 50%, #a9a9a9 52%, #f0f0f0)",
        boxShadow: "0 0 6px rgba(255, 255, 255, 0.7)",
    });
    const track = el("div", {
        position: "absolute",
        left: "0",
        right: "0",
        top: "50%",
        height: "5px",
        marginTop: "-2.5px",
        borderRadius: "3px",
        background: "rgba(0, 0, 0, 0.55)",
        boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.7), 0 1px 0 rgba(255, 255, 255, 0.35)",
    }, {}, [fill]);
    const knob = el("div", {
        position: "absolute",
        top: "50%",
        left: "0%",
        width: `${knobSize}px`,
        height: `${knobSize}px`,
        margin: `${-knobSize / 2}px 0 0 ${-knobSize / 2}px`,
        boxSizing: "border-box",
        borderRadius: "50%",
        border: "1px solid rgba(255, 255, 255, 0.85)",
        background: "radial-gradient(circle at 50% 30%, #8a8a8a, #1a1a1a 55%, #000)",
        boxShadow: "0 0 4px rgba(0, 0, 0, 0.9)",
    });
    const root = el("div", {
        position: "relative",
        flex: "1",
        height: "18px",
        cursor: "pointer",
        // иначе на телефоне перетаскивание ползунка прокручивает страницу
        touchAction: "none",
    }, {
        role: "slider",
        tabindex: "0",
        "aria-label": label,
        "aria-valuemin": "0",
        "aria-valuemax": "0",
        "aria-valuenow": "0",
        "data-part": part,
    }, [track, knob]);

    // Пока двигать нечего (длина трека ещё неизвестна) — ползунок не реагирует.
    let enabled = false;
    let value = 0;
    let dragging = false;
    let dragValue = 0;

    const clamp = (fraction) => Math.min(1, Math.max(0, fraction));
    const render = (fraction) => {
        fill.style.width = `${fraction * 100}%`;
        knob.style.left = `${fraction * 100}%`;
    };
    const dragTo = (clientX) => {
        const rect = track.getBoundingClientRect();
        dragValue = clamp((clientX - rect.left) / rect.width);
        render(dragValue);
        onDrag(dragValue);
    };

    root.addEventListener("pointerdown", (event) => {
        if (!enabled) {
            return;
        }
        dragging = true;
        root.setPointerCapture(event.pointerId);
        dragTo(event.clientX);
    });
    root.addEventListener("pointermove", (event) => {
        if (dragging) {
            dragTo(event.clientX);
        }
    });
    root.addEventListener("pointerup", () => {
        if (!dragging) {
            return;
        }
        dragging = false;
        onCommit(dragValue);
    });
    // Жест забрал браузер — отменяем без изменений.
    root.addEventListener("pointercancel", () => {
        dragging = false;
        render(value);
    });
    root.addEventListener("keydown", (event) => {
        if (!enabled) {
            return;
        }
        const step = keyStep();
        const target = {
            ArrowLeft: value - step,
            ArrowDown: value - step,
            ArrowRight: value + step,
            ArrowUp: value + step,
            Home: 0,
            End: 1,
        }[event.key];
        if (target === undefined) {
            return;
        }
        event.preventDefault();
        onCommit(clamp(target));
    });

    return {
        root,
        get dragging() {
            return dragging;
        },
        /** fraction — доля 0…1; now/max/text — что объявлять скринридеру. */
        set(fraction, { enabled: isEnabled, now, max, text }) {
            enabled = isEnabled;
            value = clamp(fraction);
            root.setAttribute("aria-valuemax", String(max));
            root.setAttribute("aria-valuenow", String(now));
            root.setAttribute("aria-valuetext", text);
            if (!dragging) {
                render(value);
            }
        },
        /** thickness — толщина полосы, height — высота области под палец, knob — показывать ли ползунок. */
        setLook({ thickness, height, knob: showKnob }) {
            root.style.height = `${height}px`;
            track.style.height = `${thickness}px`;
            track.style.marginTop = `${-thickness / 2}px`;
            track.style.borderRadius = `${thickness / 2}px`;
            fill.style.borderRadius = `${thickness / 2}px`;
            knob.style.display = showKnob ? "" : "none";
        },
    };
}

// Чёрная подложка под названием, как у подписей папок на monotonousreign: тает вправо
// (название слева) или в обе стороны (название по центру).
export const LABEL_FADE_RIGHT = "linear-gradient(to right, rgba(0, 0, 0, 0.92), rgba(0, 0, 0, 0))";
const LABEL_FADE_BOTH = "linear-gradient(to right, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.85) 22%, rgba(0, 0, 0, 0.85) 78%, rgba(0, 0, 0, 0))";

// Строка списка треков — в стиле папок: чёрный глянец со ступенькой посередине, светлый кант, белый ореол.
// Играющий трек — как белая папка.
const TRACK_ROW_LOOK = {
    idle: {
        background: "linear-gradient(#5a5a5a, #1c1c1c 48%, #020202 54%, #2a2a2a)",
        boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.22), 0 0 1px 1px rgba(255, 255, 255, 0.75), 0 0 6px rgba(255, 255, 255, 0.35)",
        color: "#fff",
        textShadow: TEXT_HALO,
    },
    playing: {
        background: "linear-gradient(#ffffff, #e8e8e8 48%, #bdbdbd 54%, #ececec)",
        boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.95), 0 0 1px 1px rgba(0, 0, 0, 0.9), 0 0 7px rgba(255, 255, 255, 0.7)",
        color: "#000",
        textShadow: "none",
    },
};

/** Список треков с прокруткой: заголовок и строки-кнопки; onSelect(номер трека) — по клику. */
function createTrackList(onSelect) {
    // заголовок — как подпись на папке
    const heading = el("div", {
        display: "inline-block",
        marginLeft: `${TRACKLIST_PADDING}px`,
        padding: "3px 44px 3px 8px",
        font: `700 18px/1.25 ${FONT}`,
        color: "#fff",
        textShadow: TEXT_HALO,
        background: LABEL_FADE_RIGHT,
    }, {}, ["tracklist"]);
    const list = el("div", {
        display: "flex",
        flexDirection: "column",
        gap: `${TRACK_ROW_GAP}px`,
        marginTop: "4px",
        boxSizing: "border-box",
        padding: `${TRACKLIST_PADDING}px`,
        overflowY: "auto",
        // колесо мыши на краю списка не должно утаскивать страницу
        overscrollBehavior: "contain",
        // полоса прокрутки — тонкая, серебристая на тёмном, как полоса перемотки
        scrollbarWidth: "thin",
        scrollbarColor: "#e2e2e2 rgba(0, 0, 0, 0.55)",
    }, { "aria-label": "Треки" });
    const root = el("div", {}, { "data-part": "tracklist" }, [heading, list]);

    let rows = [];
    let active = -1;

    function paint(row, playing) {
        Object.assign(row.button.style, playing ? TRACK_ROW_LOOK.playing : TRACK_ROW_LOOK.idle);
        row.artist.style.opacity = playing ? "0.7" : "0.8";
        if (playing) {
            row.button.setAttribute("aria-current", "true");
        } else {
            row.button.removeAttribute("aria-current");
        }
    }

    return {
        root,
        /** Высота под столько строк; остальное уйдёт в прокрутку. */
        setVisibleRows(count) {
            list.style.maxHeight = `${count * TRACK_ROW_HEIGHT + (count - 1) * TRACK_ROW_GAP + TRACKLIST_PADDING * 2}px`;
        },
        /** Сколько места по высоте занимает всё, кроме строк. */
        get chromeHeight() {
            return list.offsetTop + TRACKLIST_PADDING * 2;
        },
        setTracks(tracks) {
            rows = tracks.map((track, index) => {
                const title = el("span", {
                    flex: "1",
                    minWidth: "0",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontWeight: "700",
                }, {}, [track.title]);
                const artist = el("span", {
                    flex: "0 1 auto",
                    maxWidth: "45%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontSize: "12px",
                }, {}, [track.artist]);
                const button = el("button", {
                    flex: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    height: `${TRACK_ROW_HEIGHT}px`,
                    boxSizing: "border-box",
                    padding: "0 12px",
                    border: "1px solid #000",
                    borderRadius: "6px",
                    font: `14px ${FONT}`,
                    textAlign: "left",
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                    WebkitTapHighlightColor: "transparent",
                }, { type: "button", title: track.artist ? `${track.title} — ${track.artist}` : track.title, "data-part": "track" }, [title, artist]);
                // список лежит и на тёмном, и на светлом — белое свечение видно на тёмном, ореол строки — на светлом
                addHoverGlow(button, () => "255, 255, 255");
                button.addEventListener("click", () => onSelect(index));
                const row = { button, artist };
                paint(row, index === active);
                return row;
            });
            list.replaceChildren(...rows.map((row) => row.button));
        },
        setActive(index) {
            if (rows[active]) {
                paint(rows[active], false);
            }
            active = index;
            if (rows[active]) {
                paint(rows[active], true);
                // играющий трек всегда на виду; у скрытого списка это ничего не делает
                rows[active].button.scrollIntoView({ block: "nearest" });
            }
        },
    };
}

/**
 * Бегущая строка «PLAY ► название — артист», как надпись видеомагнитофона на фоне.
 * Музыка играет — строка бежит; на паузе стоит на месте и показывает «PAUSE».
 */
function createMarquee() {
    // отступ слева — чтобы стоящая на паузе строка начиналась уже за тающим краем
    const strip = el("div", { display: "flex", width: "max-content", paddingLeft: MARQUEE_FADE, willChange: "transform" });
    const fade = `linear-gradient(to right, transparent, #000 ${MARQUEE_FADE}, #000 calc(100% - ${MARQUEE_FADE}), transparent)`;
    const root = el("div", {
        overflow: "hidden",
        whiteSpace: "nowrap",
        font: `700 1em/1.25 ${POSTER_FONT}`,
        color: "#fff",
        textShadow: "0 0 10px rgba(255, 255, 255, 0.55), 0 1px 3px rgba(0, 0, 0, 0.9)",
        maskImage: fade,
        WebkitMaskImage: fade,
        pointerEvents: "none",
    }, { "data-part": "marquee", "aria-hidden": "true" }, [strip]);

    let text = "";
    let playing = false;
    let run = null;

    function segment() {
        const icon = flatGlyph(playing ? "play" : "pause");
        Object.assign(icon.style, { flex: "none", margin: "0 0.35em 0 0.1em", filter: "drop-shadow(0 0 5px rgba(255, 255, 255, 0.55))" });
        return el("span", {
            display: "inline-flex",
            alignItems: "center",
            paddingRight: "1.6em",
        }, {}, [playing ? "PLAY" : "PAUSE", icon, text]);
    }

    /** Собирает строку заново и пускает её с начала; у скрытой строки нечего мерить — тогда ждём показа. */
    function render() {
        run?.cancel();
        run = null;
        const first = segment();
        strip.replaceChildren(first);
        const length = first.offsetWidth;
        if (length === 0 || !playing) {
            return;
        }
        // столько копий, чтобы строка закрывала окно и в самом конце сдвига
        for (let filled = length; filled < root.clientWidth + length; filled += length) {
            strip.append(segment());
        }
        run = strip.animate(
            [{ transform: "translateX(0)" }, { transform: `translateX(${-length}px)` }],
            { duration: length / MARQUEE_SPEED * 1000, iterations: Infinity },
        );
    }

    return {
        root,
        render,
        setText(next) {
            text = next;
            render();
        },
        setPlaying(next) {
            playing = next;
            render();
        },
    };
}

// Две раскладки панели.
// Компьютер — как Spotify: название слева, кнопки и широкая полоса по центру, громкость справа.
// Телефон — как плеер на айфоне: название по центру, под ним полоса трека, ниже крупные кнопки; углы круглее.
const LAYOUTS = {
    wide: {
        tray: {
            padding: "12px 16px",
            borderRadius: "10px",
            gridTemplateColumns: "minmax(130px, 1fr) minmax(300px, 2.4fr) minmax(130px, 1fr)",
            gridTemplateAreas: '"info controls volume" "info progress volume"',
            gap: "4px 16px",
        },
        coverRadius: "12px",
        info: { alignItems: "flex-start" },
        title: { fontSize: "15px", height: "25px", lineHeight: "19px", padding: "3px 14px 3px 7px", background: LABEL_FADE_RIGHT },
        artist: { fontSize: "12px", height: "15px", lineHeight: "15px", marginTop: "6px", padding: "0 7px" },
        times: { fontSize: "11px", minWidth: "38px" },
        controls: { justifyContent: "center", gap: "10px" },
        sizes: { orb: 46, play: 50, skipIcon: 24, skip: 36, toggleIcon: 22, toggle: 34 },
        bar: { thickness: 5, height: 18, knob: true },
        remainingTime: false,
    },
    narrow: {
        tray: {
            padding: "16px 16px 12px",
            borderRadius: "22px",
            gridTemplateColumns: "minmax(0, 1fr)",
            gridTemplateAreas: '"info" "progress" "controls"',
            gap: "12px 0px",
        },
        coverRadius: "18px",
        info: { alignItems: "center" },
        title: { fontSize: "17px", height: "27px", lineHeight: "21px", padding: "3px 26px", background: LABEL_FADE_BOTH },
        artist: { fontSize: "14px", height: "17px", lineHeight: "17px", marginTop: "4px", padding: "0 8px" },
        times: { fontSize: "12px", minWidth: "44px" },
        // кнопки поровну по всей ширине: shuffle и repeat у краёв (там, где у айфона наушники),
        // и на узком телефоне ничего не вылезает за панель
        controls: { justifyContent: "space-between", gap: "0px" },
        sizes: { orb: 56, play: 60, skipIcon: 30, skip: 44, toggleIcon: 24, toggle: 38 },
        // полоса толще и без ползунка, как у айфона; область под палец повыше
        bar: { thickness: 7, height: 26, knob: false },
        remainingTime: true,
    },
};

function setBox(node, size) {
    node.style.width = `${size}px`;
    node.style.height = `${size}px`;
}

function between(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function setIconSize(svgNode, size) {
    svgNode.setAttribute("width", String(size));
    svgNode.setAttribute("height", String(size));
}

/**
 * Строит плеер внутри root — закрытым: его открывает setOpen(true).
 * Плеер занимает место внутри отступов root (сверху там оставлено место под папки).
 * handlers: onPlayPause, onPrevious, onNext, onShuffle, onRepeat, onSeek(seconds),
 * onVolume(level 0…1, final — ползунок отпустили), onMute, onSelect(номер трека в списке).
 * volumeControl: false — регулятор громкости не показываем (на iPhone громкость меняют только кнопками).
 * Возвращает setOpen и методы show*, которыми логика плеера обновляет экран.
 */
export function createPlayerUI(root, handlers, { volumeControl = true } = {}) {
    const placeholder = drawPlaceholderCover();

    // обложка — отдельная квадратная карточка над плеером, ничем не перекрыта
    const cover = el("img", {
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "cover",
    }, { alt: "", "data-part": "cover" });
    const coverCard = el("div", {
        position: "relative",
        // рамка входит в ширину, иначе карточка шире расчётной на 2px
        boxSizing: "border-box",
        overflow: "hidden",
        borderRadius: "12px",
        border: "1px solid rgba(0, 0, 0, 0.71)",
        background: "#000",
        boxShadow: "0 0 10px 5px rgba(0, 0, 0, 0.5)",
        pointerEvents: "auto",
    }, { "data-part": "cover-card" }, [cover]);

    // размеры шрифта, отступы и подложка зависят от раскладки — см. LAYOUTS
    const title = el("div", {
        maxWidth: "100%",
        boxSizing: "border-box",
        color: "#fff",
        fontWeight: "700",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        textShadow: "0 1px 2px rgba(0, 0, 0, 0.9)",
    }, { "data-part": "title" });
    const artist = el("div", {
        maxWidth: "100%",
        boxSizing: "border-box",
        color: "#f2f2f2",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        textShadow: TEXT_HALO,
    }, { "data-part": "artist" });
    const info = el("div", {
        gridArea: "info",
        minWidth: "0",
        display: "flex",
        flexDirection: "column",
    }, {}, [title, artist]);

    const shuffleIcon = glyph("shuffle", 22);
    const shuffle = toggleButton("Перемешать", "shuffle", shuffleIcon);
    const previousIcon = glyph("previous", 24);
    const previous = iconButton("Предыдущий трек", "previous", previousIcon, 36);
    const orb = glossyOrb(46);
    const play = iconButton("Играть", "play", orb.root, 50);
    const nextIcon = glyph("next", 24);
    const next = iconButton("Следующий трек", "next", nextIcon, 36);
    const repeatIcon = glyph("repeat", 22);
    const repeatOne = repeatOneMark();
    repeatIcon.append(repeatOne);
    const repeat = toggleButton(REPEAT_LABELS.off, "repeat", repeatIcon);
    const controls = el("div", {
        gridArea: "controls",
        display: "flex",
        alignItems: "center",
    }, {}, [shuffle.button, previous, play, next, repeat.button]);

    const timeStyle = {
        color: "#fff",
        textShadow: TEXT_HALO,
        fontVariantNumeric: "tabular-nums",
    };
    const currentTime = el("span", timeStyle, { "data-part": "time-current" }, ["0:00"]);
    const totalTime = el("span", timeStyle, { "data-part": "time-total" }, ["0:00"]);
    let duration = 0;
    let lastTime = 0;
    // на телефоне справа — сколько осталось («−2:01»), как у айфона; на компьютере — длина трека
    let showRemaining = false;
    function renderTimes(time) {
        currentTime.textContent = formatTime(time);
        totalTime.textContent = showRemaining ? `−${formatTime(Math.max(0, duration - time))}` : formatTime(duration);
    }
    const progress = createSlider({
        label: "Перемотка",
        part: "progress",
        knobSize: 13,
        keyStep: () => (duration ? SEEK_STEP_SECONDS / duration : 0),
        // пока тянешь — время показывает, куда перемотаем; сама перемотка — когда отпустил
        onDrag: (fraction) => renderTimes(fraction * duration),
        onCommit: (fraction) => handlers.onSeek(fraction * duration),
    });
    const progressRow = el("div", {
        gridArea: "progress",
        display: "flex",
        alignItems: "center",
        gap: "8px",
    }, {}, [currentTime, progress.root, totalTime]);

    // громкость справа: значок динамика (клик — выключить/включить звук) и ползунок
    const volumeIcons = {
        high: glyph("volumeHigh", 22),
        low: glyph("volumeLow", 22),
        mute: glyph("volumeMute", 22),
    };
    const muteButton = iconButton("Выключить звук", "mute", el("span", { display: "grid" }, {}, Object.values(volumeIcons)), 32);
    const volume = createSlider({
        label: "Громкость",
        part: "volume",
        knobSize: 11,
        keyStep: () => VOLUME_STEP,
        // громкость меняется сразу, пока тянешь; запоминается — когда отпустил
        onDrag: (level) => handlers.onVolume(level, false),
        onCommit: (level) => handlers.onVolume(level, true),
    });
    const volumeRow = el("div", {
        gridArea: "volume",
        justifySelf: "end",
        width: "100%",
        maxWidth: "150px",
        alignItems: "center",
        gap: "6px",
    }, { "data-part": "volume-row" }, [muteButton, volume.root]);

    // стеклянная панель — значения как у .tray на monotonousreign (оттуда же css.glass)
    const tray = el("div", {
        position: "relative",
        boxSizing: "border-box",
        display: "grid",
        alignItems: "center",
        background: "rgba(252, 250, 250, 0.09)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        border: "1px solid rgba(0, 0, 0, 0.71)",
        boxShadow: "0 0 10px 5px rgba(0, 0, 0, 0.5), inset 0 -10px 10px rgba(255, 255, 255, 0.5), inset 0 2px 12px rgba(255, 255, 255, 0.5)",
        pointerEvents: "auto",
    }, { "data-part": "tray" }, [info, controls, progressRow, volumeRow]);

    const trackList = createTrackList((index) => handlers.onSelect(index));
    trackList.root.style.pointerEvents = "auto";
    const marquee = createMarquee();

    // Всё окно плеера. Столбиком — обложка и панель под ней; на весь экран — слой, где каждая часть стоит на своём месте.
    const column = el("div", {
        display: "none",
        opacity: "0",
        flexDirection: "column",
        alignItems: "center",
        gap: `${BLOCK_GAP}px`,
    }, { "data-part": "player" }, [trackList.root, coverCard, marquee.root, tray]);

    root.append(column);
    let open = false;

    function setTrayLayout(wide) {
        const look = wide ? LAYOUTS.wide : LAYOUTS.narrow;
        Object.assign(tray.style, look.tray);
        coverCard.style.borderRadius = look.coverRadius;
        Object.assign(info.style, look.info);
        Object.assign(title.style, look.title);
        Object.assign(artist.style, look.artist);
        // время прижато к полосе на компьютере и к краям панели на телефоне
        Object.assign(currentTime.style, look.times, { textAlign: wide ? "right" : "left" });
        Object.assign(totalTime.style, look.times, { textAlign: wide ? "left" : "right" });
        Object.assign(controls.style, look.controls);

        const { sizes } = look;
        setBox(play, sizes.play);
        setIconSize(orb.root, sizes.orb);
        for (const [button, icon] of [[previous, previousIcon], [next, nextIcon]]) {
            setBox(button, sizes.skip);
            setIconSize(icon, sizes.skipIcon);
        }
        for (const [button, icon] of [[shuffle.button, shuffleIcon], [repeat.button, repeatIcon]]) {
            setBox(button, sizes.toggle);
            setIconSize(icon, sizes.toggleIcon);
        }
        progress.setLook(look.bar);
        showRemaining = look.remainingTime;
        renderTimes(lastTime);
        // на телефоне громкость — кнопками сбоку, как у Spotify и Apple Music
        volumeRow.style.display = wide && volumeControl ? "flex" : "none";
    }

    function layout() {
        // скрытый плеер не измерить (высота панели — ноль); пересчитаем, когда откроют
        if (!open) {
            return;
        }
        // root оставляет отступы: по бокам и снизу — поля страницы, сверху — ещё и место под папки
        const style = getComputedStyle(root);
        const pad = {
            top: parseFloat(style.paddingTop),
            right: parseFloat(style.paddingRight),
            bottom: parseFloat(style.paddingBottom),
            left: parseFloat(style.paddingLeft),
        };
        if (window.innerWidth >= FULL_MIN_WIDTH && window.innerHeight >= FULL_MIN_HEIGHT) {
            layoutFull(pad);
        } else {
            layoutColumn(pad);
        }
    }

    /** Маленький экран: обложка и панель под ней, столбиком по центру. Списка и бегущей строки нет. */
    function layoutColumn(pad) {
        Object.assign(column.style, { position: "static", inset: "auto", display: "flex", pointerEvents: "auto" });
        trackList.root.style.display = "none";
        marquee.root.style.display = "none";
        Object.assign(coverCard.style, { position: "relative", left: "auto", top: "auto" });
        Object.assign(tray.style, { position: "relative", left: "auto", bottom: "auto" });

        const trayWidth = Math.min(TRAY_MAX_WIDTH, window.innerWidth - pad.left - pad.right);
        setTrayLayout(trayWidth >= WIDE_TRAY_MIN_WIDTH);
        tray.style.width = `${trayWidth}px`;
        // обложка — сколько влезает над плеером по высоте экрана, но не шире плеера
        const freeHeight = window.innerHeight - pad.top - pad.bottom - BLOCK_GAP - tray.offsetHeight;
        // совсем маленький экран — пусть лучше прокручивается, чем обложка станет с марку
        const coverSize = Math.max(COVER_MIN_SIZE, Math.floor(Math.min(COVER_MAX_SIZE, trayWidth, freeHeight)));
        setBox(coverCard, coverSize);
        // плеер стоит по центру экрана; если так он залез бы на папки — начинается сразу под ними
        const height = coverSize + BLOCK_GAP + tray.offsetHeight;
        column.style.marginTop = `${Math.max(0, (window.innerHeight - height) / 2 - pad.top)}px`;
    }

    /** Большой экран: плеер на весь экран — части стоят поверх фона каждая на своём месте, между ними виден фон. */
    function layoutFull(pad) {
        const { innerWidth: width, innerHeight: height } = window;
        // сам слой мышь не ловит: сквозь пустые места можно нажимать на папки
        Object.assign(column.style, { position: "fixed", inset: "0", display: "block", pointerEvents: "none", marginTop: "0" });

        // панель с кнопками — внизу во всю ширину; её середина не шире обычной панели,
        // иначе полоса перемотки растянулась бы на весь экран
        setTrayLayout(true);
        Object.assign(tray.style, {
            position: "absolute",
            left: `${pad.left}px`,
            bottom: `${pad.bottom}px`,
            width: `${width - pad.left - pad.right}px`,
            gridTemplateColumns: `minmax(0, 1fr) minmax(300px, ${TRAY_MAX_WIDTH}px) minmax(0, 1fr)`,
        });
        const barTop = height - pad.bottom - tray.offsetHeight;

        // обложка — по центру, между папками и панелью
        const coverSize = Math.max(COVER_MIN_SIZE, Math.floor(Math.min(FULL_COVER_MAX_SIZE, barTop - pad.top - BLOCK_GAP * 2)));
        const coverLeft = (width - coverSize) / 2;
        const coverTop = between(height * FULL_COVER_CENTER_Y - coverSize / 2, pad.top, barTop - BLOCK_GAP - coverSize);
        setBox(coverCard, coverSize);
        Object.assign(coverCard.style, { position: "absolute", left: `${coverLeft}px`, top: `${coverTop}px` });

        // список треков — слева, начинается выше обложки; строк — сколько влезает до панели, но не больше предела
        const listLeft = Math.max(pad.left, width * TRACKLIST_LEFT);
        const listTop = height * TRACKLIST_TOP;
        Object.assign(trackList.root.style, {
            display: "block",
            position: "absolute",
            left: `${listLeft}px`,
            top: `${listTop}px`,
            width: `${Math.min(TRACKLIST_MAX_WIDTH, width * TRACKLIST_WIDTH, coverLeft - SIDE_GAP - listLeft)}px`,
        });
        const room = barTop - BLOCK_GAP - listTop - trackList.chromeHeight;
        const rows = Math.floor((room + TRACK_ROW_GAP) / (TRACK_ROW_HEIGHT + TRACK_ROW_GAP));
        trackList.setVisibleRows(between(rows, 1, TRACKLIST_MAX_ROWS));

        // бегущая строка — правее обложки, серединой на её верхнем крае, но не выше полосы папок
        const marqueeLeft = coverLeft + coverSize + SIDE_GAP;
        const fontSize = between(width * 0.022, 24, 56);
        Object.assign(marquee.root.style, {
            display: "block",
            position: "absolute",
            left: `${marqueeLeft}px`,
            top: `${Math.max(pad.top, coverTop - fontSize * 0.625)}px`,
            width: `${Math.min(width * MARQUEE_WIDTH, width - pad.right - marqueeLeft)}px`,
            fontSize: `${fontSize}px`,
        });
        // ширина окна строки могла измениться — пересобираем
        marquee.render();
    }
    window.addEventListener("resize", layout);

    function setOpen(nowOpen) {
        if (nowOpen === open) {
            return;
        }
        open = nowOpen;
        // клик посреди анимации: продолжаем с той прозрачности, на которой её застали
        const from = getComputedStyle(column).opacity;
        column.getAnimations().forEach((animation) => animation.cancel());
        column.style.opacity = open ? "1" : "0";
        if (open) {
            column.style.display = "flex";
            layout();
        }
        column.animate([{ opacity: from }, { opacity: column.style.opacity }], { duration: WINDOW_FADE_MS, easing: "ease-in-out" })
            .finished.then(() => {
                // убираем из потока, иначе на маленьком экране страница прокручивалась бы над пустым местом
                if (!open) {
                    column.style.display = "none";
                }
            }, () => {
                // анимацию отменил следующий клик — он и доведёт дело до конца
            });
    }

    function setText(node, text) {
        node.textContent = text;
        // полное имя во всплывающей подсказке, если строка обрезана многоточием
        node.title = text;
    }

    function setCover(url) {
        cover.src = url ?? placeholder;
    }
    cover.addEventListener("error", () => {
        // .jpg есть в списке API, но не грузится — ставим заглушку (проверка спасает от цикла)
        if (cover.src !== placeholder) {
            cover.src = placeholder;
        }
    });

    function setRepeatMode(mode) {
        repeat.setActive(mode !== "off");
        repeatOne.style.display = mode === "one" ? "" : "none";
        repeat.button.setAttribute("aria-label", REPEAT_LABELS[mode]);
    }

    play.addEventListener("click", () => handlers.onPlayPause());
    previous.addEventListener("click", () => handlers.onPrevious());
    next.addEventListener("click", () => handlers.onNext());
    shuffle.button.addEventListener("click", () => handlers.onShuffle());
    repeat.button.addEventListener("click", () => handlers.onRepeat());
    muteButton.addEventListener("click", () => handlers.onMute());

    const ui = {
        /** Показать или спрятать окно плеера; музыка при закрытом окне продолжает играть. */
        setOpen,
        /** Заполняет список треков; порядок строк — номера, которые потом приходят в onSelect и showTrack. */
        showTracks(tracks) {
            trackList.setTracks(tracks);
        },
        /** track — что играет, index — его номер в списке. */
        showTrack(track, index) {
            setText(title, track.title);
            setText(artist, track.artist);
            setCover(track.cover);
            trackList.setActive(index);
            marquee.setText(track.artist ? `${track.title} — ${track.artist}` : track.title);
            ui.showTime(0, NaN);
        },
        showStatus(headline, detail) {
            setText(title, headline);
            setText(artist, detail);
        },
        showDetail(text) {
            setText(artist, text);
        },
        showPlaying(isPlaying) {
            orb.setPlaying(isPlaying);
            play.setAttribute("aria-label", isPlaying ? "Пауза" : "Играть");
            marquee.setPlaying(isPlaying);
        },
        showTime(time, newDuration) {
            duration = Number.isFinite(newDuration) ? newDuration : 0;
            lastTime = time;
            progress.set(duration ? time / duration : 0, {
                enabled: duration > 0,
                now: Math.floor(time),
                max: Math.floor(duration),
                text: `${formatTime(time)} из ${formatTime(duration)}`,
            });
            if (!progress.dragging) {
                renderTimes(time);
            }
        },
        showVolume(level, muted) {
            const audible = muted ? 0 : level;
            const percent = Math.round(audible * 100);
            volume.set(audible, { enabled: true, now: percent, max: 100, text: `${percent}%` });
            const icon = audible === 0 ? "mute" : audible < 0.5 ? "low" : "high";
            for (const [name, node] of Object.entries(volumeIcons)) {
                node.style.display = name === icon ? "" : "none";
            }
            muteButton.setAttribute("aria-label", audible === 0 ? "Включить звук" : "Выключить звук");
        },
        showShuffle(on) {
            shuffle.setActive(on);
        },
        showRepeat(mode) {
            setRepeatMode(mode);
        },
    };

    setCover(null);
    ui.showPlaying(false);
    ui.showShuffle(false);
    ui.showRepeat("off");
    ui.showVolume(1, false);
    return ui;
}
