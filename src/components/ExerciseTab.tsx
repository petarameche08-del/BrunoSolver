import { useState } from "react";
import {
  Exercise,
  FEATURES,
  PRESETS,
  SwitchDevice,
  accessDevices,
  allVlanIds,
  compressPorts,
  coreDevice,
  excludedHigh,
  excludedLow,
  formatAccessPorts,
  parseAccessPorts,
  parseUnusedPorts,
  validateExercise,
  vlanBroadcast,
  vlanMask,
} from "../lib/exercise";

type Props = {
  exercise: Exercise;
  onChange: (exercise: Exercise) => void;
  onReplace: (exercise: Exercise) => void;
  onOpenImport: () => void;
};

export function ExerciseTab({
  exercise,
  onChange,
  onReplace,
  onOpenImport,
}: Props) {
  const errors = validateExercise(exercise);

  const patch = (value: Partial<Exercise>) => onChange({ ...exercise, ...value });

  const updateVlan = (index: number, value: Partial<Exercise["vlans"][number]>) => {
    const vlans = exercise.vlans.map((vlan, i) =>
      i === index ? { ...vlan, ...value } : vlan,
    );
    patch({ vlans });
  };

  const addVlan = () => {
    const ids = allVlanIds(exercise);
    const nextId = Math.min(4094, Math.max(...ids, 0) + 10);
    const base = `192.168.${nextId}`;
    patch({
      vlans: [
        ...exercise.vlans,
        {
          key: `v${Date.now()}`,
          id: nextId,
          label: `VLAN ${nextId}`,
          subnet: `${base}.0/24`,
          gateway: `${base}.254`,
          poolStart: `${base}.100`,
          poolEnd: `${base}.200`,
        },
      ],
    });
  };

  const updateDevice = (id: string, value: Partial<SwitchDevice>) => {
    patch({
      devices: exercise.devices.map((device) =>
        device.id === id ? { ...device, ...value } : device,
      ),
    });
  };

  const addAccess = () => {
    const count = accessDevices(exercise).length + 1;
    const id = `acc-${Date.now()}`;
    const corePort = `GigabitEthernet0/${count}`;
    patch({
      devices: [
        ...exercise.devices,
        {
          id,
          hostname: `SW-ACC-${count}`,
          role: "access",
          uplink: "GigabitEthernet0/1",
          corePort,
          accessPorts: [],
          unusedPorts: parseUnusedPorts("FastEthernet0/1-24"),
        },
      ],
    });
  };

  const addRouter = () => {
    if (exercise.devices.some((device) => device.role === "router")) return;
    const nextCorePort = accessDevices(exercise).length + 1;
    patch({
      devices: [
        ...exercise.devices,
        {
          id: `router-${Date.now()}`,
          hostname: "R1",
          role: "router",
          uplink: "GigabitEthernet0/0",
          corePort: `GigabitEthernet0/${nextCorePort}`,
          accessPorts: [],
          unusedPorts: [],
          transitSubnet: "10.0.0.0/30",
          routerIp: "10.0.0.1",
          coreIp: "10.0.0.2",
          defaultRoute: "203.0.113.1",
        },
      ],
    });
  };

  const removeDevice = (id: string) => {
    patch({ devices: exercise.devices.filter((device) => device.id !== id) });
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(exercise, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "exercice-cisco.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Exercice</p>
            <h2>Définition du lab</h2>
            <p className="muted small">
              L'application s'adapte à l'énoncé : VLANs, adressage, équipements,
              ports et fonctions. Les commandes, la correction et la validation
              sont recalculées automatiquement.
            </p>
          </div>
          <div className="answer-actions">
            <select
              className="preset-select"
              value=""
              onChange={(event) => {
                const preset = PRESETS.find((entry) => entry.id === event.target.value);
                if (preset) onReplace(preset.build());
                event.currentTarget.value = "";
              }}
              aria-label="Charger un exemple"
            >
              <option value="">Charger un exemple…</option>
              {PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            <button type="button" className="btn ghost small" onClick={exportJson}>
              Exporter JSON
            </button>
            <button
              type="button"
              className="btn ghost small"
              onClick={onOpenImport}
            >
              Importer un exercice
            </button>
          </div>
        </div>

        <div className="exercise-identity">
          <label className="field wide">
            <span>Titre de l'exercice</span>
            <input
              value={exercise.title}
              onChange={(event) => patch({ title: event.target.value })}
              placeholder="TP6 — VLANs et routage"
            />
          </label>
          <label className="field">
            <span>Module / promo</span>
            <input
              value={exercise.module}
              onChange={(event) => patch({ module: event.target.value })}
            />
          </label>
          <label className="field wide">
            <span>Énoncé / objectif</span>
            <input
              value={exercise.description}
              onChange={(event) => patch({ description: event.target.value })}
            />
          </label>
        </div>

        <div className="feature-grid">
          {FEATURES.map((feature) => {
            const active = exercise.features[feature.key];
            return (
              <button
                key={feature.key}
                type="button"
                className={`feature-card ${active ? "active" : ""}`}
                aria-pressed={active}
                onClick={() =>
                  patch({
                    features: {
                      ...exercise.features,
                      [feature.key]: !active,
                    },
                  })
                }
              >
                <span className="feature-dot" />
                <span>
                  <b>{feature.label}</b>
                  <small>{feature.hint}</small>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Adressage</p>
            <h2>VLANs et DHCP</h2>
          </div>
          <button type="button" className="btn ghost small" onClick={addVlan}>
            + Ajouter un VLAN
          </button>
        </div>

        <div className="plan-global">
          <label className="field">
            <span>DNS annoncé</span>
            <input
              value={exercise.dns}
              onChange={(event) => patch({ dns: event.target.value })}
              placeholder="1.1.1.1"
            />
          </label>
          <label className="field">
            <span>VLAN parking</span>
            <input
              type="number"
              min={1}
              max={4094}
              value={exercise.parkingVlan}
              onChange={(event) =>
                patch({ parkingVlan: Number(event.target.value) })
              }
            />
          </label>
        </div>

        {errors.length > 0 && (
          <div className="plan-errors">
            <strong>Points à corriger :</strong>
            <ul>
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="plan-grid">
          {exercise.vlans.map((vlan, index) => (
            <article key={vlan.key} className="plan-card">
              <header>
                <span className="vlan-dot" />
                <div>
                  <h3>
                    VLAN {vlan.id} · {vlan.label}
                  </h3>
                  <p>{vlan.subnet}</p>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Supprimer le VLAN ${vlan.id}`}
                  onClick={() =>
                    patch({
                      vlans: exercise.vlans.filter((_, i) => i !== index),
                    })
                  }
                >
                  ✕
                </button>
              </header>

              <div className="plan-fields">
                <label className="field">
                  <span>ID VLAN</span>
                  <input
                    type="number"
                    min={1}
                    max={4094}
                    value={vlan.id}
                    onChange={(event) =>
                      updateVlan(index, { id: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="field">
                  <span>Libellé</span>
                  <input
                    value={vlan.label}
                    onChange={(event) =>
                      updateVlan(index, { label: event.target.value })
                    }
                  />
                </label>
                <label className="field wide">
                  <span>Réseau (CIDR)</span>
                  <input
                    value={vlan.subnet}
                    onChange={(event) =>
                      updateVlan(index, { subnet: event.target.value })
                    }
                    placeholder="192.168.10.0/24"
                  />
                </label>
                <label className="field">
                  <span>Passerelle (SVI)</span>
                  <input
                    value={vlan.gateway}
                    onChange={(event) =>
                      updateVlan(index, { gateway: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>Début du pool</span>
                  <input
                    value={vlan.poolStart}
                    onChange={(event) =>
                      updateVlan(index, { poolStart: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>Fin du pool</span>
                  <input
                    value={vlan.poolEnd}
                    onChange={(event) =>
                      updateVlan(index, { poolEnd: event.target.value })
                    }
                  />
                </label>
              </div>

              <dl className="plan-derived">
                <div>
                  <dt>Masque</dt>
                  <dd>{vlanMask(vlan)}</dd>
                </div>
                <div>
                  <dt>Broadcast</dt>
                  <dd>{vlanBroadcast(vlan)}</dd>
                </div>
                <div>
                  <dt>Exclues</dt>
                  <dd>
                    {[excludedLow(vlan), excludedHigh(vlan)]
                      .filter(Boolean)
                      .map((range) => `${range![0]} → ${range![1]}`)
                      .join(" · ") || "—"}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Équipements</p>
            <h2>Switches et ports</h2>
            <p className="muted small">
              Un switch cœur + un ou plusieurs switches d'accès. Les PC sont
              déduits des ports access.
            </p>
          </div>
          <div className="answer-actions">
            <button
              type="button"
              className="btn ghost small"
              onClick={addRouter}
              disabled={exercise.devices.some((device) => device.role === "router")}
            >
              + Ajouter un routeur
            </button>
            <button type="button" className="btn ghost small" onClick={addAccess}>
              + Ajouter un switch d'accès
            </button>
          </div>
        </div>

        <div className="device-editor-grid">
          {exercise.devices.map((device) => (
            <DeviceEditor
              key={device.id}
              device={device}
              exercise={exercise}
              onChange={(value) => updateDevice(device.id, value)}
              onRemove={
                device.role !== "core"
                  ? () => removeDevice(device.id)
                  : undefined
              }
            />
          ))}
        </div>

        {coreDevice(exercise) && (
          <p className="muted small" style={{ marginTop: 12 }}>
            Le switch cœur porte {exercise.features.routing ? "les SVI et " : ""}
            {exercise.features.dhcp ? "les pools DHCP" : "la configuration L3"}.
            Les ports trunk côté cœur sont définis dans chaque switch d'accès.
          </p>
        )}
      </div>
    </div>
  );
}

function DeviceEditor({
  device,
  exercise,
  onChange,
  onRemove,
}: {
  device: SwitchDevice;
  exercise: Exercise;
  onChange: (value: Partial<SwitchDevice>) => void;
  onRemove?: () => void;
}) {
  const [accessText, setAccessText] = useState(() =>
    formatAccessPorts(device.accessPorts),
  );
  const [unusedText, setUnusedText] = useState(() =>
    compressPorts(device.unusedPorts),
  );
  const [accessError, setAccessError] = useState<string | null>(null);

  const commitAccess = (text: string) => {
    setAccessText(text);
    const parsed = parseAccessPorts(text);
    setAccessError(parsed.errors[0] ?? null);
    if (parsed.errors.length === 0) {
      onChange({ accessPorts: parsed.ports });
    }
  };

  const commitUnused = (text: string) => {
    setUnusedText(text);
    onChange({ unusedPorts: parseUnusedPorts(text) });
  };

  return (
    <article className={`device-editor ${device.role}`}>
      <header>
        <span className={`role-badge ${device.role}`}>
          {device.role === "core"
            ? "Cœur"
            : device.role === "router"
              ? "Routeur"
              : "Accès"}
        </span>
        <input
          className="hostname-input"
          value={device.hostname}
          onChange={(event) => onChange({ hostname: event.target.value })}
          aria-label="Hostname"
        />
        {onRemove && (
          <button
            type="button"
            className="icon-btn"
            aria-label={`Supprimer ${device.hostname}`}
            onClick={onRemove}
          >
            ✕
          </button>
        )}
      </header>

      {device.role === "access" ? (
        <div className="plan-fields">
          <label className="field">
            <span>Port uplink (vers cœur)</span>
            <input
              value={device.uplink}
              onChange={(event) => onChange({ uplink: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Port côté cœur</span>
            <input
              value={device.corePort}
              onChange={(event) => onChange({ corePort: event.target.value })}
            />
          </label>
          <label className="field wide">
            <span>Ports access — « port = vlan = nom »</span>
            <textarea
              className="mini-textarea"
              value={accessText}
              onChange={(event) => commitAccess(event.target.value)}
              spellCheck={false}
              placeholder={"Fa0/1 = 10 = PC-A\nFa0/2 = 20 = PC-B"}
              rows={3}
            />
          </label>
          {accessError && <p className="field-error">{accessError}</p>}
          <label className="field wide">
            <span>Ports inutilisés (plage ou liste)</span>
            <input
              value={unusedText}
              onChange={(event) => commitUnused(event.target.value)}
              placeholder="FastEthernet0/3-24"
            />
          </label>
        </div>
      ) : device.role === "router" ? (
        <div className="plan-fields">
          <label className="field">
            <span>Port LAN (vers cœur)</span>
            <input
              value={device.uplink}
              onChange={(event) => onChange({ uplink: event.target.value })}
              placeholder="GigabitEthernet0/0"
            />
          </label>
          <label className="field">
            <span>Port côté cœur</span>
            <input
              value={device.corePort}
              onChange={(event) => onChange({ corePort: event.target.value })}
              placeholder="GigabitEthernet0/3"
            />
          </label>
          <label className="field wide">
            <span>Réseau de transit (CIDR)</span>
            <input
              value={device.transitSubnet ?? ""}
              onChange={(event) =>
                onChange({ transitSubnet: event.target.value })
              }
              placeholder="10.0.0.0/30"
            />
          </label>
          <label className="field">
            <span>IP du routeur</span>
            <input
              value={device.routerIp ?? ""}
              onChange={(event) => onChange({ routerIp: event.target.value })}
              placeholder="10.0.0.1"
            />
          </label>
          <label className="field">
            <span>IP du cœur</span>
            <input
              value={device.coreIp ?? ""}
              onChange={(event) => onChange({ coreIp: event.target.value })}
              placeholder="10.0.0.2"
            />
          </label>
          <label className="field wide">
            <span>Route par défaut (next-hop, optionnel)</span>
            <input
              value={device.defaultRoute ?? ""}
              onChange={(event) =>
                onChange({ defaultRoute: event.target.value })
              }
              placeholder="203.0.113.1"
            />
          </label>
        </div>
      ) : (
        <p className="device-note">
          Rôle cœur : {exercise.features.routing ? "SVI + routage. " : ""}
          {exercise.features.dhcp ? "Serveur DHCP. " : ""}
          Trunks définis par les switches d'accès, lien routé défini par le
          routeur.
        </p>
      )}

      <p className="device-summary">
        {device.role === "access"
          ? `${device.accessPorts.length} port(s) access · ${device.unusedPorts.length} port(s) libre(s)`
          : device.role === "router"
            ? `Lien routé ${device.corePort} ↔ ${device.uplink} · ${device.transitSubnet ?? "—"}`
            : `${accessDevices(exercise).length} trunk(s) vers les switches d'accès${
                exercise.devices.some((entry) => entry.role === "router")
                  ? " · 1 lien routé"
                  : ""
              }`}
      </p>
    </article>
  );
}
