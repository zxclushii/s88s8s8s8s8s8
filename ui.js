// Внешний вид плеера — всё строится и рисуется из JS.
// Обложка — отдельная карточка, под ней независимый плеер (раскладка как у Spotify),
// стеклянная панель и чёрный глянец — как на monotonousreign.neocities.org (7.css, Aero).
// Страницу вокруг (фон, папки) строит desktop.js; плеер — окно, которое открывает папка.

import { glossyGlyph, glossyOrb, repeatOneMark } from "./gloss.js";

// Noto Sans Mono — латиница и кириллица, M PLUS 1 Code — японский; MS Gothic как у того сайта — запасной.
export const FONT = '"Noto Sans Mono", "M PLUS 1 Code", "MS Gothic", monospace';
// Белый текст на стекле читается на любой обложке благодаря тёмному ореолу.
// (Жёсткая обводка 1px, как у подписей на monotonousreign, на мелком тонком шрифте выглядит полой.)
export const TEXT_HALO = "0 0 3px rgba(0, 0, 0, 0.95), 0 1px 1px #000";
// Обложка квадратная, по центру над плеером; плеер шире неё.
const COVER_MAX_SIZE = 480;
const COVER_MIN_SIZE = 220;
const TRAY_MAX_WIDTH = 720;
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

function setIconSize(svgNode, size) {
    svgNode.setAttribute("width", String(size));
    svgNode.setAttribute("height", String(size));
}

/**
 * Строит плеер внутри root — закрытым: его открывает setOpen(true).
 * Плеер занимает место внутри отступов root (сверху там оставлено место под папки).
 * handlers: onPlayPause, onPrevious, onNext, onShuffle, onRepeat, onSeek(seconds),
 * onVolume(level 0…1, final — ползунок отпустили), onMute.
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
    }, { "data-part": "tray" }, [info, controls, progressRow, volumeRow]);

    // два независимых блока: обложка сверху, плеер под ней
    const column = el("div", {
        display: "none",
        opacity: "0",
        flexDirection: "column",
        alignItems: "center",
        gap: `${BLOCK_GAP}px`,
    }, { "data-part": "player" }, [coverCard, tray]);

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
        const pad = getComputedStyle(root);
        const top = parseFloat(pad.paddingTop);
        const trayWidth = Math.min(TRAY_MAX_WIDTH, window.innerWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight));
        setTrayLayout(trayWidth >= WIDE_TRAY_MIN_WIDTH);
        tray.style.width = `${trayWidth}px`;
        // обложка — сколько влезает над плеером по высоте экрана, но не шире плеера
        const freeHeight = window.innerHeight - top - parseFloat(pad.paddingBottom) - BLOCK_GAP - tray.offsetHeight;
        // совсем маленький экран — пусть лучше прокручивается, чем обложка станет с марку
        const coverSize = Math.max(COVER_MIN_SIZE, Math.floor(Math.min(COVER_MAX_SIZE, trayWidth, freeHeight)));
        coverCard.style.width = `${coverSize}px`;
        coverCard.style.height = `${coverSize}px`;
        // плеер стоит по центру экрана; если так он залез бы на папки — начинается сразу под ними
        const height = coverSize + BLOCK_GAP + tray.offsetHeight;
        column.style.marginTop = `${Math.max(0, (window.innerHeight - height) / 2 - top)}px`;
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
        showTrack(track) {
            setText(title, track.title);
            setText(artist, track.artist);
            setCover(track.cover);
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
