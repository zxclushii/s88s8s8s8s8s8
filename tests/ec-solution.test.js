import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sameAnswer } from "../ec-solution.js";

describe("проверка ответа в упражнении", () => {
    it("точку можно записать по-разному", () => {
        for (const typed of ["(16; 14)", "16;14", "16 14", "(16, 14)", " ( 16 ; 14 ) "]) {
            assert.equal(sameAnswer(typed, "(16; 14)"), true, typed);
        }
        assert.equal(sameAnswer("(14; 16)", "(16; 14)"), false);
        assert.equal(sameAnswer("16", "(16; 14)"), false);
        assert.equal(sameAnswer("16 abc 14", "(16; 14)"), false);
    });

    it("O — как O, русская о, 0 или ∞", () => {
        for (const typed of ["O", "o", "о", "0", "∞", "(O)"]) {
            assert.equal(sameAnswer(typed, "O"), true, typed);
        }
        assert.equal(sameAnswer("1", "O"), false);
    });

    it("число — только сам остаток; минус любой", () => {
        assert.equal(sameAnswer("25", "25"), true);
        assert.equal(sameAnswer(" 25 ", "25"), true);
        assert.equal(sameAnswer("−3", "26"), false);
        assert.equal(sameAnswer("−3", "−3"), true);
        assert.equal(sameAnswer("", "25"), false);
    });
});
