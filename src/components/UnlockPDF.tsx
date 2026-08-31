import { useState } from "react";
import { KeyRound, X } from "lucide-react";
import type { OpenFile } from "../types";
import { pdfEngine } from "../core/client";
import { IconButton } from "./Button";

export function UnlockPDF({
  file,
  onClose,
  onUnlocked,
}: {
  file: OpenFile;
  onClose(): void;
  onUnlocked(file: OpenFile): Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const unlock = async () => {
    if (!password) {
      setError("Enter the PDF password.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await pdfEngine.unlock(file.bytes, password);
      if (!window.desktop)
        throw new Error("Unlock export is available in the Mac app.");
      const saved = await window.desktop.save(
        result.bytes,
        null,
        file.name.replace(/\.pdf$/i, "") + " Unlocked.pdf",
        true,
      );
      if (saved) {
        await onUnlocked({
          id: saved.id,
          name: saved.name,
          bytes: result.bytes,
        });
        onClose();
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not unlock this PDF.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="overlay unlock-overlay">
      <section
        className="unlock-window"
        role="dialog"
        aria-modal="true"
        aria-label="Unlock PDF"
      >
        <header>
          <div className="markup-icon">
            <KeyRound size={21} />
          </div>
          <div>
            <small>LOCAL SECURITY TOOL</small>
            <h2>Unlock a PDF copy</h2>
          </div>
          <IconButton label="Close unlock PDF" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <p>
          Enter the password for <strong>{file.name}</strong>. OpenPDF removes
          the encryption and saves a new copy. The original stays untouched.
        </p>
        <label>
          Password
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void unlock();
            }}
          />
        </label>
        {error && (
          <p className="modal-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy} onClick={unlock}>
            {busy ? "Unlocking…" : "Unlock and save copy"}
          </button>
        </footer>
      </section>
    </div>
  );
}
