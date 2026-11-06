import { useEffect, useMemo, useState } from "react";
import { Exercise, deviceById } from "../lib/exercise";
import { buildAnswerKey, makeBroken } from "../lib/generator";
import { Check, validateConfig } from "../lib/validator";
import { CopyButton } from "./ui";

type Props = {
  exercise: Exercise;
  deviceId: string;
  onDevice: (deviceId: string) => void;
  value: string;
  onChange: (value: string) => void;
  onLoadAnswer: (deviceId: string) => void;
};

function groupChecks(checks: Check[]): { group: string; items: Check[] }[] {
  const order: string[] = [];
  const map = new Map<string, Check[]>();
  for (const check of checks) {
    if (!map.has(check.group)) {
      map.set(check.group, []);
      order.push(check.group);
    }
    map.get(check.group)!.push(check);
  }
  return order.map((group) => ({ group, items: map.get(group)! }));
}

export function ConfigLab({
  exercise,
  deviceId,
  onDevice,
  value,
  onChange,
  onLoadAnswer,
}: Props) {
  const [faultHint, setFaultHint] = useState<string | null>(null);
  const [pendingHint, setPendingHint] = useState<string | null>(null);
  const answerKey = useMemo(() => buildAnswerKey(exercise), [exercise]);
  const report = useMemo(
    () => validateConfig(exercise, deviceId, value),
    [exercise, deviceId, value],
  );
  const device = deviceById(exercise, deviceId);
  const hostname = device?.hostname ?? deviceId;

  useEffect(() => {
    setFaultHint(null);
    setPendingHint(null);
  }, [deviceId]);

  const download = () => {
    const blob = new Blob([value], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${hostname.toLowerCase().replace(/\s+/g, "-")}.cfg`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const loadBroken = () => {
    const broken = makeBroken(exercise, deviceId);
    onChange(broken.text);
    setFaultHint(null);
    setPendingHint(broken.hint);
  };

  const groups = groupChecks(report.checks);
  const empty = value.trim().length === 0;

  return (
    <div className="stack">
      <div className="panel config-toolbar">
        <div className="device-tabs" role="tablist" aria-label="Équipement">
          {exercise.devices.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={deviceId === entry.id}
              className={`device-tab ${deviceId === entry.id ? "active" : ""}`}
              onClick={() => onDevice(entry.id)}
            >
              {entry.hostname}
            </button>
          ))}
        </div>
        <div className="toolbar-actions">
          <button
            type="button"
            className="btn ghost small"
            onClick={() => {
              onChange("");
              setFaultHint(null);
              setPendingHint(null);
            }}
          >
            Effacer
          </button>
          <button type="button" className="btn ghost small" onClick={loadBroken}>
            Scénario cassé
          </button>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => onLoadAnswer(deviceId)}
          >
            Charger la correction
          </button>
          <button
            type="button"
            className="btn small"
            onClick={download}
            disabled={empty}
          >
            Télécharger .cfg
          </button>
        </div>
      </div>

      {pendingHint && (
        <div className="fault-banner">
          <div>
            <strong>Mode diagnostic</strong>
            <p>
              Une ou plusieurs erreurs ont été injectées dans {hostname}. Validez,
              lisez les échecs, corrigez la configuration.
            </p>
          </div>
          {faultHint ? (
            <p className="fault-hint">Indice : {faultHint}</p>
          ) : (
            <button
              type="button"
              className="btn ghost small"
              onClick={() => setFaultHint(pendingHint)}
            >
              Afficher un indice
            </button>
          )}
        </div>
      )}

      <div className="lab-grid">
        <div className="lab-left stack">
          <section className="panel editor-panel">
            <header className="panel-head">
              <div>
                <p className="eyebrow">Configuration</p>
                <h2>{hostname}</h2>
              </div>
              <div className="panel-actions">
                <CopyButton text={value} label="Copier" />
              </div>
            </header>
            <textarea
              className="config-editor"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              wrap="off"
              placeholder={`hostname ${hostname}\n!\n! Collez ici votre running-config…\n! puis lisez le rapport à droite.`}
              aria-label={`Configuration ${hostname}`}
            />
            <p className="editor-foot">
              {value.split("\n").length} ligne(s) · analyse en direct, tolérante aux
              abréviations et à l'ordre des commandes.
            </p>
          </section>

          <div className="panel answer-panel">
            <div>
              <p className="eyebrow">Correction</p>
              <h2>Configuration de référence — {hostname}</h2>
              <p className="muted small">
                Générée à partir de l'exercice courant. Comparez-la à votre saisie.
              </p>
            </div>
            <div className="answer-actions">
              <CopyButton
                text={answerKey[deviceId] ?? ""}
                label="Copier la correction"
              />
              <button
                type="button"
                className="btn small"
                onClick={() => onLoadAnswer(deviceId)}
              >
                Injecter dans l'éditeur
              </button>
            </div>
          </div>
        </div>

        <aside className="panel results-panel">
          <header className="panel-head">
            <div>
              <p className="eyebrow">Rapport de validation</p>
              <h2>
                {report.ok} / {report.total} vérifications
              </h2>
            </div>
            <span
              className={`score-badge ${
                report.percent === 100
                  ? "perfect"
                  : report.percent >= 60
                    ? "good"
                    : "low"
              }`}
            >
              {report.percent}%
            </span>
          </header>

          <div className="progress thin" aria-hidden="true">
            <span style={{ width: `${report.percent}%` }} />
          </div>

          {empty ? (
            <p className="results-empty">
              La zone de configuration est vide. Collez votre configuration, ou
              chargez la correction pour comparer.
            </p>
          ) : (
            <div className="check-groups">
              {groups.map(({ group, items }) => (
                <div key={group} className="check-group">
                  <p className="check-group-title">{group}</p>
                  <ul>
                    {items.map((check) => (
                      <li
                        key={check.id}
                        className={`check ${check.ok ? "ok" : "ko"}`}
                      >
                        <span className="check-icon" aria-hidden="true">
                          {check.ok ? "✓" : "✕"}
                        </span>
                        <div>
                          <p className="check-label">{check.label}</p>
                          {check.detail && (
                            <p className="check-detail">{check.detail}</p>
                          )}
                          {!check.ok && check.fix && (
                            <code className="check-fix">{check.fix}</code>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <p className="results-note">
            La validation accepte plusieurs écritures valides : listes de VLANs en
            plusieurs lignes, `interface range`, abréviations (`fa0/1`, `gi0/1`).
            Elle ne remplace pas un vrai switch : testez toujours en lab.
          </p>
        </aside>
      </div>
    </div>
  );
}
