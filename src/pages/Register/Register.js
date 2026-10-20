import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { resendConfirmation, signUp } from "../../backend/authApi";
import { UI_STRINGS } from "../../constants/uiStrings";
import {
  checkEmail,
  checkPassword,
  normalizeEmail,
  PASSWORD_RULES,
} from "../../constants/passwordRules";
import { useCooldown } from "../../hooks/useCooldown";
import Logo from "../../components/Logo/Logo";
import "../../styles/LoginStyle/LoginStyle.css";
import "../../styles/RegisterStyle/RegisterStyle.css";

const S = UI_STRINGS.register;
/** @type {Array<{ id: "length" | "letter" | "digit", label: string }>} */
const RULES = [
  {
    id: "length",
    label: S.rules.length(PASSWORD_RULES.minLength, PASSWORD_RULES.maxLength),
  },
  { id: "letter", label: S.rules.letter },
  { id: "digit", label: S.rules.digit },
];

// Error de un campo, o null.
function validate(field, { email, password, confirm }) {
  if (field === "email") {
    const problem = checkEmail(email);
    return problem ? S.errors[problem] : null;
  }
  if (field === "password")
    return checkPassword(password).length ? S.errors.passwordRules : null;
  if (field === "confirm")
    return confirm !== password ? S.errors.mismatch : null;
  return null;
}

const FIELDS = ["email", "password", "confirm"];

function PasswordField({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  describedBy,
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="kk-field">
      <label htmlFor={id}>{label}</label>
      <div className="kk-password">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          className="kk-password__toggle"
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? S.hidePassword : S.showPassword}
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} className="kk-field__error">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Registro (HTE-107). Valida al salir de cada campo y al enviar; después de enviar muestra
 * "Revisa tu correo" con la misma respuesta exista o no la cuenta, para no revelar quién está
 * registrado. La cuenta no tiene sesión hasta que se abre el enlace (/auth/confirm).
 */
export default function Register() {
  const [values, setValues] = useState({
    email: "",
    password: "",
    confirm: "",
  });
  const [errors, setErrors] = useState(
    /** @type {Record<string, string | null>} */ ({}),
  );
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState(null);
  const [notice, setNotice] = useState("");
  const [cooldown, startCooldown] = useCooldown();
  // Un segundo clic mientras la petición está en vuelo no manda otra (el estado tarda un render).
  const inFlight = useRef(false);

  const set = (field) => (e) => {
    const next = { ...values, [field]: e.target.value };
    setValues(next);
    // Un campo con error se vuelve a validar al escribir, para que el error se vaya al corregirlo.
    if (errors[field])
      setErrors((prev) => ({ ...prev, [field]: validate(field, next) }));
  };
  const blur = (field) => () =>
    setErrors((prev) => ({ ...prev, [field]: validate(field, values) }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (inFlight.current) return;
    setFormError("");
    const found = Object.fromEntries(
      FIELDS.map((f) => [f, validate(f, values)]),
    );
    setErrors(found);
    const firstInvalid = FIELDS.find((f) => found[f]);
    if (firstInvalid) {
      document.getElementById(`register-${firstInvalid}`)?.focus();
      return;
    }

    const email = normalizeEmail(values.email);
    inFlight.current = true;
    setSubmitting(true);
    try {
      await signUp(email, values.password);
      setSentTo(email);
      setNotice("");
      startCooldown();
    } catch (err) {
      console.error("Error de registro:", err);
      if (err.code === "weak-password")
        setErrors((prev) => ({ ...prev, password: S.errors.passwordRules }));
      else if (err.code === "rate-limited") setFormError(S.errors.rateLimited);
      else setFormError(S.errors.generic);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setNotice("");
    setFormError("");
    try {
      await resendConfirmation(sentTo);
      setNotice(S.checkEmail.resent);
      startCooldown();
    } catch (err) {
      console.error("Error al reenviar la confirmación:", err);
      setFormError(
        err.code === "rate-limited" ? S.errors.rateLimited : S.errors.generic,
      );
    }
  };

  if (sentTo) {
    return (
      <div className="login-container">
        <div className="login-box">
          <Logo size="lg" />
          <h2>{S.checkEmail.title}</h2>
          <p>{S.checkEmail.body(sentTo)}</p>
          <button type="button" onClick={handleResend} disabled={cooldown > 0}>
            {cooldown > 0
              ? S.checkEmail.resendIn(cooldown)
              : S.checkEmail.resend}
          </button>
          <button
            type="button"
            className="register-btn"
            onClick={() => {
              setSentTo(null);
              setNotice("");
              setFormError("");
            }}
          >
            {S.checkEmail.changeEmail}
          </button>
          {notice && (
            <p className="kk-notice" role="status">
              {notice}
            </p>
          )}
          {formError && (
            <p className="error-message" role="alert">
              {formError}
            </p>
          )}
        </div>
      </div>
    );
  }

  const failed = checkPassword(values.password);
  return (
    <div className="login-container">
      <form
        className="login-box kk-register"
        onSubmit={handleSubmit}
        noValidate
      >
        <Logo size="lg" />
        <h2>{S.title}</h2>

        <div className="kk-field">
          <label htmlFor="register-email">{S.email}</label>
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={set("email")}
            onBlur={blur("email")}
            aria-invalid={errors.email ? "true" : undefined}
            aria-describedby={errors.email ? "register-email-error" : undefined}
          />
          {errors.email && (
            <p id="register-email-error" className="kk-field__error">
              {errors.email}
            </p>
          )}
        </div>

        <PasswordField
          id="register-password"
          label={S.password}
          value={values.password}
          onChange={set("password")}
          onBlur={blur("password")}
          error={errors.password}
          describedBy={
            errors.password
              ? "register-password-rules register-password-error"
              : "register-password-rules"
          }
        />
        <ul id="register-password-rules" className="kk-rules">
          {RULES.map((rule) => {
            const met = values.password !== "" && !failed.includes(rule.id);
            return (
              <li
                key={rule.id}
                className={
                  met ? "kk-rules__item kk-rules__item--met" : "kk-rules__item"
                }
                data-met={met}
              >
                <span aria-hidden="true">
                  {met ? S.rules.metMark : S.rules.unmetMark}
                </span>{" "}
                {rule.label}
              </li>
            );
          })}
        </ul>

        <PasswordField
          id="register-confirm"
          label={S.confirmPassword}
          value={values.confirm}
          onChange={set("confirm")}
          onBlur={blur("confirm")}
          error={errors.confirm}
          describedBy={errors.confirm ? "register-confirm-error" : undefined}
        />

        <button type="submit" disabled={submitting}>
          {submitting ? S.submitting : S.submit}
        </button>
        {formError && (
          <p className="error-message" role="alert">
            {formError}
          </p>
        )}
        <p className="kk-switch">
          <Link to="/">{S.haveAccount}</Link>
        </p>
      </form>
    </div>
  );
}
