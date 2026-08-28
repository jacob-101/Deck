import type { ButtonHTMLAttributes, ReactNode } from "react";
export function IconButton({
  label,
  children,
  active,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`icon-button ${active ? "active" : ""} ${props.className ?? ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
    >
      {children}
    </button>
  );
}
