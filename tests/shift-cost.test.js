import { describe, it, expect } from "vitest";
import {
  calculateShiftCost,
  calculateRosterCost,
} from "../src/lib/shift-cost.js";
import {
  calculateWageAllowanceCost,
  calculateExpenseAllowanceCost,
} from "../src/lib/allowance-cost.js";

const classification = {
  baseRate: 1040.7,
  baseRateType: "Weekly",
  calculatedRate: 29.73,
  calculatedRateType: "Hourly",
};

const penalties = [
  { penaltyDescription: "Ordinary hours", penaltyCalculatedValue: 29.73 },
  { penaltyDescription: "Saturday - First 4 hours", penaltyCalculatedValue: 44.6 },
  { penaltyDescription: "Saturday - After 4 hours", penaltyCalculatedValue: 59.46 },
  { penaltyDescription: "Sunday", penaltyCalculatedValue: 59.46 },
  { penaltyDescription: "Public holiday", penaltyCalculatedValue: 89.19 },
];

describe("calculateShiftCost", () => {
  it("returns error when required params missing", () => {
    const r = calculateShiftCost({});
    expect(r.error).toBeDefined();
    expect(r.segments).toHaveLength(0);
    expect(r.totalCost).toBe(0);
  });

  it("returns error for zero/negative duration", () => {
    const r = calculateShiftCost({
      date: "2025-07-12",
      startTime: "09:00",
      durationHours: 0,
      classification,
      penalties,
    });
    expect(r.error).toBeDefined();
    expect(r.segments).toHaveLength(0);
    expect(r.totalCost).toBe(0);
  });

  it("calculates simple weekday shift (ordinary hours only)", () => {
    const r = calculateShiftCost({
      date: "2025-07-14",
      startTime: "09:00",
      durationHours: 8,
      breakMinutes: 30,
      classification,
      penalties,
    });
    expect(r.totalHours).toBeCloseTo(7.5, 2);
    expect(r.segments.length).toBeGreaterThanOrEqual(1);
    const ordinary = r.segments.find((s) => s.description.includes("Ordinary"));
    expect(ordinary).toBeDefined();
    expect(ordinary.ratePerHour).toBeCloseTo(29.73, 2);
    expect(r.totalCost).toBeCloseTo(7.5 * 29.73, 1);
  });

  it("splits Saturday shift into first 4 and after 4 hours", () => {
    const r = calculateShiftCost({
      date: "2025-07-12",
      startTime: "12:00",
      durationHours: 8,
      breakMinutes: 0,
      classification,
      penalties,
    });
    expect(r.totalHours).toBe(8);
    const ordinaryOnly = 8 * 29.73;
    expect(r.totalCost).toBeGreaterThan(ordinaryOnly);
    expect(r.segments.length).toBeGreaterThanOrEqual(1);
  });

  it("calculates Sunday shift at Sunday rate", () => {
    const r = calculateShiftCost({
      date: "2025-07-13",
      startTime: "10:00",
      durationHours: 6,
      classification,
      penalties,
    });
    expect(r.totalHours).toBe(6);
    const sun = r.segments.find((s) => s.description.includes("Sunday"));
    expect(sun).toBeDefined();
    expect(sun.ratePerHour).toBeCloseTo(59.46, 1);
    expect(r.totalCost).toBeCloseTo(6 * 59.46, 0);
  });

  it("deducts break from paid hours", () => {
    const r = calculateShiftCost({
      date: "2025-07-14",
      startTime: "09:00",
      durationHours: 8,
      breakMinutes: 60,
      classification,
      penalties,
    });
    expect(r.totalHours).toBe(7);
    expect(r.totalCost).toBeCloseTo(7 * 29.73, 0);
  });

  it("supports multi-day shift (Sat 9am to Sun 2am = 17 hours)", () => {
    const r = calculateShiftCost({
      date: "2025-07-12",
      startTime: "09:00",
      durationHours: 17,
      breakMinutes: 0,
      classification,
      penalties,
    });
    expect(r.totalHours).toBe(17);
    expect(r.segments.length).toBeGreaterThanOrEqual(1);
    const ordinaryOnly = 17 * 29.73;
    expect(r.totalCost).toBeGreaterThan(ordinaryOnly);
  });

  it("includes wage allowances in total cost", () => {
    const wageAllowance = {
      allowance: "Confined spaces allowance",
      rate: 0.08,
      rateUnit: "Percent",
      paymentFrequency: "per hour",
    };
    const r = calculateShiftCost({
      date: "2025-07-14",
      startTime: "09:00",
      durationHours: 8,
      classification,
      penalties,
      wageAllowances: [wageAllowance],
    });
    expect(r.wageAllowances).toHaveLength(1);
    expect(r.totalCost).toBeGreaterThan(r.segments.reduce((a, s) => a + s.cost, 0));
  });

  it("includes expense allowances in total cost", () => {
    const expenseAllowance = {
      allowance: "Meal allowance",
      allowanceAmount: 19.77,
      paymentFrequency: "for each meal",
    };
    const r = calculateShiftCost({
      date: "2025-07-14",
      startTime: "09:00",
      durationHours: 8,
      classification,
      penalties,
      expenseAllowances: [expenseAllowance],
    });
    expect(r.expenseAllowances).toHaveLength(1);
    expect(r.expenseAllowances[0].cost).toBeCloseTo(19.77, 1);
    expect(r.totalCost).toBeGreaterThan(r.segments.reduce((a, s) => a + s.cost, 0));
  });

  it("calculates per-km expense allowance", () => {
    const expenseAllowance = {
      allowance: "Vehicle allowance",
      allowanceAmount: 0.98,
      paymentFrequency: "per km",
    };
    const r = calculateShiftCost({
      date: "2025-07-14",
      startTime: "09:00",
      durationHours: 8,
      classification,
      penalties,
      expenseAllowances: [expenseAllowance],
      shiftKms: 50,
    });
    expect(r.expenseAllowances).toHaveLength(1);
    expect(r.expenseAllowances[0].cost).toBeCloseTo(0.98 * 50, 1);
  });
});

describe("calculateRosterCost", () => {
  it("returns empty totals for no shifts", () => {
    const r = calculateRosterCost({
      shifts: [],
      classification,
      penalties,
    });
    expect(r.shifts).toHaveLength(0);
    expect(r.totalCost).toBe(0);
    expect(r.totalHours).toBe(0);
  });

  it("costs multiple shifts and sums totals", () => {
    const shifts = [
      {
        date: "2025-07-14",
        startTime: "09:00",
        durationHours: 8,
        breakMinutes: 30,
      },
      {
        date: "2025-07-15",
        startTime: "09:00",
        durationHours: 6,
        breakMinutes: 0,
      },
    ];
    const r = calculateRosterCost({
      shifts,
      classification,
      penalties,
    });
    expect(r.shifts).toHaveLength(2);
    expect(r.shifts[0].result.totalHours).toBeCloseTo(7.5, 2);
    expect(r.shifts[1].result.totalHours).toBe(6);
    expect(r.totalHours).toBeCloseTo(13.5, 2);
    expect(r.totalCost).toBeCloseTo(7.5 * 29.73 + 6 * 29.73, 0);
  });

  it("applies allowances per shift", () => {
    const shifts = [
      {
        date: "2025-07-14",
        startTime: "09:00",
        durationHours: 8,
        shiftKms: 20,
      },
      {
        date: "2025-07-15",
        startTime: "09:00",
        durationHours: 8,
        shiftKms: 30,
      },
    ];
    const expenseAllowance = {
      allowance: "Vehicle allowance",
      allowanceAmount: 0.98,
      paymentFrequency: "per km",
    };
    const r = calculateRosterCost({
      shifts,
      classification,
      penalties,
      expenseAllowances: [expenseAllowance],
    });
    expect(r.shifts[0].result.expenseAllowances[0].cost).toBeCloseTo(
      0.98 * 20,
      1
    );
    expect(r.shifts[1].result.expenseAllowances[0].cost).toBeCloseTo(
      0.98 * 30,
      1
    );
    expect(r.totalCost).toBeGreaterThan(16 * 29.73);
  });
});

describe("calculateWageAllowanceCost", () => {
  const classification = {
    baseRate: 1040.7,
    baseRateType: "Weekly",
    calculatedRate: 29.73,
    calculatedRateType: "Hourly",
  };

  it("calculates per-hour allowance", () => {
    const allowance = {
      allowance: "Confined spaces",
      rate: 0.85,
      rateUnit: "",
      paymentFrequency: "per hour",
    };
    const cost = calculateWageAllowanceCost(allowance, classification, 8);
    expect(cost).toBeCloseTo(0.85 * 8, 1);
  });

  it("calculates percentage allowance per hour", () => {
    const allowance = {
      allowance: "Confined spaces",
      rate: 0.08,
      rateUnit: "Percent",
      paymentFrequency: "per hour",
    };
    const cost = calculateWageAllowanceCost(allowance, classification, 8);
    expect(cost).toBeCloseTo((29.73 * 0.08 / 100) * 8, 1);
  });

  it("calculates per-shift allowance", () => {
    const allowance = {
      allowance: "Dirty work",
      allowanceAmount: 2.44,
      paymentFrequency: "per shift",
    };
    const cost = calculateWageAllowanceCost(allowance, classification, 8);
    expect(cost).toBeCloseTo(2.44, 1);
  });
});

describe("calculateExpenseAllowanceCost", () => {
  it("calculates per-km allowance", () => {
    const allowance = {
      allowance: "Vehicle allowance",
      allowanceAmount: 0.98,
      paymentFrequency: "per km",
    };
    const cost = calculateExpenseAllowanceCost(allowance, 50);
    expect(cost).toBeCloseTo(0.98 * 50, 1);
  });

  it("calculates per-shift expense allowance", () => {
    const allowance = {
      allowance: "Meal allowance",
      allowanceAmount: 19.77,
      paymentFrequency: "for each meal",
    };
    const cost = calculateExpenseAllowanceCost(allowance);
    expect(cost).toBeCloseTo(19.77, 1);
  });
});
