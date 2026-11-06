import { ReactNode } from "react";
import { useCopy } from "../lib/storage";

export function CopyButton({
  text,
  label = "Copier",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, copy] = useCopy();
  return (
    <button
      type="button"
      className={`copy-btn ${className}`.trim()}
      onClick={() => void copy(text)}
    >
      {copied ? "Copié ✓" : label}
    </button>
  );
}

export function Panel({
  title,
  eyebrow,
  actions,
  children,
  className = "",
}: {
  title?: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`.trim()}>
      {(title || actions) && (
        <header className="panel-head">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            {title && <h2>{title}</h2>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function CodeBlock({
  lines,
  copyable = true,
}: {
  lines: string;
  copyable?: boolean;
}) {
  return (
    <div className="code-wrap">
      <pre className="code">
        <code>{lines}</code>
      </pre>
      {copyable && <CopyButton text={lines} className="code-copy" />}
    </div>
  );
}
