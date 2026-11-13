import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { G, LAB, add, curvePoints } from "../curve.js";
import { additionSteps, inverseStep, inverseSteps, multipleSteps, spot } from "../ec-steps.js";

describe("разбор суммы — как в тетради лабы 9", () => {
    it("2G: (3 · 10² − 1) / (2 · 8) = 299 / 16 ≡ 9 / 16, 16⁻¹ ≡ 20, λ ≡ 6, (16; 14)", () => {
        assert.deepEqual(additionSteps(LAB, G, G), [
            { formula: "λ = (3x₁² + a) / 2y₁", work: "= (3 · 10² − 1) / (2 · 8) = 299 / 16 ≡ 9 / 16" },
            { formula: "16⁻¹", answer: "20", note: "потому что 16 · 20 = 320 = 11 · 29 + 1" },
            { formula: "λ ≡ 9 · 16⁻¹", work: "= 9 · 20 = 180", answer: "6" },
            { formula: "x₃ ≡ λ² − 2x₁", work: "= 36 − 20", answer: "16" },
            { formula: "y₃ ≡ λ(x₁ − x₃) − y₁", work: "= 6(10 − 16) − 8 = −44", answer: "14" },
            { formula: "2P", answer: "(16; 14)", sign: "=" },
        ]);
    });

    it("6G = 4G + 2G: минусы сокращаются, 8 / 5, λ ≡ 48 ≡ 19", () => {
        assert.deepEqual(additionSteps(LAB, { x: 21, y: 22 }, { x: 16, y: 14 }), [
            { formula: "λ = (y₂ − y₁) / (x₂ − x₁)", work: "= (14 − 22) / (16 − 21) = −8 / −5 = 8 / 5" },
            { formula: "5⁻¹", answer: "6", note: "потому что 5 · 6 = 30 = 1 · 29 + 1" },
            { formula: "λ ≡ 8 · 5⁻¹", work: "= 8 · 6 = 48", answer: "19" },
            { formula: "x₃ ≡ λ² − x₁ − x₂", work: "= 361 − 21 − 16 = 324", answer: "5" },
            { formula: "y₃ ≡ λ(x₁ − x₃) − y₁", work: "= 19(21 − 5) − 22 = 282", answer: "21" },
            { formula: "P + Q", answer: "(5; 21)", sign: "=" },
        ]);
    });

    it("7G = 6G + G: отрицательный числитель остаётся, как в тетради: −13 · 6 = −78 ≡ 9", () => {
        const steps = additionSteps(LAB, { x: 5, y: 21 }, G);
        assert.equal(steps[0].work, "= (8 − 21) / (10 − 5) = −13 / 5");
        assert.deepEqual(steps[2], { formula: "λ ≡ −13 · 5⁻¹", work: "= (−13) · 6 = −78", answer: "9" });
        assert.equal(steps.at(-1)?.answer, "(8; 10)");
    });

    it("ответ разбора совпадает со сложением для всех пар точек кривой", () => {
        const points = curvePoints(LAB);
        for (const P of points) {
            for (const Q of points) {
                assert.equal(additionSteps(LAB, P, Q).at(-1)?.answer, spot(add(LAB, P, Q)), `${spot(P)} + ${spot(Q)}`);
            }
        }
    });

    it("вертикаль: P + (−P) и удвоение точки с y = 0 дают O", () => {
        assert.equal(additionSteps(LAB, G, { x: 10, y: 21 }).at(-1)?.answer, "O");
        assert.equal(additionSteps(LAB, { x: 25, y: 0 }, { x: 25, y: 0 }).at(-1)?.answer, "O");
    });

    it("обратное: 1 · 1 = 1 без «0 · p»", () => {
        assert.deepEqual(inverseStep(1, 29), { formula: "1⁻¹", answer: "1", note: "потому что 1 · 1 = 1" });
    });

    it("−P и все кратные", () => {
        assert.deepEqual(inverseSteps(LAB, G)[0], {
            formula: "−P",
            work: "= (10; −8) = (10; 29 − 8)",
            answer: "(10; 21)",
            sign: "=",
        });
        const multiples = multipleSteps(LAB, { x: 5, y: 21 });
        assert.equal(multiples.length, 5);
        assert.equal(multiples.at(-1)?.answer, "O");
        assert.equal(multiples[1].work, "= P + P");
        assert.equal(multiples[2].work, "= 2P + P");
    });
});
