import { useState } from "react";

// Drawn as outlines; without these the shapes fill in solid black.
const ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false
};

function PasswordInput({ id, value, onChange, autoComplete, maxLength, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="auth-input-wrap auth-input-wrap--password">
      <input
        {...props}
        id={id}
        value={value}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        maxLength={maxLength}
        onChange={onChange}
      />
      <button
        className="auth-input-action auth-password-toggle"
        type="button"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        onClick={() => setVisible((shown) => !shown)}
      >
        {visible ? (
          // Eye with a line through it: click to hide again.
          <svg {...ICON}>
            <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.4 3.4" />
            <path d="M6.6 6.6A16.6 16.6 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
            <path d="M3 3l18 18" />
          </svg>
        ) : (
          // Open eye: click to show the password.
          <svg {...ICON}>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </span>
  );
}

export default PasswordInput;
