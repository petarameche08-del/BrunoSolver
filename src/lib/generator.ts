import {
  Exercise,
  SwitchDevice,
  accessDevices,
  allVlanIds,
  coreDevice,
  deviceById,
  excludedHigh,
  excludedLow,
  localVlanIds,
  routerDevice,
  vlanById,
  vlanMask,
  vlanNetwork,
} from "./exercise";
import { canonIface, intToIp, networkInt, parseCidr, prefixToMask } from "./net";

function sanitizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function vlanName(exercise: Exercise, id: number): string {
  const vlan = vlanById(exercise, id);
  return vlan ? sanitizeName(vlan.label) : `VLAN_${id}`;
}

function vlanHeader(exercise: Exercise, out: string[]): void {
  const ids = allVlanIds(exercise);
  if (exercise.features.parking) ids.push(exercise.parkingVlan);
  for (const id of ids) {
    out.push(`vlan ${id}`);
    out.push(
      ` name ${id === exercise.parkingVlan && exercise.features.parking ? "PARKING" : vlanName(exercise, id)}`,
    );
  }
}

function coreConfig(exercise: Exercise): string {
  const core = coreDevice(exercise)!;
  const router = routerDevice(exercise);
  const ids = allVlanIds(exercise);
  const out: string[] = [];
  out.push("! ============================================================");
  out.push(`! ${core.hostname} — Cœur de réseau`);
  out.push("! Généré par l'assistant d'exercices");
  out.push("! ============================================================");
  out.push(`hostname ${core.hostname}`);
  out.push("no ip domain-lookup");
  out.push("!");
  if (exercise.features.routing) {
    out.push("! Routage inter-VLAN");
    out.push("ip routing");
    out.push("!");
  }
  out.push("! Création des VLANs");
  vlanHeader(exercise, out);
  out.push("!");
  out.push("! Trunks 802.1Q vers les switches d'accès");
  for (const access of accessDevices(exercise)) {
    out.push(`interface ${access.corePort}`);
    out.push(` description Vers ${access.hostname} (trunk 802.1Q)`);
    out.push(" switchport trunk encapsulation dot1q");
    out.push(" switchport mode trunk");
    out.push(` switchport trunk allowed vlan ${ids.join(",")}`);
    out.push("!");
  }
  if (exercise.features.routing) {
    out.push("! SVI = passerelles par défaut des VLANs");
    for (const vlan of exercise.vlans) {
      out.push(`interface Vlan${vlan.id}`);
      out.push(` description Passerelle VLAN ${vlan.id} — ${vlan.label}`);
      out.push(` ip address ${vlan.gateway} ${vlanMask(vlan)}`);
      out.push(" no shutdown");
      out.push("!");
    }
  }
  if (router) {
    const parsed = parseCidr(router.transitSubnet ?? "");
    const mask = parsed ? prefixToMask(parsed.prefix) : "255.255.255.252";
    out.push("! Lien routé vers le routeur");
    out.push(`interface ${router.corePort}`);
    out.push(` description Vers ${router.hostname} (lien routé)`);
    out.push(` ip address ${router.coreIp} ${mask}`);
    out.push(" no shutdown");
    out.push("!");
  }
  if (router?.defaultRoute?.trim()) {
    out.push("! Route par défaut vers le routeur");
    out.push(`ip route 0.0.0.0 0.0.0.0 ${router.routerIp}`);
    out.push("!");
  }
  if (exercise.features.dhcp) {
    out.push("! Adresses exclues de la distribution DHCP");
    for (const vlan of exercise.vlans) {
      const low = excludedLow(vlan);
      if (low) out.push(`ip dhcp excluded-address ${low[0]} ${low[1]}`);
      const high = excludedHigh(vlan);
      if (high) out.push(`ip dhcp excluded-address ${high[0]} ${high[1]}`);
    }
    out.push("!");
    out.push("! Pools DHCP (un par VLAN)");
    for (const vlan of exercise.vlans) {
      out.push(`ip dhcp pool VLAN${vlan.id}`);
      out.push(` network ${vlanNetwork(vlan)} ${vlanMask(vlan)}`);
      out.push(` default-router ${vlan.gateway}`);
      if (exercise.dns.trim()) out.push(` dns-server ${exercise.dns.trim()}`);
    }
  }
  out.push("!");
  out.push("end");
  return out.join("\n");
}

function parkingRange(ports: string[]): string {
  const first = canonIface(ports[0]);
  const last = canonIface(ports[ports.length - 1]);
  const matchFirst = first.match(/^([a-z-]+)(\d+\/)(\d+)$/);
  const matchLast = last.match(/^([a-z-]+)(\d+\/)(\d+)$/);
  if (matchFirst && matchLast && matchFirst[1] === matchLast[1]) {
    return matchFirst[3] === matchLast[3]
      ? first
      : `${first}-${matchLast[3]}`;
  }
  return ports.map((port) => canonIface(port)).join(",");
}

function accessConfig(exercise: Exercise, device: SwitchDevice): string {
  const ids = allVlanIds(exercise);
  const local = localVlanIds(device);
  const snoopingIds = local.length > 0 ? local : ids;
  const out: string[] = [];
  out.push("! ============================================================");
  out.push(`! ${device.hostname} — Switch d'accès`);
  out.push("! Généré par l'assistant d'exercices");
  out.push("! ============================================================");
  out.push(`hostname ${device.hostname}`);
  out.push("no ip domain-lookup");
  out.push("!");
  out.push("! Tous les VLANs sont créés sur tous les switches");
  vlanHeader(exercise, out);
  out.push("!");
  if (exercise.features.snooping || exercise.features.dai) {
    out.push("! Sécurisation DHCP / ARP");
    if (exercise.features.snooping) {
      out.push("ip dhcp snooping");
      out.push(`ip dhcp snooping vlan ${snoopingIds.join(",")}`);
    }
    if (exercise.features.dai) {
      out.push(`ip arp inspection vlan ${snoopingIds.join(",")}`);
    }
    out.push("!");
  }
  out.push(`interface ${device.uplink}`);
  out.push(` description Vers ${coreDevice(exercise)?.hostname ?? "cœur"} (trunk 802.1Q)`);
  out.push(" switchport mode trunk");
  out.push(` switchport trunk allowed vlan ${ids.join(",")}`);
  if (exercise.features.snooping) out.push(" ip dhcp snooping trust");
  if (exercise.features.dai) out.push(" ip arp inspection trust");
  out.push("!");
  if (device.accessPorts.length > 0) {
    out.push("! Ports Access des PC");
    for (const entry of device.accessPorts) {
      out.push(`interface ${entry.port}`);
      out.push(` description ${entry.label} (VLAN ${entry.vlanId})`);
      out.push(" switchport mode access");
      out.push(` switchport access vlan ${entry.vlanId}`);
      out.push("!");
    }
  }
  if (exercise.features.parking && device.unusedPorts.length > 0) {
    out.push("! Ports inutilisés : VLAN parking + arrêt administratif");
    out.push(`interface range ${parkingRange(device.unusedPorts)}`);
    out.push(" description Ports inutilisés — VLAN parking");
    out.push(" switchport mode access");
    out.push(` switchport access vlan ${exercise.parkingVlan}`);
    out.push(" shutdown");
    out.push("!");
  }
  out.push("end");
  return out.join("\n");
}

function routerConfig(exercise: Exercise, device: SwitchDevice): string {
  const parsed = parseCidr(device.transitSubnet ?? "");
  const mask = parsed ? prefixToMask(parsed.prefix) : "255.255.255.252";
  const out: string[] = [];
  out.push("! ============================================================");
  out.push(`! ${device.hostname} — Routeur`);
  out.push("! Généré par l'assistant d'exercices");
  out.push("! ============================================================");
  out.push(`hostname ${device.hostname}`);
  out.push("no ip domain-lookup");
  out.push("!");
  out.push("! Lien routé vers le switch cœur");
  out.push(`interface ${device.uplink}`);
  out.push(` description Vers ${coreDevice(exercise)?.hostname ?? "cœur"} (lien routé)`);
  out.push(` ip address ${device.routerIp} ${mask}`);
  out.push(" no shutdown");
  out.push("!");
  if (device.defaultRoute?.trim()) {
    out.push("! Route par défaut (sortie Internet / WAN)");
    out.push(`ip route 0.0.0.0 0.0.0.0 ${device.defaultRoute.trim()}`);
    out.push("!");
  }
  out.push("end");
  return out.join("\n");
}

export function buildConfig(exercise: Exercise, deviceId: string): string {
  const device = deviceById(exercise, deviceId);
  if (!device) return "";
  if (device.role === "core") return coreConfig(exercise);
  if (device.role === "router") return routerConfig(exercise, device);
  return accessConfig(exercise, device);
}

export function buildAnswerKey(exercise: Exercise): Record<string, string> {
  const result: Record<string, string> = {};
  for (const device of exercise.devices) {
    result[device.id] = buildConfig(exercise, device.id);
  }
  return result;
}

function randomOf<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function removeLine(text: string, predicate: (line: string) => boolean): string {
  return text
    .split("\n")
    .filter((line) => !predicate(line))
    .join("\n");
}

export function makeBroken(
  exercise: Exercise,
  deviceId: string,
): { text: string; hint: string } {
  const device = deviceById(exercise, deviceId);
  if (!device) return { text: "", hint: "" };
  const good = buildConfig(exercise, deviceId);
  const ids = allVlanIds(exercise);

  type Fault = { kind: string; hint: string };
  const faults: Fault[] = [];

  if (device.role === "core") {
    if (exercise.features.routing) {
      faults.push({
        kind: "no-routing",
        hint: "Le routage inter-VLAN n'est pas activé sur le switch L3.",
      });
      faults.push({
        kind: "svi-down",
        hint: "Une des interfaces SVI est restée en état administratif down.",
      });
    }
    if (exercise.features.dhcp) {
      faults.push({
        kind: "pool-gateway",
        hint: "Un pool DHCP annonce une passerelle qui n'est pas celle du VLAN.",
      });
    }
    if (ids.length >= 2) {
      faults.push({
        kind: "trunk-vlan",
        hint: "Un trunk n'autorise pas tous les VLANs nécessaires.",
      });
    }
    const router = exercise.devices.find((entry) => entry.role === "router");
    if (router?.defaultRoute?.trim()) {
      faults.push({
        kind: "no-default-route",
        hint: "Le switch cœur n'a pas de route par défaut vers le routeur.",
      });
    }
  } else if (device.role === "router") {
    faults.push(
      {
        kind: "router-ip",
        hint: "L'adresse IP de l'interface LAN du routeur ne correspond pas au lien de transit.",
      },
      {
        kind: "router-shutdown",
        hint: "L'interface du routeur vers le switch cœur est restée en shutdown.",
      },
    );
    if (device.defaultRoute?.trim()) {
      faults.push({
        kind: "router-no-default",
        hint: "La route par défaut vers le WAN est absente sur le routeur.",
      });
    }
  } else {
    if (ids.length >= 2) {
      faults.push({
        kind: "trunk-vlan",
        hint: "Le trunk n'autorise pas tous les VLANs nécessaires.",
      });
    }
    if (device.accessPorts.length > 0 && exercise.vlans.length >= 2) {
      faults.push({
        kind: "access-vlan",
        hint: "Un port Access est affecté au mauvais VLAN.",
      });
    }
    if (exercise.features.snooping || exercise.features.dai) {
      faults.push({
        kind: "no-trust",
        hint: "Le port uplink n'est pas déclaré de confiance pour DHCP Snooping / DAI.",
      });
    }
    if (exercise.features.parking && device.unusedPorts.length > 0) {
      faults.push({
        kind: "no-parking-shutdown",
        hint: "Les ports inutilisés ne sont pas tous administrativement down.",
      });
    }
    if (exercise.features.snooping) {
      faults.push({
        kind: "no-snooping",
        hint: "DHCP Snooping n'est pas activé globalement sur le switch.",
      });
    }
  }

  if (faults.length === 0) {
    return { text: good, hint: "Aucune panne disponible pour cet exercice." };
  }

  const fault = randomOf(faults);
  let text = good;

  if (fault.kind === "no-routing") {
    text = removeLine(text, (line) => line.trim().toLowerCase() === "ip routing");
  }

  if (fault.kind === "svi-down") {
    const vlan = randomOf(exercise.vlans);
    const marker = `interface Vlan${vlan.id}`;
    const lines = text.split("\n");
    const start = lines.findIndex(
      (line) => line.trim().toLowerCase() === marker.toLowerCase(),
    );
    if (start >= 0) {
      for (let i = start + 1; i < lines.length && !lines[i].startsWith("interface "); i += 1) {
        if (lines[i].trim() === "no shutdown") {
          lines[i] = " shutdown";
          break;
        }
      }
    }
    text = lines.join("\n");
  }

  if (fault.kind === "pool-gateway") {
    const vlan = randomOf(exercise.vlans);
    const parsed = parseCidr(vlan.subnet);
    const net = networkInt(vlanNetwork(vlan), parsed?.prefix ?? 24);
    const wrong = intToIp((net + 1) >>> 0);
    const lines = text.split("\n");
    const poolStart = lines.findIndex(
      (line) => line.trim().toLowerCase() === `ip dhcp pool vlan${vlan.id}`,
    );
    if (poolStart >= 0) {
      for (let i = poolStart + 1; i < lines.length && !lines[i].startsWith("ip dhcp pool"); i += 1) {
        if (lines[i].trim().toLowerCase().startsWith("default-router ")) {
          lines[i] = ` default-router ${wrong}`;
          break;
        }
      }
    }
    text = lines.join("\n");
  }

  if (fault.kind === "trunk-vlan") {
    const kept = ids.slice(0, Math.max(1, ids.length - 1));
    text = text.replace(
      /(switchport trunk allowed vlan\s+)[\d,]+/i,
      `$1${kept.join(",")}`,
    );
  }

  if (fault.kind === "access-vlan") {
    const entry = randomOf(device.accessPorts);
    const wrong = randomOf(exercise.vlans.filter((vlan) => vlan.id !== entry.vlanId));
    if (wrong) {
      text = text.replace(
        new RegExp(
          `(interface ${entry.port.replace(/\//g, "\\/")}[\\s\\S]*?switchport access vlan )${entry.vlanId}`,
          "i",
        ),
        `$1${wrong.id}`,
      );
    }
  }

  if (fault.kind === "no-trust") {
    text = removeLine(
      text,
      (line) =>
        line.trim().toLowerCase() === "ip dhcp snooping trust" ||
        line.trim().toLowerCase() === "ip arp inspection trust",
    );
  }

  if (fault.kind === "no-parking-shutdown") {
    const marker = canonIface(device.unusedPorts[0]);
    const lines = text.split("\n");
    const start = lines.findIndex((line) => line.toLowerCase().includes(marker));
    if (start >= 0) {
      for (let i = start + 1; i < lines.length && !lines[i].startsWith("interface "); i += 1) {
        if (lines[i].trim() === "shutdown") {
          lines.splice(i, 1);
          break;
        }
      }
    }
    text = lines.join("\n");
  }

  if (fault.kind === "no-snooping") {
    text = removeLine(text, (line) => line.trim().toLowerCase() === "ip dhcp snooping");
  }

  if (fault.kind === "no-default-route") {
    text = removeLine(text, (line) => line.trim().toLowerCase().startsWith("ip route 0.0.0.0"));
  }

  if (fault.kind === "router-ip") {
    const parsed = parseCidr(device.transitSubnet ?? "");
    const net = networkInt(
      parsed?.network ?? "10.0.0.0",
      parsed?.prefix ?? 30,
    );
    const wrong = intToIp((net + 2) >>> 0);
    if (wrong !== device.routerIp) {
      text = text.replace(
        new RegExp(`(ip address )${(device.routerIp ?? "").replace(/\./g, "\\.")}`, "i"),
        `$1${wrong}`,
      );
    }
  }

  if (fault.kind === "router-shutdown") {
    text = text.replace(/ no shutdown/i, " shutdown");
  }

  if (fault.kind === "router-no-default") {
    text = removeLine(text, (line) => line.trim().toLowerCase().startsWith("ip route 0.0.0.0"));
  }

  return { text: text.trimEnd(), hint: fault.hint };
}
