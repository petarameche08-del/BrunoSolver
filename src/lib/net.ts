/** Helpers réseau IPv4 + normalisation des interfaces Cisco. */

export function ipToInt(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    value = value * 256 + n;
  }
  return value >>> 0;
}

export function intToIp(value: number): string {
  const n = value >>> 0;
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

export function parseCidr(cidr: string): { network: string; prefix: number } | null {
  const [ip, prefixRaw] = cidr.trim().split("/");
  if (!ip || prefixRaw === undefined) return null;
  if (!/^\d{1,2}$/.test(prefixRaw)) return null;
  const prefix = Number(prefixRaw);
  if (prefix < 8 || prefix > 30) return null;
  const int = ipToInt(ip);
  if (int === null) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { network: intToIp((int & mask) >>> 0), prefix };
}

export function prefixToMask(prefix: number): string {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return intToIp(mask);
}

export function networkInt(network: string, prefix: number): number {
  const int = ipToInt(network) ?? 0;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (int & mask) >>> 0;
}

export function broadcastInt(network: string, prefix: number): number {
  const net = networkInt(network, prefix);
  const size = 2 ** (32 - prefix);
  return (net + size - 1) >>> 0;
}

export function ipInNetwork(ip: string, network: string, prefix: number): boolean {
  const int = ipToInt(ip);
  if (int === null) return false;
  const net = networkInt(network, prefix);
  const bcast = broadcastInt(network, prefix);
  return int >= net && int <= bcast;
}

export function isIp(value: string): boolean {
  return ipToInt(value) !== null;
}

/** Normalise un nom d'interface : GigabitEthernet0/1 -> g0/1, Fa0/2 -> fa0/2. */
export function canonIface(name: string): string {
  let s = name.toLowerCase().replace(/\s+/g, "");
  // Les préfixes longs d'abord (tengigabitethernet contient gigabitethernet).
  s = s
    .replace(/^tengigabitethernet/, "te")
    .replace(/^gigabitethernet/, "g")
    .replace(/^fastethernet/, "fa")
    .replace(/^ethernet/, "e")
    .replace(/^port-channel/, "po")
    .replace(/^loopback/, "lo")
    .replace(/^gi(?=\d)/, "g")
    .replace(/^eth(?=\d)/, "e");
  return s;
}

/** Développe `FastEthernet0/3-24` ou une liste `fa0/1-2,fa0/7` en ports unitaires. */
export function expandInterfaceRange(name: string): string[] {
  const compact = name.toLowerCase().replace(/\s+/g, "");
  const tokens = compact.split(",");
  const ports: string[] = [];
  for (const token of tokens) {
    const match = token.match(/^([a-z-]+)(\d+\/)(\d+)(?:-(\d+))?$/);
    if (!match) {
      const single = token.match(/^([a-z-]+\d+\/\d+)$/);
      if (single) ports.push(canonIface(token));
      continue;
    }
    const prefix = canonIface(match[1]);
    const slot = match[2];
    const start = Number(match[3]);
    const end = match[4] ? Number(match[4]) : start;
    for (let i = start; i <= end; i += 1) {
      ports.push(`${prefix}${slot}${i}`);
    }
  }
  return ports;
}

/** Analyse `10`, `10,20,30` ou `10-12` et renvoie les IDs. */
export function parseIdList(text: string): number[] {
  const ids = new Set<number>();
  const clean = text.replace(/\s+/g, "").toLowerCase();
  if (!clean || clean === "all" || clean === "none") return [];
  for (const part of clean.split(",")) {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      for (let i = start; i <= end; i += 1) ids.add(i);
      continue;
    }
    if (/^\d+$/.test(part)) ids.add(Number(part));
  }
  return [...ids].sort((a, b) => a - b);
}

export function shortIface(name: string): string {
  return canonIface(name).toUpperCase();
}
