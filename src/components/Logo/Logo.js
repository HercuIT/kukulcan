import React, { useState } from "react";
import { Link } from "react-router-dom";
import { UI_STRINGS } from "../../constants/uiStrings";
import "./Logo.css";

const MARK_SRC = `${process.env.PUBLIC_URL || ""}/brand/kukulcan-mark.svg`;

/**
 * Lockup de Kukulcan: la marca a color junto al nombre (estilo `wordmark`).
 * - size "sm": barra de menú (marca 28px). size "lg": Login, Home, Set Password (marca 72px).
 * - to: si se da, el lockup es un enlace (la barra de menú enlaza a Home).
 * La imagen lleva alt="" porque el nombre visible ya da nombre al enlace; si la marca no carga,
 * se oculta y queda el nombre.
 */
export default function Logo({ size = "sm", to }) {
  const [markFailed, setMarkFailed] = useState(false);
  const content = (
    <>
      {!markFailed && (
        <img
          className="kk-logo__mark"
          src={MARK_SRC}
          alt=""
          onError={() => setMarkFailed(true)}
        />
      )}
      <span
        className={`kk-logo__name ${size === "lg" ? "kk-text-display" : "kk-text-wordmark"}`}
      >
        {UI_STRINGS.components.logo.name}
      </span>
    </>
  );
  const className = `kk-logo kk-logo--${size === "lg" ? "lg" : "sm"}`;

  if (to) {
    return (
      <Link
        to={to}
        className={className}
        aria-label={UI_STRINGS.components.logo.homeLink}
      >
        {content}
      </Link>
    );
  }
  return <span className={className}>{content}</span>;
}
