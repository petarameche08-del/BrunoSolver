import { useEffect, useRef } from "react";
import {
  Exercise,
  SwitchDevice,
  accessDevices,
  coreDevice,
  deviceById,
  localVlanIds,
  vlanById,
} from "../lib/exercise";
import { canonIface } from "../lib/net";

type Props = {
  exercise: Exercise;
  selected: string;
  onSelect: (deviceId: string) => void;
  onConfigure: (deviceId: string) => void;
};

type SwitchNode = {
  device: SwitchDevice;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "core" | "access" | "router";
};

function buildLayout(exercise: Exercise) {
  const devices = exercise.devices;
  const core = coreDevice(exercise);
  const access = accessDevices(exercise);
  const router = devices.find((device) => device.role === "router");
  const width = Math.max(router ? 1120 : 900, access.length * 280 + 140);
  const coreW = 240;
  const coreH = 74;
  const accessW = 212;
  const accessH = 70;
  const margin = 70;

  const nodes: SwitchNode[] = [];
  if (core) {
    nodes.push({
      device: core,
      x: width / 2 - coreW / 2,
      y: 26,
      w: coreW,
      h: coreH,
      kind: "core",
    });
  }
  if (router) {
    nodes.push({
      device: router,
      x: Math.max(30, width / 2 - coreW / 2 - 300),
      y: 26,
      w: 230,
      h: 74,
      kind: "router",
    });
  }
  access.forEach((device, index) => {
    const x =
      access.length === 1
        ? width / 2 - accessW / 2
        : margin + index * ((width - 2 * margin - accessW) / (access.length - 1));
    nodes.push({
      device,
      x,
      y: 188,
      w: accessW,
      h: accessH,
      kind: "access",
    });
  });

  const endpoints: {
    deviceId: string;
    port: string;
    label: string;
    vlanId: number;
    x: number;
    y: number;
    w: number;
    h: number;
  }[] = [];

  nodes
    .filter((node) => node.kind === "access")
    .forEach((node) => {
      const shown = node.device.accessPorts.slice(0, 3);
      const pcW = 132;
      const pcH = 58;
      const gap = 14;
      const total = shown.length * pcW + Math.max(0, shown.length - 1) * gap;
      const startX = node.x + node.w / 2 - total / 2;
      shown.forEach((entry, index) => {
        endpoints.push({
          deviceId: node.device.id,
          port: entry.port,
          label: entry.label,
          vlanId: entry.vlanId,
          x: startX + index * (pcW + gap),
          y: 356,
          w: pcW,
          h: pcH,
        });
      });
    });

  return { width, height: 470, nodes, endpoints, devices };
}

function linkLabel(x: number, y: number, text: string) {
  const width = text.length * 6.2 + 14;
  return (
    <g key={`${x}-${y}-${text}`}>
      <rect x={x - width / 2} y={y - 9} width={width} height={18} rx={9} className="topo-tag-bg" />
      <text x={x} y={y + 3.5} className="topo-tag" textAnchor="middle">
        {text}
      </text>
    </g>
  );
}

export function Topology({ exercise, selected, onSelect, onConfigure }: Props) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const layout = buildLayout(exercise);
  const device = deviceById(exercise, selected) ?? exercise.devices[0];
  const core = coreDevice(exercise);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    element.scrollLeft = Math.max(0, (element.scrollWidth - element.clientWidth) / 2);
  }, [exercise.devices.length]);

  const access = accessDevices(exercise);
  const router = exercise.devices.find((entry) => entry.role === "router");
  const localVlans = device.role === "access" ? localVlanIds(device) : [];

  return (
    <div className="topo-layout">
      <div className="panel topo-panel">
        <div className="topo-canvas" ref={canvasRef}>
          <svg
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role="img"
            aria-label="Topologie de l'exercice"
          >
            <defs>
              <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
                <path d="M 28 0 L 0 0 0 28" className="topo-grid-line" />
              </pattern>
              <linearGradient id="coreFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#123c3d" />
                <stop offset="100%" stopColor="#0f2b33" />
              </linearGradient>
            </defs>
            <rect width={layout.width} height={layout.height} fill="url(#grid)" />

            <g className="topo-links">
              {(() => {
                const coreNode = layout.nodes.find((node) => node.kind === "core");
                const routerNode = layout.nodes.find((node) => node.kind === "router");
                if (!coreNode || !routerNode) return null;
                return (
                  <line
                    x1={routerNode.x + routerNode.w}
                    y1={routerNode.y + routerNode.h / 2}
                    x2={coreNode.x}
                    y2={coreNode.y + coreNode.h / 2}
                  />
                );
              })()}
              {layout.nodes
                .filter((node) => node.kind === "access" && core)
                .map((node) => (
                  <line
                    key={`trunk-${node.device.id}`}
                    x1={layout.nodes[0].x + layout.nodes[0].w / 2}
                    y1={layout.nodes[0].y + layout.nodes[0].h}
                    x2={node.x + node.w / 2}
                    y2={node.y}
                  />
                ))}
              {layout.endpoints.map((endpoint) => {
                const parent = layout.nodes.find(
                  (node) => node.device.id === endpoint.deviceId,
                );
                if (!parent) return null;
                return (
                  <line
                    key={`access-${endpoint.deviceId}-${endpoint.port}`}
                    x1={parent.x + parent.w / 2}
                    y1={parent.y + parent.h}
                    x2={endpoint.x + endpoint.w / 2}
                    y2={endpoint.y}
                  />
                );
              })}
            </g>

            {access.length <= 3 &&
              layout.nodes
                .filter((node) => node.kind === "access")
                .map((node) =>
                  linkLabel(
                    (layout.nodes[0].x + layout.nodes[0].w / 2 + node.x + node.w / 2) / 2,
                    (layout.nodes[0].y + layout.nodes[0].h + node.y) / 2,
                    "Trunk 802.1Q",
                  ),
                )}

            {(() => {
              const coreNode = layout.nodes.find((node) => node.kind === "core");
              const routerNode = layout.nodes.find((node) => node.kind === "router");
              if (!coreNode || !routerNode) return null;
              return linkLabel(
                (routerNode.x + routerNode.w + coreNode.x) / 2,
                routerNode.y + routerNode.h / 2,
                "Lien routé",
              );
            })()}

            {layout.nodes.map((node) => (
              <g
                key={node.device.id}
                className={`topo-node ${node.kind} clickable ${
                  node.device.id === selected ? "selected" : ""
                }`}
                onClick={() => onSelect(node.device.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(node.device.id);
                  }
                }}
              >
                <rect x={node.x} y={node.y} width={node.w} height={node.h} rx={14} />
                <text
                  x={node.x + node.w / 2}
                  y={node.y + 31}
                  textAnchor="middle"
                  className="topo-node-title"
                >
                  {node.device.hostname}
                </text>
                <text
                  x={node.x + node.w / 2}
                  y={node.y + 51}
                  textAnchor="middle"
                  className="topo-node-sub"
                >
                  {node.kind === "core"
                    ? "Cœur · routage · DHCP"
                    : node.kind === "router"
                      ? `Routeur · ${node.device.routerIp ?? "lien routé"}`
                      : "Switch d'accès"}
                </text>
              </g>
            ))}

            {layout.endpoints.map((endpoint) => (
              <g
                key={`pc-${endpoint.deviceId}-${endpoint.port}`}
                className="topo-node pc"
              >
                <rect x={endpoint.x} y={endpoint.y} width={endpoint.w} height={endpoint.h} rx={12} />
                <text
                  x={endpoint.x + endpoint.w / 2}
                  y={endpoint.y + 24}
                  textAnchor="middle"
                  className="topo-node-title"
                >
                  {endpoint.label}
                </text>
                <text
                  x={endpoint.x + endpoint.w / 2}
                  y={endpoint.y + 42}
                  textAnchor="middle"
                  className="topo-node-sub"
                >
                  VLAN {endpoint.vlanId} · {canonIface(endpoint.port)}
                </text>
              </g>
            ))}

            <text
              x={layout.width / 2}
              y={layout.height - 26}
              textAnchor="middle"
              className="topo-foot"
            >
              {exercise.features.routing
                ? "Routage inter-VLAN assuré par le switch cœur"
                : "Topologie de commutation L2"}
              {exercise.features.dhcp ? " · DHCP centralisé" : ""}
            </text>
          </svg>
        </div>

        <div className="topo-mobile" aria-label="Topologie simplifiée">
          {exercise.devices
            .filter((entry) => entry.role === "router")
            .map((entry) => (
              <div key={entry.id}>
                <button
                  type="button"
                  className={`m-node ${selected === entry.id ? "selected" : ""}`}
                  onClick={() => onSelect(entry.id)}
                >
                  <b>{entry.hostname}</b>
                  <span>Routeur · {entry.routerIp}</span>
                </button>
                <div className="m-connector">Lien routé</div>
              </div>
            ))}

          {core && (
            <button
              type="button"
              className={`m-node core ${selected === core.id ? "selected" : ""}`}
              onClick={() => onSelect(core.id)}
            >
              <b>{core.hostname}</b>
              <span>Cœur · routage · DHCP</span>
            </button>
          )}

          <div className="m-connector">Trunk 802.1Q</div>

          <div className="m-pair">
            {access.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`m-node ${selected === entry.id ? "selected" : ""}`}
                onClick={() => onSelect(entry.id)}
              >
                <b>{entry.hostname}</b>
                <span>Switch d'accès</span>
              </button>
            ))}
          </div>

          <div className="m-connector">Access</div>

          <div className="m-pcs">
            {access.flatMap((entry) =>
              entry.accessPorts.map((port) => (
                <div key={`${entry.id}-${port.port}`} className="m-pc">
                  <b>{port.label}</b>
                  <span>
                    VLAN {port.vlanId} · {canonIface(port.port)}
                  </span>
                </div>
              )),
            )}
          </div>
        </div>

        <p className="topo-hint">
          Cliquez sur un switch pour afficher son rôle et ses ports. Les postes
          utilisent le DHCP pour obtenir leur adresse.
        </p>
      </div>

      <aside className="panel device-panel">
        <p className="eyebrow">Équipement sélectionné</p>
        <h2>{device.hostname}</h2>
        <p className="device-role">
          {device.role === "core"
            ? "Switch multicouche : routage inter-VLAN, SVI (passerelles) et serveur DHCP."
            : device.role === "router"
              ? "Routeur : lien routé vers le switch cœur et sortie par défaut (WAN/Internet)."
              : "Switch de couche 2 : ports access pour les postes, trunk 802.1Q vers le cœur et protections DHCP/ARP."}
        </p>

        <dl className="device-facts">
          {device.role === "core" ? (
            <>
              <div>
                <dt>Trunks</dt>
                <dd>
                  {access
                    .map((entry) => `${entry.corePort} → ${entry.hostname}`)
                    .join(" · ") || "—"}
                </dd>
              </div>
              <div>
                <dt>VLANs routés</dt>
                <dd>{exercise.vlans.map((vlan) => vlan.id).join(" · ")}</dd>
              </div>
              <div>
                <dt>DHCP</dt>
                <dd>
                  {exercise.features.dhcp
                    ? `${exercise.vlans.length} pools · DNS ${exercise.dns || "—"}`
                    : "non demandé"}
                </dd>
              </div>
              {router && (
                <div>
                  <dt>Liaison routeur</dt>
                  <dd>
                    {router.corePort} → {router.hostname} ({router.routerIp})
                  </dd>
                </div>
              )}
            </>
          ) : device.role === "router" ? (
            <>
              <div>
                <dt>Lien routé</dt>
                <dd>
                  {device.uplink} → {core?.hostname ?? "cœur"} ({device.corePort})
                </dd>
              </div>
              <div>
                <dt>IP routeur</dt>
                <dd>{device.routerIp || "—"}</dd>
              </div>
              <div>
                <dt>IP cœur</dt>
                <dd>{device.coreIp || "—"}</dd>
              </div>
              <div>
                <dt>Route par défaut</dt>
                <dd>{device.defaultRoute || "non demandée"}</dd>
              </div>
            </>
          ) : (
            <>
              <div>
                <dt>Uplink</dt>
                <dd>
                  {device.uplink} → {core?.hostname ?? "cœur"} (trunk)
                </dd>
              </div>
              <div>
                <dt>Ports access</dt>
                <dd>
                  {device.accessPorts
                    .map((entry) => {
                      const vlan = vlanById(exercise, entry.vlanId);
                      return `${entry.port} → ${entry.label} (VLAN ${entry.vlanId}${
                        vlan ? ` · ${vlan.label}` : ""
                      })`;
                    })
                    .join(" · ") || "—"}
                </dd>
              </div>
              <div>
                <dt>Ports inutilisés</dt>
                <dd>
                  {exercise.features.parking
                    ? `${device.unusedPorts.length} ports en VLAN ${exercise.parkingVlan} + shutdown`
                    : `${device.unusedPorts.length} ports libres`}
                </dd>
              </div>
              <div>
                <dt>Sécurité</dt>
                <dd>
                  {[
                    exercise.features.snooping ? "DHCP Snooping" : "",
                    exercise.features.dai ? "DAI" : "",
                  ]
                    .filter(Boolean)
                    .join(" + ") || "aucune"}
                  {localVlans.length > 0
                    ? ` · VLANs ${localVlans.join(", ")}`
                    : ""}
                </dd>
              </div>
            </>
          )}
        </dl>

        <div className="device-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => onConfigure(device.id)}
          >
            Configurer {device.hostname}
          </button>
        </div>

        <div className="vlan-chips">
          {exercise.vlans.map((vlan) => (
            <span key={vlan.key} className="vlan-chip" title={vlan.subnet}>
              <b>VLAN {vlan.id}</b> {vlan.label}
            </span>
          ))}
          {exercise.features.parking && (
            <span className="vlan-chip muted">
              <b>VLAN {exercise.parkingVlan}</b> parking
            </span>
          )}
        </div>
      </aside>
    </div>
  );
}
