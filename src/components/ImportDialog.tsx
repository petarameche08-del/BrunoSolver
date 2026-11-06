import { useRef, useState } from "react";
import { Exercise, PRESETS, normalizeExercise } from "../lib/exercise";
import {
  PdfAnalysis,
  analysePdf,
  extractPdfText,
  pdfTextPreview,
} from "../lib/pdfImport";

export function ImportDialog({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (exercise: Exercise) => void;
}) {
  const [text, setText] = useState("");
  const [analysis, setAnalysis] = useState<PdfAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const reset = () => {
    setText("");
    setAnalysis(null);
    setError(null);
    setBusy(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const importJson = (raw: string) => {
    try {
      const json = JSON.parse(raw) as unknown;
      const exercise = normalizeExercise(json);
      setError(null);
      onImport(exercise);
      close();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? `Import impossible : ${reason.message}`
          : "Import impossible : JSON invalide.",
      );
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    setAnalysis(null);
    setBusy(false);
    if (/\.pdf$/i.test(file.name)) {
      setBusy(true);
      try {
        const extracted = await extractPdfText(file);
        const compact = extracted.replace(/\s+/g, "");
        if (compact.length < 40) {
          throw new Error(
            "Ce PDF ne contient pas de texte exploitable (scan). Importez plutôt un JSON ou saisissez l'exercice à la main.",
          );
        }
        setAnalysis(analysePdf(extracted, file.name));
      } catch (reason) {
        setError(
          reason instanceof Error
            ? `Lecture du PDF impossible : ${reason.message}`
            : "Lecture du PDF impossible.",
        );
      } finally {
        setBusy(false);
      }
      return;
    }

    try {
      const content = await file.text();
      setText(content);
      importJson(content);
    } catch {
      setError("Impossible de lire ce fichier.");
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Importer un exercice"
      >
        <header className="modal-head">
          <div>
            <p className="eyebrow">Import</p>
            <h2>Importer un exercice</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Fermer"
            onClick={close}
          >
            ✕
          </button>
        </header>

        <p className="muted small">
          Importez le <strong>PDF de l'énoncé</strong> (le texte est analysé
          localement), un JSON exporté par l'outil, ou collez une définition.
          L'exercice doit contenir un switch cœur et au moins un switch d'accès.
        </p>

        <div className="import-actions">
          <button
            type="button"
            className="btn small"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            Choisir un PDF ou un JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf,application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
              event.target.value = "";
            }}
          />
          <span className="import-or">ou un exemple :</span>
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="chip-btn"
              onClick={() => {
                onImport(preset.build());
                close();
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {busy && (
          <p className="pdf-busy">
            <span className="status-spinner" /> Extraction du texte du PDF…
          </p>
        )}

        {analysis ? (
          <div className="pdf-preview">
            <div className="pdf-preview-head">
              <div>
                <p className="eyebrow">PDF analysé</p>
                <h3>{analysis.fileName}</h3>
                <p className="muted small">
                  {analysis.text.length.toLocaleString("fr-FR")} caractères
                  extraits · {analysis.exercise.vlans.length} VLAN(s) ·{" "}
                  {analysis.exercise.devices.length} équipement(s)
                </p>
              </div>
              <button
                type="button"
                className="btn ghost small"
                onClick={reset}
              >
                Changer de fichier
              </button>
            </div>

            <div className="pdf-chips">
              {analysis.exercise.vlans.map((vlan) => (
                <span key={vlan.key} className="vlan-chip" title={vlan.subnet}>
                  <b>VLAN {vlan.id}</b> {vlan.subnet}
                </span>
              ))}
              {analysis.exercise.devices.map((device) => (
                <span key={device.id} className="vlan-chip muted">
                  <b>{device.role === "core" ? "cœur" : device.role === "router" ? "routeur" : "accès"}</b>{" "}
                  {device.hostname}
                </span>
              ))}
            </div>

            <ul className="pdf-notes">
              {analysis.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>

            <details className="pdf-text">
              <summary>Voir le texte extrait</summary>
              <pre>{pdfTextPreview(analysis.text)}</pre>
            </details>
          </div>
        ) : (
          !busy && (
            <textarea
              className="import-textarea"
              value={text}
              onChange={(event) => setText(event.target.value)}
              spellCheck={false}
              placeholder={
                text
                  ? ""
                  : 'Ou collez ici le JSON de l\'exercice…\n\n{\n  "title": "TP6 — …",\n  "vlans": [ … ],\n  "devices": [ … ]\n}'
              }
              aria-label="Définition JSON de l'exercice"
            />
          )
        )}

        {error && <p className="import-error">{error}</p>}

        <footer className="modal-foot">
          <button type="button" className="btn ghost" onClick={close}>
            Annuler
          </button>
          {analysis ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                onImport(analysis.exercise);
                close();
              }}
            >
              Créer l'exercice depuis le PDF
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              disabled={!text.trim() || busy}
              onClick={() => importJson(text)}
            >
              Importer l'exercice
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
