"use client";

import { useEffect, useMemo, useRef } from "react";
import rough from "roughjs";

type ReceiptStackMeterProps = {
  totalBudget: number;
  currentSpent: number;
  onTotalBudgetChange: (value: number) => void;
  onCurrentSpentChange: (value: number) => void;
};

const MAX_RECEIPTS = 16;
const SVG_HEIGHT = 340;
const STACK_BOTTOM = 315;
const STACK_CAPACITY = 270;

function parseAmount(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

export function ReceiptStackMeter({
  totalBudget,
  currentSpent,
  onTotalBudgetChange,
  onCurrentSpentChange,
}: ReceiptStackMeterProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const percentage = useMemo(
    () => Math.min(totalBudget > 0 ? (currentSpent / totalBudget) * 100 : 0, 100),
    [currentSpent, totalBudget],
  );
  const receiptCount = currentSpent > 0 ? Math.max(1, Math.round((percentage / 100) * MAX_RECEIPTS)) : 0;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    svg.replaceChildren();
    const rc = rough.svg(svg, {
      options: {
        roughness: 1.35,
        bowing: 1.2,
        stroke: "#292926",
        strokeWidth: 1.7,
      },
    });
    const drawing = document.createElementNS("http://www.w3.org/2000/svg", "g");

    drawing.appendChild(
      rc.line(32, STACK_BOTTOM + 7, 208, STACK_BOTTOM + 7, {
        seed: 91,
        stroke: "#615e57",
        strokeWidth: 1.6,
      }),
    );

    if (receiptCount > 0) {
      const stackHeight = STACK_CAPACITY * (percentage / 100);
      const step = receiptCount > 1 ? stackHeight / (receiptCount - 1) : 0;

      for (let index = 0; index < receiptCount; index += 1) {
        const y = STACK_BOTTOM - 18 - index * step;
        const horizontalJitter = ((index * 7) % 9) - 4;
        const tilt = ((index % 5) - 2) * 1.4;
        const x = 58 + horizontalJitter;
        const width = 126 + ((index * 3) % 8);
        const height = 25;

        const receipt = rc.polygon(
          [
            [x + 4, y + tilt],
            [x + width - 4, y - tilt],
            [x + width, y + height - 2 + tilt],
            [x, y + height + 1 - tilt],
          ],
          {
            seed: 120 + index,
            stroke: "#292926",
            strokeWidth: 1.45,
            fill: "#ef866f",
            fillStyle: "hachure",
            fillWeight: 1.15,
            hachureAngle: -42 + (index % 3) * 3,
            hachureGap: 4.2,
            roughness: 1.25,
            bowing: 1.1,
          },
        );
        drawing.appendChild(receipt);

        drawing.appendChild(
          rc.line(x + 18, y + 8, x + width - 28, y + 7 - tilt, {
            seed: 220 + index,
            stroke: "#6b665e",
            strokeWidth: 0.8,
            roughness: 0.8,
          }),
        );
      }
    }

    svg.appendChild(drawing);
  }, [percentage, receiptCount]);

  return (
    <section className="receipt-stack-card" aria-label="Overall monthly spending meter">
      <div className="receipt-title">Receipt Stack Meter</div>

      <div className="receipt-visual">
        <div className="receipt-axis" aria-hidden="true">
          <span className="axis-cap axis-cap-top" />
          <span className="axis-cap axis-cap-bottom" />
        </div>

        <label className="receipt-budget-input">
          <span className="sr-only">Total monthly budget</span>
          <span aria-hidden="true">$</span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={totalBudget}
            onChange={(event) => onTotalBudgetChange(parseAmount(event.target.value))}
          />
        </label>
        <span className="receipt-zero" aria-hidden="true">$0</span>

        <svg
          ref={svgRef}
          className="receipt-stack-svg"
          viewBox={`0 0 240 ${SVG_HEIGHT}`}
          role="img"
          aria-label={`${Math.round(percentage)}% of the monthly budget spent, represented by ${receiptCount} receipts`}
        />

        <div className="receipt-summary">
          <label className="receipt-spent-input">
            <span aria-hidden="true">$</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={currentSpent}
              onChange={(event) => onCurrentSpentChange(parseAmount(event.target.value))}
              aria-label="Current monthly spending"
            />
          </label>
          <span className="spent-underline" aria-hidden="true" />
          <p>spent this month</p>
          <strong>{Math.round(percentage)}% of budget</strong>
        </div>
      </div>
    </section>
  );
}
