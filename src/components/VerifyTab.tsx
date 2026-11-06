import { useState } from "react";
import { DIAGNOSTICS, buildVerify } from "../data/content";
import { Exercise, validateExercise } from "../lib/exercise";
import { CopyButton } from "./ui";

export function VerifyTab({ exercise }: { exercise: Exercise }) {
  const [openDiag, setOpenDiag] = useState<number | null>(0);
  const errors = validateExercise(exercise);
  const commands = buildVerify(exercise);

  return (
    <div className="stack">
      <div className="panel">
        <p className="eyebrow">Checklist des tests</p>
        <h2>Commandes de vérification</h2>
        <p className="muted small">
          À exécuter après chaque étape. Les mêmes commandes servent au diagnostic :
          gardez ce tableau ouvert pendant le TP.
        </p>

        <div className="table-wrap">
          <table className="verify-table">
            <thead>
              <tr>
                <th>Commande</th>
                <th>À quoi ça sert</th>
                <th>Résultat attendu</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {commands.map((entry) => (
                <tr key={entry.command}>
                  <td>
                    <code>{entry.command}</code>
                  </td>
                  <td>{entry.purpose}</td>
                  <td>{entry.expected}</td>
                  <td>
                    <CopyButton text={entry.command} label="Copier" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <p className="eyebrow">Diagnostic express</p>
        <h2>Un symptôme → les causes probables</h2>
        <div className="diag-list">
          {DIAGNOSTICS.map((diag, index) => (
            <details
              key={diag.symptom}
              open={openDiag === index}
              onToggle={(event) => {
                if (event.currentTarget.open) setOpenDiag(index);
                else if (openDiag === index) setOpenDiag(null);
              }}
            >
              <summary>{diag.symptom}</summary>
              <div className="diag-body">
                <div>
                  <p className="diag-title">Causes probables</p>
                  <ul>
                    {diag.causes.map((cause) => (
                      <li key={cause}>{cause}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="diag-title">Commandes à lancer</p>
                  <ul className="diag-checks">
                    {diag.checks.map((check) => (
                      <li key={check}>
                        <code>{check}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="panel warning-panel">
          <p className="eyebrow">Exercice</p>
          <h2>Incohérences détectées</h2>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
          <p className="muted small">
            Corrigez la définition dans l'onglet « Exercice » : la correction et le
            validateur s'appuient dessus.
          </p>
        </div>
      )}
    </div>
  );
}
