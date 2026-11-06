import {
  AccessPort,
  Exercise,
  FEATURE_DEFAULTS,
  FeatureKey,
  SwitchDevice,
  Vlan,
  parseUnusedPorts,
} from "./exercise";
import { parseCidr } from "./net";

export type PdfAnalysis = {
  exercise: Exercise;
  notes: string[];
  text: string;
  fileName: string;
};

/** Extrait le texte d'un PDF via pdf.js (aucun envoi sur un serveur). */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data }).promise;
  const chunks: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    let line = "";
    for (const item of content.items) {
      if ("str" in item) {
        line += item.str;
        line += item.hasEOL ? "\n" : " ";
      }
    }
    chunks.push(line.replace(/[ \t]+/g, " ").trim());
  }

  await document.cleanup();
  return chunks.join("\n\n");
}

function cleanTitle(fileName: string): string {
  return fileName
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function titleFromText(text: string, fileName: string): string {
  const match = text.match(
    /T[DP]\s*\/?\s*TP\s*(\d{1,2})\s*[-–]?\s*CISCO\s*\n?\s*([^\n]{3,60})/i,
  );
  if (match) {
    const topic = match[2].replace(/\s+/g, " ").trim();
    return `TP${match[1]} — ${topic}`;
  }
  return cleanTitle(fileName) || "Exercice importé";
}

function detectFeatures(text: string): Record<FeatureKey, boolean> {
  return {
    ...FEATURE_DEFAULTS,
    routing: /\b(routage|inter[\s-]?vlan|ip routing|svi)\b/i.test(text),
    dhcp: /\bdhcp\b/i.test(text),
    snooping: /snooping/i.test(text),
    dai: /\bdai\b|arp\s+inspection/i.test(text),
    parking: /\bparking\b|vlan\s*999/i.test(text),
  };
}

function detectParking(text: string): number {
  const match = text.match(/\bparking\b[\s\S]{0,40}?\b(\d{1,4})\b/i);
  if (match) return Number(match[1]);
  const vlan999 = text.match(/\bvlan\s*(999)\b/i);
  if (vlan999) return Number(vlan999[1]);
  return 999;
}

function windowAround(text: string, index: number, radius = 280): string {
  return text.slice(Math.max(0, index - 120), Math.min(text.length, index + radius));
}

type VlanDetection = {
  id: number;
  subnet: string;
  gateway: string;
  poolStart: string;
  poolEnd: string;
  guessed: boolean;
};

function guessVlan(
  text: string,
  index: number,
  id: number,
  usedSubnets: Set<string>,
): VlanDetection {
  const window = windowAround(text, index);
  let subnet: string | null = null;
  let gateway = "";

  const cidr = window.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\s*\/\s*(\d{1,2})\b/);
  const ipMask = window.match(
    /\b(\d{1,3}(?:\.\d{1,3}){3})\s+(255(?:\.\d{1,3}){3})\b/,
  );
  const bareIp = window.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);

  if (ipMask) {
    const parsed = ipToSubnet(ipMask[1], ipMask[2]);
    if (parsed) subnet = parsed;
  } else if (cidr) {
    const parsed = parseCidr(`${cidr[1]}/${cidr[2]}`);
    if (parsed) subnet = `${parsed.network}/${parsed.prefix}`;
  } else if (bareIp) {
    const parsed = parseCidr(`${bareIp[1]}/24`);
    if (parsed) subnet = `${parsed.network}/24`;
  }

  if (subnet && usedSubnets.has(subnet)) subnet = null;
  const guessed = !subnet;
  if (!subnet) {
    const third = id <= 254 ? id : 100 + id;
    subnet = `192.168.${third}.0/24`;
  }
  usedSubnets.add(subnet);

  const parsed = parseCidr(subnet)!;
  if (!gateway) {
    const prefixParts = parsed.network.split(".").slice(0, 3).join("\\.");
    const ipCandidate = window.match(
      new RegExp(`\\b(${prefixParts}\\.(?:1|254|253|250))\\b`),
    );
    gateway = ipCandidate?.[1] ?? nextIp(parsed.network, parsed.prefix >= 30 ? 1 : 254);
  }

  const range = window.match(
    /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.(?:100|101|50|10)\b[\s\S]{0,20}?(?:-|–|à|au|to)\s*(?:\d{1,3}\.\d{1,3}\.\d{1,3}\.)?(\d{1,3})\b/i,
  );
  const base = parsed.network.split(".").slice(0, 3).join(".");
  const poolStart = `${base}.100`;
  const poolEnd = range?.[1] ? `${base}.${range[1]}` : `${base}.200`;

  return {
    id,
    subnet,
    gateway,
    poolStart,
    poolEnd,
    guessed,
  };
}

function ipToSubnet(ip: string, mask: string): string | null {
  const parts = ip.split(".").map(Number);
  const maskParts = mask.split(".").map(Number);
  if (parts.length !== 4 || maskParts.length !== 4) return null;
  let prefix = 0;
  for (const part of maskParts) {
    if (part === 255) prefix += 8;
    else if (part === 254) prefix += 7;
    else if (part === 252) prefix += 6;
    else if (part === 248) prefix += 5;
    else if (part === 240) prefix += 4;
    else if (part === 224) prefix += 3;
    else if (part === 192) prefix += 2;
    else if (part === 128) prefix += 1;
  }
  if (prefix < 8 || prefix > 30) return null;
  const network = parts
    .map((part, index) => part & maskParts[index])
    .join(".");
  const parsed = parseCidr(`${network}/${prefix}`);
  return parsed ? `${parsed.network}/${parsed.prefix}` : null;
}

function nextIp(network: string, host: number): string {
  const parts = network.split(".").map(Number);
  return `${parts[0]}.${parts[1]}.${parts[2]}.${host}`;
}

function detectVlans(text: string, parking: number): {
  vlans: Vlan[];
  notes: string[];
} {
  const notes: string[] = [];
  const matches = [...text.matchAll(/\bvlan\s*(\d{1,4})\b/gi)];
  const seen = new Set<number>();
  const usedSubnets = new Set<string>();
  const detections: VlanDetection[] = [];

  for (const match of matches) {
    const id = Number(match[1]);
    if (!Number.isInteger(id) || id < 1 || id > 4094) continue;
    if (id === parking) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    detections.push(
      guessVlan(text, match.index ?? 0, id, usedSubnets),
    );
  }

  if (detections.length === 0) {
    const pcs = detectPcCount(text);
    const count = pcs >= 2 ? Math.min(pcs, 6) : 2;
    const ids = Array.from({ length: count }, (_, index) => (index + 1) * 10);
    notes.push(
      pcs >= 2
        ? `Aucun ID VLAN explicite : ${count} VLANs (${ids.join(", ")}) déduits des postes détectés.`
        : "Aucun VLAN détecté dans le texte : deux VLANs d'exemple (10 et 20) sont proposés.",
    );
    for (const id of ids) {
      detections.push(guessVlan(text, 0, id, usedSubnets));
    }
  }

  const guessed = detections.filter((entry) => entry.guessed);
  if (guessed.length > 0) {
    notes.push(
      `Réseau non trouvé pour ${guessed.map((entry) => `VLAN ${entry.id}`).join(", ")} — adressage 192.168.<id>.0/24 proposé.`,
    );
  }

  const vlans: Vlan[] = detections
    .sort((a, b) => a.id - b.id)
    .map((entry, index) => ({
      key: `v${entry.id}-${index}`,
      id: entry.id,
      label: `VLAN ${entry.id}`,
      subnet: entry.subnet,
      gateway: entry.gateway,
      poolStart: entry.poolStart,
      poolEnd: entry.poolEnd,
    }));

  return { vlans, notes };
}

function detectPcCount(text: string): number {
  const found = new Set<string>();
  for (const match of text.matchAll(/\bPC[- ]?([A-Z0-9]{1,3})\b/g)) {
    found.add(match[1]);
  }
  return found.size;
}

function detectHostnames(text: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /\bSW[-_ ]?[A-Z0-9]{1,10}(?:[-_ ][A-Z0-9]{1,10})?\b/g,
    /\bR\d{1,2}\b/g,
    /\bRTR[-_ ]?[A-Z0-9]{1,6}\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const token = match[0].replace(/\s+/g, "-").replace(/_/g, "-");
      if (token.length > 2) found.add(token.toUpperCase());
    }
  }
  return [...found];
}

function detectDevices(
  text: string,
  vlans: Vlan[],
  notes: string[],
): SwitchDevice[] {
  const names = detectHostnames(text);
  let accessNames = names.filter(
    (name) => name.startsWith("SW") && !/L3|CORE|CŒUR/i.test(name),
  );
  if (
    accessNames.length === 1 &&
    /^SW[-]?L2$/.test(accessNames[0]) &&
    /\bles\s+SW[-]?L2\b/i.test(text)
  ) {
    accessNames = ["SW-L2-A", "SW-L2-B"];
  }
  const coreName =
    names.find((name) => /L3|CORE|CŒUR/i.test(name)) ?? "SW-L3";
  const wantsRouter =
    /\brouteur\b|route par défaut|default route|\bR\d{1,2}\b/i.test(text);
  const routerName = names.find((name) => /^R\d|^RTR/.test(name)) ?? "R1";

  const access = accessNames.length > 0 ? accessNames : ["SW-L2-A"];
  if (accessNames.length === 0) {
    notes.push("Aucun switch d'accès détecté : « SW-L2-A » est proposé.");
  }

  const usedNames = new Set<string>([coreName.toUpperCase()]);
  const devices: SwitchDevice[] = [
    {
      id: "core",
      hostname: coreName,
      role: "core",
      uplink: "",
      corePort: "",
      accessPorts: [],
      unusedPorts: [],
    },
  ];

  let pcIndex = 0;
  access.forEach((name, index) => {
    if (usedNames.has(name.toUpperCase())) return;
    usedNames.add(name.toUpperCase());
    const myVlans = vlans.filter(
      (_, vlanIndex) =>
        Math.min(
          access.length - 1,
          Math.floor((vlanIndex * access.length) / vlans.length),
        ) === index,
    );
    const ports: AccessPort[] = myVlans.map((vlan, portIndex) => {
      const label = `PC-${String.fromCharCode(65 + pcIndex)}`;
      pcIndex += 1;
      return {
        port: `FastEthernet0/${portIndex + 1}`,
        vlanId: vlan.id,
        label,
      };
    });
    devices.push({
      id: `access-${index + 1}`,
      hostname: name,
      role: "access",
      uplink: "GigabitEthernet0/1",
      corePort: `GigabitEthernet0/${index + 1}`,
      accessPorts: ports,
      unusedPorts: parseUnusedPorts(`FastEthernet0/${ports.length + 1}-24`),
    });
  });

  if (access.length > 0) {
    notes.push(
      "Ports access proposés automatiquement (PC-A, PC-B…) : vérifiez la répartition des VLANs dans l'onglet Exercice.",
    );
  }

  if (wantsRouter) {
    devices.push({
      id: "router-1",
      hostname: routerName,
      role: "router",
      uplink: "GigabitEthernet0/0",
      corePort: `GigabitEthernet0/${access.length + 1}`,
      accessPorts: [],
      unusedPorts: [],
      transitSubnet: "10.0.0.0/30",
      routerIp: "10.0.0.1",
      coreIp: "10.0.0.2",
      defaultRoute: "",
    });
    notes.push(
      "Routeur détecté : lien de transit 10.0.0.0/30 proposé (modifiable).",
    );
  }

  return devices;
}

/** Analyse le texte d'un PDF et propose un exercice complet, éditable ensuite. */
export function analysePdf(text: string, fileName: string): PdfAnalysis {
  const notes: string[] = [];
  const parking = detectParking(text);
  const features = detectFeatures(text);
  const { vlans, notes: vlanNotes } = detectVlans(text, parking);
  notes.push(...vlanNotes);
  const devices = detectDevices(text, vlans, notes);

  if (features.snooping || features.dai) {
    notes.push(
      "Fonctions DHCP Snooping / DAI détectées : activez-les si l'énoncé les demande réellement.",
    );
  }

  const vlanCount = vlans.length;
  notes.unshift(
    `${vlanCount} VLAN${vlanCount > 1 ? "s" : ""} détecté${vlanCount > 1 ? "s" : ""} · ${devices.length} équipement${devices.length > 1 ? "s" : ""} proposé${devices.length > 1 ? "s" : ""}.`,
  );

  const moduleMatch = text.match(/\bB\dM\d\b/i);

  return {
    exercise: {
      title: titleFromText(text, fileName),
      module: moduleMatch ? `${moduleMatch[0].toUpperCase()} · Import PDF` : "Import PDF",
      description: "Exercice extrait d'un PDF — vérifiez l'adressage et les ports.",
      dns: "1.1.1.1",
      parkingVlan: parking,
      features,
      vlans,
      devices,
    },
    notes,
    text,
    fileName,
  };
}

export function pdfTextPreview(text: string, max = 1800): string {
  const cleaned = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}\n…` : cleaned;
}
