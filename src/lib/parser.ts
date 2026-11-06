import { canonIface, expandInterfaceRange, parseIdList } from "./net";

export type ParsedConfig = {
  lines: string[];
  globals: string[];
  interfaces: Map<string, string[]>;
  pools: Map<string, string[]>;
  vlans: Set<number>;
};

const SECTION_START =
  /^(interface |ip dhcp pool |vlan \d|line |router |class-map |policy-map |crypto |username |aaa |banner |ntp |logging |snmp-server |vtp )/;

const GLOBAL_ONLY =
  /^(hostname |no ip domain-lookup|ip routing$|ip route |ipv6 route |ip default-gateway |ip dhcp excluded-address |ip dhcp snooping$|ip dhcp snooping vlan |ip arp inspection$|ip arp inspection vlan |no ip routing$|service |enable secret|enable password)/;

/** Parse une configuration Cisco IOS en sections exploitables. */
export function parseConfig(raw: string): ParsedConfig {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/\t/g, " ").trim())
    .filter((line) => line.length > 0 && !line.startsWith("!"));

  const globals: string[] = [];
  const interfaces = new Map<string, string[]>();
  const pools = new Map<string, string[]>();
  const vlans = new Set<number>();

  type Cursor =
    | { kind: "iface"; keys: string[] }
    | { kind: "pool"; key: string }
    | null;

  let cursor: Cursor = null;

  const pushTarget = (line: string) => {
    if (!cursor) {
      globals.push(line);
      return;
    }
    if (cursor.kind === "iface") {
      for (const key of cursor.keys) {
        const list = interfaces.get(key) ?? [];
        list.push(line);
        interfaces.set(key, list);
      }
      return;
    }
    const list = pools.get(cursor.key) ?? [];
    list.push(line);
    pools.set(cursor.key, list);
  };

  for (const line of lines) {
    const norm = line.replace(/\s+/g, " ").toLowerCase();

    if (norm.startsWith("interface range ")) {
      const ports = expandInterfaceRange(norm.slice("interface range ".length));
      if (ports.length === 0) {
        cursor = null;
        globals.push(norm);
        continue;
      }
      cursor = { kind: "iface", keys: ports };
      for (const port of ports) {
        if (!interfaces.has(port)) interfaces.set(port, []);
      }
      continue;
    }

    if (norm.startsWith("interface ")) {
      const name = canonIface(norm.slice("interface ".length));
      if (!name) {
        cursor = null;
        globals.push(norm);
        continue;
      }
      cursor = { kind: "iface", keys: [name] };
      if (!interfaces.has(name)) interfaces.set(name, []);
      continue;
    }

    if (norm.startsWith("ip dhcp pool ")) {
      const name = norm.slice("ip dhcp pool ".length).trim();
      cursor = { kind: "pool", key: name };
      if (!pools.has(name)) pools.set(name, []);
      continue;
    }

    if (/^vlan [\d,\- ]+$/.test(norm)) {
      for (const id of parseIdList(norm.slice(5))) vlans.add(id);
      cursor = null;
      globals.push(norm);
      continue;
    }

    if (GLOBAL_ONLY.test(norm)) {
      cursor = null;
      globals.push(norm);
      continue;
    }

    if (SECTION_START.test(norm)) {
      // section connue mais non gérée (line, router, banner…)
      cursor = null;
      globals.push(norm);
      continue;
    }

    pushTarget(norm);
  }

  return { lines, globals, interfaces, pools, vlans };
}

/** true si une ligne globale existe exactement (normalisée). */
export function hasGlobal(cfg: ParsedConfig, line: string): boolean {
  const target = line.replace(/\s+/g, " ").trim().toLowerCase();
  return cfg.globals.includes(target);
}

/** Toutes les lignes globales commençant par un préfixe. */
export function globalsStartingWith(cfg: ParsedConfig, prefix: string): string[] {
  const target = prefix.toLowerCase();
  return cfg.globals.filter((line) => line.startsWith(target));
}

/** true si l'interface contient exactement la ligne donnée. */
export function ifaceHas(cfg: ParsedConfig, port: string, line: string): boolean {
  const children = cfg.interfaces.get(canonIface(port)) ?? [];
  const target = line.replace(/\s+/g, " ").trim().toLowerCase();
  return children.includes(target);
}

export function ifaceLines(cfg: ParsedConfig, port: string): string[] {
  return cfg.interfaces.get(canonIface(port)) ?? [];
}

export function interfaceExists(cfg: ParsedConfig, port: string): boolean {
  return cfg.interfaces.has(canonIface(port));
}

/** VLANs autorisés sur un trunk (union des lignes `allowed vlan`). null = tous. */
export function trunkAllowedVlans(children: string[]): number[] | null {
  const lines = children.filter((line) => line.startsWith("switchport trunk allowed vlan"));
  if (lines.length === 0) return null;
  const ids = new Set<number>();
  for (const line of lines) {
    const raw = line.replace(/^switchport trunk allowed vlan(\s+add)?\s*/, "");
    for (const id of parseIdList(raw)) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}

/** IDs d'une directive VLAN globale, ex. `ip dhcp snooping vlan 10,20`. */
export function directiveVlans(cfg: ParsedConfig, prefix: string): number[] {
  const ids = new Set<number>();
  for (const line of globalsStartingWith(cfg, prefix)) {
    const raw = line.slice(prefix.length).replace(/^\s+add\s+/, "");
    for (const id of parseIdList(raw)) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}

/** Extrait l'adresse IP d'une interface (`ip address x y`), null sinon. */
export function ifaceIp(cfg: ParsedConfig, port: string): { ip: string; mask: string } | null {
  const line = ifaceLines(cfg, port).find((entry) => entry.startsWith("ip address "));
  if (!line) return null;
  const parts = line.split(" ");
  const ip = parts[2];
  const mask = parts[3];
  if (!ip || !mask) return null;
  return { ip, mask };
}
