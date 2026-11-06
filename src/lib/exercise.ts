import {
  broadcastInt,
  canonIface,
  expandInterfaceRange,
  intToIp,
  ipInNetwork,
  ipToInt,
  isIp,
  networkInt,
  parseCidr,
  prefixToMask,
} from "./net";

export type FeatureKey =
  | "routing"
  | "dhcp"
  | "snooping"
  | "dai"
  | "parking";

export const FEATURES: {
  key: FeatureKey;
  label: string;
  hint: string;
}[] = [
  {
    key: "routing",
    label: "Routage inter-VLAN",
    hint: "Le switch cœur porte les SVI et active `ip routing`.",
  },
  {
    key: "dhcp",
    label: "Serveur DHCP",
    hint: "Un pool DHCP par VLAN sur le switch cœur.",
  },
  {
    key: "snooping",
    label: "DHCP Snooping",
    hint: "Protection contre les serveurs DHCP non autorisés sur les switches d'accès.",
  },
  {
    key: "dai",
    label: "DAI",
    hint: "Dynamic ARP Inspection sur les VLANs utilisateurs.",
  },
  {
    key: "parking",
    label: "VLAN parking",
    hint: "Ports inutilisés placés dans un VLAN dédié et mis en shutdown.",
  },
];

export type Vlan = {
  key: string;
  id: number;
  label: string;
  subnet: string;
  gateway: string;
  poolStart: string;
  poolEnd: string;
};

export type AccessPort = {
  port: string;
  vlanId: number;
  label: string;
};

export type SwitchDevice = {
  id: string;
  hostname: string;
  role: "core" | "access" | "router";
  /** Port trunk côté switch d'accès (ou port LAN du routeur). */
  uplink: string;
  /** Port trunk correspondant côté switch cœur (ou port cœur vers le routeur). */
  corePort: string;
  accessPorts: AccessPort[];
  unusedPorts: string[];
  /** Routeur uniquement : réseau du lien routé vers le cœur. */
  transitSubnet?: string;
  /** Routeur uniquement : adresse IP du routeur sur ce lien. */
  routerIp?: string;
  /** Routeur uniquement : adresse IP du switch cœur sur ce lien. */
  coreIp?: string;
  /** Routeur uniquement : next-hop de la route par défaut (optionnel). */
  defaultRoute?: string;
};

export type Exercise = {
  title: string;
  module: string;
  description: string;
  dns: string;
  parkingVlan: number;
  features: Record<FeatureKey, boolean>;
  vlans: Vlan[];
  devices: SwitchDevice[];
};

export const FEATURE_DEFAULTS: Record<FeatureKey, boolean> = {
  routing: true,
  dhcp: true,
  snooping: true,
  dai: true,
  parking: true,
};

function makeVlan(key: string, id: number, label: string): Vlan {
  const base = `192.168.${id}`;
  return {
    key,
    id,
    label,
    subnet: `${base}.0/24`,
    gateway: `${base}.254`,
    poolStart: `${base}.100`,
    poolEnd: `${base}.200`,
  };
}

function range(prefix: string, from: number, to: number): string[] {
  const ports: string[] = [];
  for (let i = from; i <= to; i += 1) ports.push(`${prefix}${i}`);
  return ports;
}

export function tp5Preset(): Exercise {
  return {
    title: "TP5 — SW-L3 / SVI / DHCP",
    module: "B1M3 · Cisco · CyberSkills",
    description:
      "Switch multicouche, routage inter-VLAN, serveur DHCP, DHCP Snooping, DAI et VLAN parking.",
    dns: "1.1.1.1",
    parkingVlan: 999,
    features: { ...FEATURE_DEFAULTS },
    vlans: [
      makeVlan("a", 10, "Utilisateurs A"),
      makeVlan("b", 20, "Utilisateurs B"),
      makeVlan("c", 30, "Utilisateurs C"),
    ],
    devices: [
      {
        id: "sw-l3",
        hostname: "SW-L3",
        role: "core",
        uplink: "",
        corePort: "",
        accessPorts: [],
        unusedPorts: [],
      },
      {
        id: "sw-l2-a",
        hostname: "SW-L2-A",
        role: "access",
        uplink: "GigabitEthernet0/1",
        corePort: "GigabitEthernet0/1",
        accessPorts: [
          { port: "FastEthernet0/1", vlanId: 10, label: "PC-A" },
          { port: "FastEthernet0/2", vlanId: 20, label: "PC-B" },
        ],
        unusedPorts: range("FastEthernet0/", 3, 24),
      },
      {
        id: "sw-l2-b",
        hostname: "SW-L2-B",
        role: "access",
        uplink: "GigabitEthernet0/1",
        corePort: "GigabitEthernet0/2",
        accessPorts: [
          { port: "FastEthernet0/1", vlanId: 30, label: "PC-C" },
        ],
        unusedPorts: range("FastEthernet0/", 2, 24),
      },
    ],
  };
}

export function simplePreset(): Exercise {
  return {
    title: "Inter-VLAN — 2 switches, 2 VLANs",
    module: "B1M3 · Cisco · variante",
    description:
      "Exercice court : un switch L3, un switch d'accès, deux VLANs routés, DHCP centralisé.",
    dns: "1.1.1.1",
    parkingVlan: 999,
    features: {
      routing: true,
      dhcp: true,
      snooping: false,
      dai: false,
      parking: true,
    },
    vlans: [
      makeVlan("a", 10, "Administration"),
      makeVlan("b", 20, "Utilisateurs"),
    ],
    devices: [
      {
        id: "core",
        hostname: "SW-CORE",
        role: "core",
        uplink: "",
        corePort: "",
        accessPorts: [],
        unusedPorts: [],
      },
      {
        id: "acc-1",
        hostname: "SW-ACC-1",
        role: "access",
        uplink: "GigabitEthernet0/1",
        corePort: "GigabitEthernet0/1",
        accessPorts: [
          { port: "FastEthernet0/1", vlanId: 10, label: "PC-ADM" },
          { port: "FastEthernet0/2", vlanId: 20, label: "PC-USR" },
        ],
        unusedPorts: range("FastEthernet0/", 3, 24),
      },
    ],
  };
}

export const PRESETS: { id: string; label: string; build: () => Exercise }[] = [
  { id: "tp5", label: "TP5 — L3 / SVI / DHCP", build: tp5Preset },
  { id: "simple", label: "Variante — 2 VLANs", build: simplePreset },
];

export function coreDevice(exercise: Exercise): SwitchDevice | undefined {
  return exercise.devices.find((device) => device.role === "core");
}

export function accessDevices(exercise: Exercise): SwitchDevice[] {
  return exercise.devices.filter((device) => device.role === "access");
}

export function routerDevice(exercise: Exercise): SwitchDevice | undefined {
  return exercise.devices.find((device) => device.role === "router");
}

export function deviceById(
  exercise: Exercise,
  id: string,
): SwitchDevice | undefined {
  return exercise.devices.find((device) => device.id === id);
}

export function allVlanIds(exercise: Exercise): number[] {
  return exercise.vlans.map((vlan) => vlan.id);
}

export function vlanById(exercise: Exercise, id: number): Vlan | undefined {
  return exercise.vlans.find((vlan) => vlan.id === id);
}

export function vlanMask(vlan: Vlan): string {
  const parsed = parseCidr(vlan.subnet);
  return parsed ? prefixToMask(parsed.prefix) : "255.255.255.0";
}

export function vlanNetwork(vlan: Vlan): string {
  return parseCidr(vlan.subnet)?.network ?? vlan.subnet;
}

export function vlanBroadcast(vlan: Vlan): string {
  const parsed = parseCidr(vlan.subnet);
  if (!parsed) return vlan.subnet;
  return intToIp(broadcastInt(parsed.network, parsed.prefix));
}

export function excludedLow(vlan: Vlan): [string, string] | null {
  const parsed = parseCidr(vlan.subnet);
  const start = ipToInt(vlan.poolStart);
  if (!parsed || start === null) return null;
  const first = (networkInt(parsed.network, parsed.prefix) + 1) >>> 0;
  const last = (start - 1) >>> 0;
  if (last < first) return null;
  return [intToIp(first), intToIp(last)];
}

export function excludedHigh(vlan: Vlan): [string, string] | null {
  const parsed = parseCidr(vlan.subnet);
  const end = ipToInt(vlan.poolEnd);
  if (!parsed || end === null) return null;
  const first = (end + 1) >>> 0;
  const last = (broadcastInt(parsed.network, parsed.prefix) - 1) >>> 0;
  if (last < first) return null;
  return [intToIp(first), intToIp(last)];
}

export function localVlanIds(device: SwitchDevice): number[] {
  return [...new Set(device.accessPorts.map((entry) => entry.vlanId))].sort(
    (a, b) => a - b,
  );
}

/** "FastEthernet0/1-24, FastEthernet0/26" -> liste de ports unitaires. */
export function parseUnusedPorts(text: string): string[] {
  const ports: string[] = [];
  for (const part of text.split(/[,\n;]/)) {
    const clean = part.trim();
    if (!clean) continue;
    const expanded = expandInterfaceRange(clean);
    if (expanded.length > 0) ports.push(...expanded);
  }
  return [...new Set(ports)];
}

/** Regroupe des ports contigus : fa0/3…fa0/24 -> "FastEthernet0/3-24". */
export function compressPorts(ports: string[]): string {
  if (ports.length === 0) return "";
  const groups = new Map<string, number[]>();
  const display = new Map<string, string>();
  for (const port of ports) {
    const canon = canonIface(port);
    const match = canon.match(/^([a-z-]+)(\d+\/)(\d+)$/);
    if (!match) continue;
    const key = `${match[1]}${match[2]}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(Number(match[3]));
    if (!display.has(key)) {
      const original = port.match(/^([A-Za-z-]+\d+\/)/);
      display.set(key, original ? original[1] : `${match[1]}${match[2]}`);
    }
  }
  const parts: string[] = [];
  for (const [key, numbers] of groups) {
    const sorted = [...numbers].sort((a, b) => a - b);
    let start = sorted[0];
    let prev = sorted[0];
    for (let i = 1; i <= sorted.length; i += 1) {
      const current = sorted[i];
      if (current !== prev + 1) {
        const prefix = display.get(key) ?? key;
        parts.push(
          start === prev ? `${prefix}${start}` : `${prefix}${start}-${prev}`,
        );
        start = current;
      }
      prev = current;
    }
  }
  return parts.join(", ");
}

/** Lignes "Fa0/1 = 10 = PC-A" -> accessPorts. */
export function parseAccessPorts(text: string): {
  ports: AccessPort[];
  errors: string[];
} {
  const ports: AccessPort[] = [];
  const errors: string[] = [];
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    const clean = line.trim();
    if (!clean) return;
    const parts = clean.split(/\s*[=;|]\s*|\s+/).filter(Boolean);
    if (parts.length < 2) {
      errors.push(`Ligne ${index + 1} : format attendu « Fa0/1 = 10 = PC-A ».`);
      return;
    }
    const [port, vlanRaw, ...labelParts] = parts;
    const vlanId = Number(vlanRaw);
    if (!Number.isInteger(vlanId)) {
      errors.push(`Ligne ${index + 1} : « ${vlanRaw} » n'est pas un ID VLAN.`);
      return;
    }
    ports.push({
      port,
      vlanId,
      label: labelParts.join(" ") || port,
    });
  });
  return { ports, errors };
}

export function formatAccessPorts(ports: AccessPort[]): string {
  return ports
    .map((entry) => `${canonIface(entry.port)} = ${entry.vlanId} = ${entry.label}`)
    .join("\n");
}

export function normalizeExercise(raw: unknown): Exercise {
  if (!raw || typeof raw !== "object") {
    throw new Error("Le JSON doit contenir un objet exercice.");
  }
  const data = raw as Record<string, unknown>;
  if (typeof data.title !== "string" || !data.title.trim()) {
    throw new Error("Champ « title » manquant.");
  }
  if (!Array.isArray(data.vlans) || data.vlans.length === 0) {
    throw new Error("Champ « vlans » manquant ou vide.");
  }
  if (!Array.isArray(data.devices) || data.devices.length === 0) {
    throw new Error("Champ « devices » manquant ou vide.");
  }

  const vlans: Vlan[] = (data.vlans as Record<string, unknown>[]).map(
    (entry, index) => ({
      key: String(entry.key ?? `v${index}-${Date.now()}`),
      id: Number(entry.id ?? 0),
      label: String(entry.label ?? `VLAN ${entry.id ?? ""}`),
      subnet: String(entry.subnet ?? ""),
      gateway: String(entry.gateway ?? ""),
      poolStart: String(entry.poolStart ?? ""),
      poolEnd: String(entry.poolEnd ?? ""),
    }),
  );

  const devices: SwitchDevice[] = (data.devices as Record<string, unknown>[]).map(
    (entry, index) => {
      const role =
        entry.role === "core" || entry.role === "router" || entry.role === "access"
          ? entry.role
          : "access";
      return {
        id: String(entry.id ?? `dev-${index}`),
        hostname: String(entry.hostname ?? `DEVICE-${index + 1}`),
        role,
        uplink: String(entry.uplink ?? ""),
        corePort: String(entry.corePort ?? ""),
        accessPorts: Array.isArray(entry.accessPorts)
          ? (entry.accessPorts as Record<string, unknown>[]).map((port) => ({
              port: String(port.port ?? ""),
              vlanId: Number(port.vlanId ?? 0),
              label: String(port.label ?? port.port ?? ""),
            }))
          : [],
        unusedPorts: Array.isArray(entry.unusedPorts)
          ? (entry.unusedPorts as unknown[]).map((port) => String(port))
          : [],
        transitSubnet:
          entry.transitSubnet === undefined
            ? undefined
            : String(entry.transitSubnet),
        routerIp:
          entry.routerIp === undefined ? undefined : String(entry.routerIp),
        coreIp: entry.coreIp === undefined ? undefined : String(entry.coreIp),
        defaultRoute:
          entry.defaultRoute === undefined
            ? undefined
            : String(entry.defaultRoute),
      };
    },
  );

  if (devices.filter((device) => device.role === "core").length !== 1) {
    throw new Error("L'exercice doit contenir exactement un switch cœur.");
  }

  const features = {
    ...FEATURE_DEFAULTS,
    ...(typeof data.features === "object" && data.features
      ? (data.features as Partial<Record<FeatureKey, boolean>>)
      : {}),
  };

  return {
    title: data.title,
    module: typeof data.module === "string" ? data.module : "Lab Cisco",
    description:
      typeof data.description === "string" ? data.description : "",
    dns: typeof data.dns === "string" ? data.dns : "1.1.1.1",
    parkingVlan: Number(data.parkingVlan ?? 999),
    features,
    vlans,
    devices,
  };
}

export function validateExercise(exercise: Exercise): string[] {
  const errors: string[] = [];
  if (!exercise.title.trim()) errors.push("Le titre de l'exercice est vide.");
  if (exercise.vlans.length === 0) errors.push("Ajoutez au moins un VLAN.");

  const ids = new Set<number>();
  for (const vlan of exercise.vlans) {
    if (!Number.isInteger(vlan.id) || vlan.id < 1 || vlan.id > 4094) {
      errors.push(`VLAN « ${vlan.label} » : l'ID doit être entre 1 et 4094.`);
    }
    if (vlan.id === exercise.parkingVlan && exercise.features.parking) {
      errors.push(
        `VLAN « ${vlan.label} » : l'ID ${vlan.id} est déjà utilisé par le VLAN parking.`,
      );
    }
    if (ids.has(vlan.id)) errors.push(`L'ID VLAN ${vlan.id} est utilisé deux fois.`);
    ids.add(vlan.id);

    const parsed = parseCidr(vlan.subnet);
    if (!parsed) {
      errors.push(`VLAN ${vlan.id} : réseau « ${vlan.subnet} » invalide (attendu 192.168.10.0/24).`);
      continue;
    }
    if (
      vlan.gateway.trim() &&
      (!isIp(vlan.gateway) ||
        !ipInNetwork(vlan.gateway, parsed.network, parsed.prefix))
    ) {
      errors.push(`VLAN ${vlan.id} : la passerelle ${vlan.gateway} est hors du réseau ${vlan.subnet}.`);
    }
    const start = ipToInt(vlan.poolStart);
    const end = ipToInt(vlan.poolEnd);
    if (vlan.poolStart.trim() && (start === null || !ipInNetwork(vlan.poolStart, parsed.network, parsed.prefix))) {
      errors.push(`VLAN ${vlan.id} : début de pool hors du réseau.`);
    }
    if (vlan.poolEnd.trim() && (end === null || !ipInNetwork(vlan.poolEnd, parsed.network, parsed.prefix))) {
      errors.push(`VLAN ${vlan.id} : fin de pool hors du réseau.`);
    }
    if (start !== null && end !== null && start > end) {
      errors.push(`VLAN ${vlan.id} : le début du pool est après la fin.`);
    }
  }

  const cores = exercise.devices.filter((device) => device.role === "core");
  if (cores.length !== 1) {
    errors.push("Il faut exactement un switch cœur (rôle « core »).");
  }
  if (accessDevices(exercise).length === 0) {
    errors.push("Ajoutez au moins un switch d'accès.");
  }
  const routers = exercise.devices.filter((device) => device.role === "router");
  if (routers.length > 1) {
    errors.push("Un seul routeur est pris en charge pour le moment.");
  }

  const hostnames = new Set<string>();
  const corePorts = new Set<string>();
  for (const device of exercise.devices) {
    if (!device.hostname.trim()) errors.push("Un équipement n'a pas de hostname.");
    if (hostnames.has(device.hostname.toLowerCase())) {
      errors.push(`Hostname en double : ${device.hostname}.`);
    }
    hostnames.add(device.hostname.toLowerCase());

    if (device.role === "access") {
      if (!device.uplink.trim()) {
        errors.push(`${device.hostname} : port uplink manquant.`);
      }
      if (!device.corePort.trim()) {
        errors.push(`${device.hostname} : port côté cœur manquant.`);
      }
      if (corePorts.has(canonIface(device.corePort))) {
        errors.push(`Le port cœur ${device.corePort} est utilisé par deux switches.`);
      }
      corePorts.add(canonIface(device.corePort));
      for (const entry of device.accessPorts) {
        if (!exercise.vlans.some((vlan) => vlan.id === entry.vlanId)) {
          errors.push(`${device.hostname} : le port ${entry.port} pointe vers le VLAN ${entry.vlanId}, qui n'existe pas.`);
        }
      }
      const accessSet = new Set(device.accessPorts.map((entry) => canonIface(entry.port)));
      if (accessSet.has(canonIface(device.uplink))) {
        errors.push(`${device.hostname} : l'uplink est aussi déclaré port access.`);
      }
    }

    if (device.role === "router") {
      if (!device.uplink.trim()) {
        errors.push(`${device.hostname} : port LAN du routeur manquant.`);
      }
      if (!device.corePort.trim()) {
        errors.push(`${device.hostname} : port côté cœur manquant.`);
      }
      if (corePorts.has(canonIface(device.corePort))) {
        errors.push(`Le port cœur ${device.corePort} est utilisé par deux équipements.`);
      }
      corePorts.add(canonIface(device.corePort));

      const parsed = parseCidr(device.transitSubnet ?? "");
      if (!parsed) {
        errors.push(`${device.hostname} : réseau de transit invalide (ex. 10.0.0.0/30).`);
      } else {
        for (const [label, value] of [
          ["IP routeur", device.routerIp ?? ""],
          ["IP cœur", device.coreIp ?? ""],
        ] as const) {
          if (!isIp(value) || !ipInNetwork(value, parsed.network, parsed.prefix)) {
            errors.push(`${device.hostname} : ${label} « ${value} » hors du réseau ${device.transitSubnet}.`);
          }
        }
        if (
          device.routerIp &&
          device.coreIp &&
          device.routerIp === device.coreIp
        ) {
          errors.push(`${device.hostname} : l'IP routeur et l'IP cœur sont identiques.`);
        }
      }
      if (device.defaultRoute?.trim() && !isIp(device.defaultRoute)) {
        errors.push(`${device.hostname} : next-hop de route par défaut invalide.`);
      }
    }
  }

  if (exercise.features.dhcp) {
    for (const vlan of exercise.vlans) {
      if (!vlan.poolStart.trim() || !vlan.poolEnd.trim()) {
        errors.push(`VLAN ${vlan.id} : plage DHCP incomplète.`);
      }
      if (!vlan.gateway.trim() && !exercise.features.routing) {
        errors.push(`VLAN ${vlan.id} : passerelle manquante pour annoncer le default-router DHCP.`);
      }
    }
  }
  if (exercise.features.routing) {
    for (const vlan of exercise.vlans) {
      if (!vlan.gateway.trim()) {
        errors.push(`VLAN ${vlan.id} : passerelle manquante pour le routage inter-VLAN.`);
      }
    }
  }
  return errors;
}
