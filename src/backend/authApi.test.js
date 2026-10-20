import { supabase } from "./supabaseClient";
import {
  confirmEmail,
  confirmRedirectUrl,
  getMyRoles,
  onSessionChange,
  resendConfirmation,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from "./authApi";

jest.mock("./supabaseClient", () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      onAuthStateChange: jest.fn(),
      updateUser: jest.fn(),
      resend: jest.fn(),
      verifyOtp: jest.fn(),
    },
    from: jest.fn(),
  },
}));

const AUTH_USER = { id: "u-1", email: "designer@example.com" };

function mockProfileQuery(result) {
  const chain = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    maybeSingle: jest.fn(async () => result),
  };
  supabase.from.mockReturnValue(chain);
  return chain;
}

let emit;
let unsubscribe;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  unsubscribe = jest.fn();
  supabase.auth.onAuthStateChange.mockImplementation((cb) => {
    emit = cb;
    return { data: { subscription: { unsubscribe } } };
  });
});

afterEach(() => jest.useRealTimers());

describe("authApi", () => {
  describe("positive", () => {
    test("signIn returns the app user", async () => {
      supabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: AUTH_USER },
        error: null,
      });
      await expect(signIn("designer@example.com", "pw")).resolves.toEqual({
        uid: "u-1",
        email: "designer@example.com",
      });
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "designer@example.com",
        password: "pw",
      });
    });

    test("signUp creates the account (the profile comes from the trigger)", async () => {
      supabase.auth.signUp.mockResolvedValue({
        data: { user: AUTH_USER },
        error: null,
      });
      await expect(signUp("designer@example.com", "pw")).resolves.toEqual({
        uid: "u-1",
        email: "designer@example.com",
      });
      expect(supabase.from).not.toHaveBeenCalled();
      // HTE-107: el enlace del correo vuelve a /auth/confirm en el mismo origen.
      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: "designer@example.com",
        password: "pw",
        options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
      });
    });

    test("resendConfirmation mails a new signup link to /auth/confirm", async () => {
      supabase.auth.resend.mockResolvedValue({ data: {}, error: null });
      await expect(resendConfirmation("a@b.co")).resolves.toBeUndefined();
      expect(supabase.auth.resend).toHaveBeenCalledWith({
        type: "signup",
        email: "a@b.co",
        options: { emailRedirectTo: confirmRedirectUrl() },
      });
    });

    test("confirmEmail verifies the link's token hash as an email OTP", async () => {
      supabase.auth.verifyOtp.mockResolvedValue({ data: {}, error: null });
      await confirmEmail("hash123");
      expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
        token_hash: "hash123",
        type: "email",
      });
    });

    test("onSessionChange reports the initial session and sign-out", () => {
      const cb = jest.fn();
      onSessionChange(cb);
      emit("INITIAL_SESSION", { user: AUTH_USER });
      jest.runAllTimers();
      emit("SIGNED_OUT", null);
      jest.runAllTimers();
      expect(cb.mock.calls).toEqual([
        [{ uid: "u-1", email: "designer@example.com" }],
        [null],
      ]);
    });

    test("getMyRoles reads the caller's profile", async () => {
      const chain = mockProfileQuery({
        data: {
          email: "a@b.c",
          designer: true,
          reviewer: false,
          deployer: false,
        },
        error: null,
      });
      await expect(getMyRoles("u-1")).resolves.toEqual({
        email: "a@b.c",
        designer: true,
        reviewer: false,
        deployer: false,
      });
      expect(supabase.from).toHaveBeenCalledWith("profiles");
      expect(chain.eq).toHaveBeenCalledWith("id", "u-1");
    });
  });

  describe("updatePassword", () => {
    test("positive: sets the signed-in user's password", async () => {
      supabase.auth.updateUser.mockResolvedValue({ data: {}, error: null });
      await updatePassword("s3cret-pass");
      expect(supabase.auth.updateUser).toHaveBeenCalledWith({
        password: "s3cret-pass",
      });
    });

    test("negative: weak passwords reject with weak-password", async () => {
      supabase.auth.updateUser.mockResolvedValue({
        data: null,
        error: { code: "weak_password", message: "Password is too weak" },
      });
      await expect(updatePassword("123")).rejects.toMatchObject({
        code: "weak-password",
      });
    });

    test("edge: a missing recovery session rejects with Supabase's message", async () => {
      supabase.auth.updateUser.mockResolvedValue({
        data: null,
        error: { message: "Auth session missing!" },
      });
      await expect(updatePassword("s3cret-pass")).rejects.toThrow(
        "Auth session missing!",
      );
    });
  });

  describe("negative", () => {
    test("wrong credentials reject with invalid-credentials", async () => {
      supabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { code: "invalid_credentials", message: "Invalid login" },
      });
      await expect(signIn("a@b.c", "bad")).rejects.toMatchObject({
        code: "invalid-credentials",
      });
    });

    test("an existing email rejects with email-in-use", async () => {
      supabase.auth.signUp.mockResolvedValue({
        data: { user: null },
        error: { code: "user_already_exists", message: "exists" },
      });
      await expect(signUp("a@b.c", "pw")).rejects.toMatchObject({
        code: "email-in-use",
      });
    });

    test("HTE-107 errors map to app codes: unconfirmed, rate limit, expired link", async () => {
      supabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { code: "email_not_confirmed", message: "Email not confirmed" },
      });
      await expect(signIn("a@b.co", "pw")).rejects.toMatchObject({
        code: "email-not-confirmed",
      });
      supabase.auth.resend.mockResolvedValue({
        data: null,
        error: { code: "over_email_send_rate_limit", message: "slow down" },
      });
      await expect(resendConfirmation("a@b.co")).rejects.toMatchObject({
        code: "rate-limited",
      });
      supabase.auth.verifyOtp.mockResolvedValue({
        data: null,
        error: { code: "otp_expired", message: "expired" },
      });
      await expect(confirmEmail("old")).rejects.toMatchObject({
        code: "link-expired",
        message: "expired",
      });
    });

    test("signOut and getMyRoles surface errors", async () => {
      supabase.auth.signOut.mockResolvedValue({
        error: { message: "network" },
      });
      await expect(signOut()).rejects.toThrow("network");
      mockProfileQuery({ data: null, error: { code: "42501", message: "no" } });
      await expect(getMyRoles("u-1")).rejects.toMatchObject({
        code: "permission-denied",
      });
    });
  });

  describe("edge", () => {
    test("token refreshes for the same user do not call back again", () => {
      const cb = jest.fn();
      onSessionChange(cb);
      emit("INITIAL_SESSION", { user: AUTH_USER });
      emit("TOKEN_REFRESHED", { user: AUTH_USER });
      emit("USER_UPDATED", { user: AUTH_USER });
      jest.runAllTimers();
      expect(cb).toHaveBeenCalledTimes(1);
    });

    test("no callback fires after unsubscribing", () => {
      const cb = jest.fn();
      const stop = onSessionChange(cb);
      emit("INITIAL_SESSION", { user: AUTH_USER });
      stop();
      jest.runAllTimers();
      expect(cb).not.toHaveBeenCalled();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    test("a user without a profile gets empty roles", async () => {
      mockProfileQuery({ data: null, error: null });
      await expect(getMyRoles("u-1")).resolves.toEqual({});
    });
  });
});
