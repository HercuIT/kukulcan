import {
  checkEmail,
  checkPassword,
  EMAIL_MAX_LENGTH,
  normalizeEmail,
  PASSWORD_RULES,
} from "./passwordRules";

describe("passwordRules", () => {
  describe("positive", () => {
    test("a password with 8+ characters, a letter and a digit passes", () => {
      expect(checkPassword("Planta2026")).toEqual([]);
      expect(checkPassword("abcdefg1")).toEqual([]);
    });

    test("a normal email passes and is normalized before sending", () => {
      expect(checkEmail("ana@empresa.com")).toBeNull();
      expect(normalizeEmail("  Ana@Empresa.COM ")).toBe("ana@empresa.com");
      expect(checkEmail("  Ana@Empresa.COM ")).toBeNull();
    });
  });

  describe("negative", () => {
    test("each broken rule is reported, in checklist order", () => {
      expect(checkPassword("abcdefgh")).toEqual(["digit"]);
      expect(checkPassword("12345678")).toEqual(["letter"]);
      expect(checkPassword("abc1234")).toEqual(["length"]);
      expect(checkPassword("")).toEqual(["length", "letter", "digit"]);
    });

    test("empty and malformed emails are rejected", () => {
      expect(checkEmail("")).toBe("emailRequired");
      expect(checkEmail("   ")).toBe("emailRequired");
      expect(checkEmail("ana@")).toBe("emailInvalid");
      expect(checkEmail("ana@empresa")).toBe("emailInvalid");
      expect(checkEmail("ana empresa@x.com")).toBe("emailInvalid");
    });
  });

  describe("edge", () => {
    test("72 characters is accepted, 73 rejected", () => {
      expect(PASSWORD_RULES).toEqual({ minLength: 8, maxLength: 72 });
      expect(checkPassword(`a1${"x".repeat(70)}`)).toEqual([]);
      expect(checkPassword(`a1${"x".repeat(71)}`)).toEqual(["length"]);
    });

    test("only ASCII letters count, like Supabase's letters_digits rule", () => {
      expect(checkPassword("ñññññññ1")).toEqual(["letter"]);
    });

    test("emails up to 254 characters pass; longer ones don't", () => {
      const local = "a".repeat(EMAIL_MAX_LENGTH - "@x.co".length);
      expect(checkEmail(`${local}@x.co`)).toBeNull();
      expect(checkEmail(`a${local}@x.co`)).toBe("emailInvalid");
    });

    test("null and undefined are handled", () => {
      expect(checkPassword(undefined)).toEqual(["length", "letter", "digit"]);
      expect(checkEmail(null)).toBe("emailRequired");
      expect(normalizeEmail(undefined)).toBe("");
    });
  });
});
