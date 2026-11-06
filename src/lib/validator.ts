import {
  Exercise,
  SwitchDevice,
  accessDevices,
  allVlanIds,
  coreDevice,
  deviceById,
  localVlanIds,
  routerDevice,
  vlanById,
  vlanMask,
  vlanNetwork,
} from "./exercise";
import { parseCidr, prefixToMask } from "./net";
import {
  ParsedConfig,
  directiveVlans,
  globalsStartingWith,
  hasGlobal,
  ifaceHas,
  ifaceIp,
  ifaceLines,
  interfaceExists,
  parseConfig,
  trunkAllowedVlans,
} from "./parser";

export type Check = {
  id: string;
  group: string;
  label: string;
  ok: boolean;
  detail?: string;
  fix?: string;
};

export type ValidationReport = {
  checks: Check[];
  ok: number;
  total: number;
  percent: number;
};

function ok(id: string, group: string, label: string, detail?: string): Check {
  return { id, group, label, ok: true, detail };
}

function fail(
  id: string,
  group: string,
  label: string,
  detail: string,
  fix?: string,
): Check {
  return { id, group, label, ok: false, detail, fix };
}

function maskMatches(given: string, expectedMask: string, prefix: number): boolean {
  return given === expectedMask || given === `/${prefix}`;
}

function checkHostname(cfg: ParsedConfig, hostname: string): Check {
  const line = cfg.globals.find((entry) => entry.startsWith("hostname "));
  const found = line ? line.slice("hostname ".length).trim() : "";
  if (found.toLowerCase() === hostname.toLowerCase()) {
    return ok("hostname", "Général", `Nom d'hôte : ${hostname}`);
  }
  return fail(
    "hostname",
    "Général",
    `Nom d'hôte : ${hostname}`,
    found ? `Trouvé : « ${found} »` : "Aucune commande hostname.",
    `hostname ${hostname}`,
  );
}

function checkVlans(cfg: ParsedConfig, ids: number[], parking?: number): Check {
  const label = parking
    ? `VLANs créés (${ids.join(", ")} + parking ${parking})`
    : `VLANs créés (${ids.join(", ")})`;
  const missing = ids.filter((id) => !cfg.vlans.has(id));
  if (parking && !cfg.vlans.has(parking)) missing.push(parking);
  if (missing.length === 0) return ok("vlans", "VLANs", label);
  return fail(
    "vlans",
    "VLANs",
    label,
    `Manquant(s) : ${missing.map((id) => `vlan ${id}`).join(", ")}`,
    missing.map((id) => `vlan ${id}`).join("\n"),
  );
}

function checkSvi(cfg: ParsedConfig, exercise: Exercise, vlanId: number): Check {
  const vlan = vlanById(exercise, vlanId);
  const group = "Passerelles SVI";
  if (!vlan) {
    return fail(`svi-${vlanId}`, group, `SVI VLAN ${vlanId}`, "VLAN inconnu dans l'exercice.");
  }
  const port = `Vlan${vlanId}`;
  const parsed = parseCidr(vlan.subnet);
  const mask = vlanMask(vlan);
  const label = `SVI VLAN ${vlanId} — ${vlan.gateway}/${parsed?.prefix ?? 24}`;

  if (!interfaceExists(cfg, port)) {
    return fail(
      `svi-${vlanId}`,
      group,
      label,
      `Aucune interface ${port}.`,
      `interface ${port}\n ip address ${vlan.gateway} ${mask}\n no shutdown`,
    );
  }
  const address = ifaceIp(cfg, port);
  if (!address) {
    return fail(
      `svi-${vlanId}`,
      group,
      label,
      "L'interface existe mais n'a pas d'adresse IP.",
      `ip address ${vlan.gateway} ${mask}`,
    );
  }
  if (address.ip !== vlan.gateway || !maskMatches(address.mask, mask, parsed?.prefix ?? 24)) {
    return fail(
      `svi-${vlanId}`,
      group,
      label,
      `Trouvé : ${address.ip} ${address.mask}`,
      `ip address ${vlan.gateway} ${mask}`,
    );
  }
  if (!ifaceHas(cfg, port, "no shutdown")) {
    return fail(
      `svi-${vlanId}`,
      group,
      label,
      "Adresse correcte, mais l'interface est en shutdown.",
      "no shutdown",
    );
  }
  return ok(`svi-${vlanId}`, group, label, "up/up, adresse correcte");
}

function checkTrunk(
  cfg: ParsedConfig,
  port: string,
  requiredIds: number[],
  group: string,
  label: string,
): Check {
  const id = `trunk-${port}`;
  if (!interfaceExists(cfg, port)) {
    return fail(
      id,
      group,
      label,
      `Aucune interface ${port}.`,
      `interface ${port}\n switchport mode trunk\n switchport trunk allowed vlan ${requiredIds.join(",")}`,
    );
  }
  if (!ifaceHas(cfg, port, "switchport mode trunk")) {
    return fail(id, group, label, "Le port n'est pas en mode trunk.", "switchport mode trunk");
  }
  const allowed = trunkAllowedVlans(ifaceLines(cfg, port));
  if (allowed === null) {
    return ok(id, group, label, "trunk, tous les VLANs autorisés");
  }
  const missing = requiredIds.filter((vlanId) => !allowed.includes(vlanId));
  if (missing.length > 0) {
    return fail(
      id,
      group,
      label,
      `VLAN(s) manquant(s) sur le trunk : ${missing.join(", ")}`,
      `switchport trunk allowed vlan ${requiredIds.join(",")}`,
    );
  }
  return ok(id, group, label, `trunk, autorise ${allowed.join(", ")}`);
}

function checkAccessPort(
  cfg: ParsedConfig,
  port: string,
  vlanId: number,
  desc: string,
): Check {
  const group = "Ports Access";
  const label = `${port} → ${desc} (VLAN ${vlanId})`;
  const id = `access-${port}`;
  if (!interfaceExists(cfg, port)) {
    return fail(
      id,
      group,
      label,
      "Interface absente de la configuration.",
      `interface ${port}\n switchport mode access\n switchport access vlan ${vlanId}`,
    );
  }
  const problems: string[] = [];
  if (!ifaceHas(cfg, port, "switchport mode access")) problems.push("mode access absent");
  const vlanLine = ifaceLines(cfg, port).find((line) =>
    line.startsWith("switchport access vlan "),
  );
  const foundVlan = vlanLine ? Number(vlanLine.split(" ").pop()) : null;
  if (foundVlan !== vlanId) {
    problems.push(foundVlan ? `VLAN affecté : ${foundVlan}` : "aucun VLAN affecté");
  }
  if (problems.length === 0) return ok(id, group, label, "mode access + bon VLAN");
  return fail(
    id,
    group,
    label,
    problems.join(" · "),
    `interface ${port}\n switchport mode access\n switchport access vlan ${vlanId}`,
  );
}

function checkPool(cfg: ParsedConfig, exercise: Exercise, vlanId: number): Check {
  const vlan = vlanById(exercise, vlanId);
  const group = "Pools DHCP";
  if (!vlan) {
    return fail(`pool-${vlanId}`, group, `Pool DHCP VLAN ${vlanId}`, "VLAN inconnu.");
  }
  const parsed = parseCidr(vlan.subnet);
  const mask = vlanMask(vlan);
  const network = vlanNetwork(vlan);
  const label = `Pool DHCP VLAN ${vlanId} — ${network}/${parsed?.prefix ?? 24} via ${vlan.gateway}`;

  for (const children of cfg.pools.values()) {
    const networkLine = children.find((line) => line.startsWith("network "));
    const routerLine = children.find((line) => line.startsWith("default-router "));
    if (!networkLine) continue;
    const [, net, givenMask] = networkLine.split(/\s+/);
    const networkOk =
      net === network &&
      (givenMask === mask || givenMask === `/${parsed?.prefix ?? 24}`);
    if (!networkOk) continue;
    const router = routerLine?.split(/\s+/)[1];
    if (router === vlan.gateway) {
      return ok(`pool-${vlanId}`, group, label, "network + default-router corrects");
    }
    return fail(
      `pool-${vlanId}`,
      group,
      label,
      router ? `Passerelle annoncée : ${router}` : "default-router manquant.",
      `default-router ${vlan.gateway}`,
    );
  }
  return fail(
    `pool-${vlanId}`,
    group,
    label,
    "Aucun pool ne correspond à ce réseau.",
    `ip dhcp pool VLAN${vlanId}\n network ${network} ${mask}\n default-router ${vlan.gateway}`,
  );
}

function securityChecks(
  cfg: ParsedConfig,
  exercise: Exercise,
  device: SwitchDevice,
): Check[] {
  const checks: Check[] = [];
  const local = localVlanIds(device);
  const vlanIds = local.length > 0 ? local : allVlanIds(exercise);

  if (exercise.features.snooping) {
    const snoopingOn = hasGlobal(cfg, "ip dhcp snooping");
    const snoopingVlans = directiveVlans(cfg, "ip dhcp snooping vlan");
    const missing = vlanIds.filter((id) => !snoopingVlans.includes(id));
    if (!snoopingOn) {
      checks.push(
        fail(
          "snooping-global",
          "DHCP Snooping",
          "DHCP Snooping activé",
          "La commande globale `ip dhcp snooping` est absente.",
          "ip dhcp snooping",
        ),
      );
    } else if (missing.length > 0) {
      checks.push(
        fail(
          "snooping-vlan",
          "DHCP Snooping",
          "DHCP Snooping sur les VLANs utilisateurs",
          `VLAN(s) non couverts : ${missing.join(", ")}`,
          `ip dhcp snooping vlan ${vlanIds.join(",")}`,
        ),
      );
    } else {
      checks.push(
        ok(
          "snooping",
          "DHCP Snooping",
          "DHCP Snooping activé sur les VLANs utilisateurs",
          `VLANs : ${vlanIds.join(", ")}`,
        ),
      );
    }
    checks.push(
      ifaceHas(cfg, device.uplink || "uplink", "ip dhcp snooping trust")
        ? ok("snooping-trust", "DHCP Snooping", "Uplink de confiance (ip dhcp snooping trust)")
        : fail(
            "snooping-trust",
            "DHCP Snooping",
            "Uplink de confiance (ip dhcp snooping trust)",
            "Le port trunk vers le serveur DHCP doit être trustworthy, sinon les OFFER sont bloqués.",
            `interface ${device.uplink}\n ip dhcp snooping trust`,
          ),
    );
  }

  if (exercise.features.dai) {
    const arpOn = globalsStartingWith(cfg, "ip arp inspection vlan").length > 0;
    const arpVlans = directiveVlans(cfg, "ip arp inspection vlan");
    const missing = vlanIds.filter((id) => !arpVlans.includes(id));
    if (!arpOn) {
      checks.push(
        fail(
          "dai-vlan",
          "DAI",
          "Dynamic ARP Inspection sur les VLANs utilisateurs",
          "Aucune commande `ip arp inspection vlan …`.",
          `ip arp inspection vlan ${vlanIds.join(",")}`,
        ),
      );
    } else if (missing.length > 0) {
      checks.push(
        fail(
          "dai-vlan",
          "DAI",
          "Dynamic ARP Inspection sur les VLANs utilisateurs",
          `VLAN(s) non couverts : ${missing.join(", ")}`,
          `ip arp inspection vlan ${vlanIds.join(",")}`,
        ),
      );
    } else {
      checks.push(
        ok(
          "dai",
          "DAI",
          "Dynamic ARP Inspection sur les VLANs utilisateurs",
          `VLANs : ${vlanIds.join(", ")}`,
        ),
      );
    }
    checks.push(
      ifaceHas(cfg, device.uplink || "uplink", "ip arp inspection trust")
        ? ok("dai-trust", "DAI", "Uplink de confiance (ip arp inspection trust)")
        : fail(
            "dai-trust",
            "DAI",
            "Uplink de confiance (ip arp inspection trust)",
            "Sans trust sur l'uplink, DAI jette les ARP légitimes venant du routeur.",
            `interface ${device.uplink}\n ip arp inspection trust`,
          ),
    );
  }

  if (exercise.features.parking && device.unusedPorts.length > 0) {
    const issues: string[] = [];
    for (const port of device.unusedPorts) {
      if (!interfaceExists(cfg, port)) {
        issues.push(`${port} (absent)`);
        continue;
      }
      const problems: string[] = [];
      if (!ifaceHas(cfg, port, "switchport mode access")) problems.push("mode access");
      const vlanLine = ifaceLines(cfg, port).find((line) =>
        line.startsWith("switchport access vlan "),
      );
      if (Number(vlanLine?.split(" ").pop()) !== exercise.parkingVlan) {
        problems.push(`VLAN ${exercise.parkingVlan}`);
      }
      if (!ifaceHas(cfg, port, "shutdown")) problems.push("shutdown");
      if (problems.length > 0) issues.push(`${port} (${problems.join(", ")})`);
    }
    checks.push(
      issues.length === 0
        ? ok(
            "parking",
            "Ports inutilisés",
            `Ports inutilisés en VLAN ${exercise.parkingVlan} + shutdown`,
            `${device.unusedPorts.length} port(s) vérifiés`,
          )
        : fail(
            "parking",
            "Ports inutilisés",
            `Ports inutilisés en VLAN ${exercise.parkingVlan} + shutdown`,
            `${issues.length} port(s) non conformes — ex. ${issues.slice(0, 4).join(" · ")}${issues.length > 4 ? " …" : ""}`,
            `interface ${device.unusedPorts[0]}\n switchport mode access\n switchport access vlan ${exercise.parkingVlan}\n shutdown`,
          ),
    );
  }

  return checks;
}

function checkRoutedInterface(
  cfg: ParsedConfig,
  port: string,
  ip: string,
  prefix: number,
  group: string,
  label: string,
): Check {
  const id = `routed-${port}`;
  const mask = prefixToMask(prefix);
  if (!interfaceExists(cfg, port)) {
    return fail(
      id,
      group,
      label,
      `Aucune interface ${port}.`,
      `interface ${port}\n ip address ${ip} ${mask}\n no shutdown`,
    );
  }
  const address = ifaceIp(cfg, port);
  if (!address) {
    return fail(
      id,
      group,
      label,
      "L'interface existe mais n'a pas d'adresse IP.",
      `ip address ${ip} ${mask}`,
    );
  }
  if (address.ip !== ip || !maskMatches(address.mask, mask, prefix)) {
    return fail(id, group, label, `Trouvé : ${address.ip} ${address.mask}`, `ip address ${ip} ${mask}`);
  }
  if (!ifaceHas(cfg, port, "no shutdown")) {
    return fail(id, group, label, "Adresse correcte, mais l'interface est en shutdown.", "no shutdown");
  }
  return ok(id, group, label, `${ip}/${prefix} up/up`);
}

function checkDefaultRoute(
  cfg: ParsedConfig,
  nextHop: string,
  group: string,
  label: string,
): Check {
  const expected = `ip route 0.0.0.0 0.0.0.0 ${nextHop}`.toLowerCase();
  const found = cfg.globals.some((line) => line === expected);
  return found
    ? ok("default-route", group, label, `next-hop ${nextHop}`)
    : fail(
        "default-route",
        group,
        label,
        "Route par défaut absente ou next-hop incorrect.",
        expected,
      );
}

function routerChecks(
  cfg: ParsedConfig,
  device: SwitchDevice,
): Check[] {
  const parsed = parseCidr(device.transitSubnet ?? "");
  const checks: Check[] = [checkHostname(cfg, device.hostname)];
  if (!parsed) {
    checks.push(
      fail(
        "router-transit",
        "Routeur",
        "Réseau de transit valide",
        "Le réseau du lien routé est invalide dans l'exercice.",
      ),
    );
    return checks;
  }
  checks.push(
    checkRoutedInterface(
      cfg,
      device.uplink,
      device.routerIp ?? "",
      parsed.prefix,
      "Routeur",
      `IP LAN ${device.routerIp}/${parsed.prefix} sur ${device.uplink}`,
    ),
  );
  if (device.defaultRoute?.trim()) {
    checks.push(
      checkDefaultRoute(
        cfg,
        device.defaultRoute.trim(),
        "Routeur",
        `Route par défaut vers ${device.defaultRoute.trim()}`,
      ),
    );
  }
  return checks;
}

export function validateConfig(
  exercise: Exercise,
  deviceId: string,
  raw: string,
): ValidationReport {
  const cfg = parseConfig(raw);
  const device = deviceById(exercise, deviceId);
  if (!device) {
    return { checks: [], ok: 0, total: 0, percent: 0 };
  }

  const finalize = (list: Check[]): ValidationReport => {
    const okCount = list.filter((check) => check.ok).length;
    return {
      checks: list,
      ok: okCount,
      total: list.length,
      percent:
        list.length === 0 ? 0 : Math.round((okCount / list.length) * 100),
    };
  };

  if (device.role === "router") {
    return finalize(routerChecks(cfg, device));
  }

  const checks: Check[] = [];
  const ids = allVlanIds(exercise);
  checks.push(checkHostname(cfg, device.hostname));
  checks.push(
    checkVlans(
      cfg,
      ids,
      exercise.features.parking ? exercise.parkingVlan : undefined,
    ),
  );

  if (device.role === "core") {
    if (exercise.features.routing) {
      checks.push(
        hasGlobal(cfg, "ip routing")
          ? ok("routing", "Routage", "Routage inter-VLAN activé (ip routing)")
          : fail(
              "routing",
              "Routage",
              "Routage inter-VLAN activé (ip routing)",
              "Sans `ip routing`, le switch L3 se comporte comme un switch L2.",
              "ip routing",
            ),
      );
      for (const vlan of exercise.vlans) {
        checks.push(checkSvi(cfg, exercise, vlan.id));
      }
    }
    for (const access of accessDevices(exercise)) {
      checks.push(
        checkTrunk(
          cfg,
          access.corePort,
          ids,
          "Trunks",
          `Trunk ${access.corePort} → ${access.hostname}`,
        ),
      );
    }
    const router = routerDevice(exercise);
    if (router) {
      const parsed = parseCidr(router.transitSubnet ?? "");
      if (parsed) {
        checks.push(
          checkRoutedInterface(
            cfg,
            router.corePort,
            router.coreIp ?? "",
            parsed.prefix,
            "Liaison routeur",
            `Lien vers ${router.hostname} — ${router.coreIp}/${parsed.prefix}`,
          ),
        );
      }
      if (router.defaultRoute?.trim()) {
        checks.push(
          checkDefaultRoute(
            cfg,
            router.routerIp ?? "",
            "Liaison routeur",
            `Route par défaut vers ${router.hostname} (${router.routerIp})`,
          ),
        );
      }
    }
    if (exercise.features.dhcp) {
      for (const vlan of exercise.vlans) {
        checks.push(checkPool(cfg, exercise, vlan.id));
      }
    }
  } else {
    for (const entry of device.accessPorts) {
      const vlan = vlanById(exercise, entry.vlanId);
      checks.push(
        checkAccessPort(
          cfg,
          entry.port,
          entry.vlanId,
          `${entry.label}${vlan ? ` — ${vlan.label}` : ""}`,
        ),
      );
    }
    checks.push(
      checkTrunk(
        cfg,
        device.uplink,
        ids,
        "Trunks",
        `Uplink ${device.uplink} → ${coreDevice(exercise)?.hostname ?? "cœur"}`,
      ),
    );
    checks.push(...securityChecks(cfg, exercise, device));
  }

  return finalize(checks);
}
