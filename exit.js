// @ts-check
// exit в cmd закрывает окно, а здесь на весь экран красным переспрашивает — и медленно гаснет.

// сколько надпись живёт вместе с угасанием; сама анимация — в css/site.css (exit-fade)
const SHOW_MS = 3600;

/** Показывает надпись поверх всего; повторный exit начинает её заново. */
export function showExit() {
    document.querySelector(".exit-scare")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "exit-scare";
    // скринридер тоже должен услышать, о чём его переспросили
    overlay.setAttribute("role", "alert");
    const question = document.createElement("p");
    question.className = "exit-big";
    question.textContent = "exit?";
    const really = document.createElement("p");
    really.className = "exit-small";
    really.textContent = "are you seriously?";
    overlay.append(question, really);
    document.body.append(overlay);
    window.setTimeout(() => overlay.remove(), SHOW_MS);
}
