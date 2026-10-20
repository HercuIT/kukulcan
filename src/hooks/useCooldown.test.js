import { renderHook, act } from "@testing-library/react";
import { RESEND_COOLDOWN_SECONDS, useCooldown } from "./useCooldown";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const tick = (seconds) => {
  for (let i = 0; i < seconds; i++) act(() => jest.advanceTimersByTime(1000));
};

describe("useCooldown", () => {
  test("positive: start() counts down from 60 to 0, one second at a time", () => {
    const { result } = renderHook(() => useCooldown());
    expect(RESEND_COOLDOWN_SECONDS).toBe(60);
    expect(result.current[0]).toBe(0);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(60);
    tick(1);
    expect(result.current[0]).toBe(59);
    tick(59);
    expect(result.current[0]).toBe(0);
  });

  test("negative: without start() nothing counts", () => {
    const { result } = renderHook(() => useCooldown());
    tick(5);
    expect(result.current[0]).toBe(0);
  });

  test("edge: start() during a countdown restarts it, and a custom length works", () => {
    const { result } = renderHook(() => useCooldown(3));
    act(() => result.current[1]());
    tick(2);
    expect(result.current[0]).toBe(1);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(3);
    tick(10);
    expect(result.current[0]).toBe(0);
  });
});
