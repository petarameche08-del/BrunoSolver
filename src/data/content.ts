import {
  Exercise,
  accessDevices,
  allVlanIds,
  coreDevice,
  localVlanIds,
  routerDevice,
  vlanMask,
  vlanNetwork,
} from "../lib/exercise";
import { parseCidr, prefixToMask } from "../lib/net";

export type Task = {
  id: string;
  title: string;
  goal: string;
  commands: string[];
  tip?: string;
};

function comment(device: string): string {
  return `! --- ${device} ---`;
}

function vlanLines(exercise: Exercise): string[] {
  const ids = allVlanIds(exercise);
  if (exercise.features.parking) ids.push(exercise.parkingVlan);
  return ids.map((id) => `vlan ${id}`);
}

function accessLines(exercise: Exercise): string[] {
  const lines: string[] = [];
  for (const device of accessDevices(exercise)) {
    lines.push(comment(device.hostname));
    for (const entry of device.accessPorts) {
      lines.push(
        `interface ${entry.port}`,
        " switchport mode access",
        ` switchport access vlan ${entry.vlanId}`,
      );
    }
  }
  return lines;
}

function trunkLines(exercise: Exercise): string[] {
  const ids = allVlanIds(exercise);
  const lines: string[] = [];
  const core = coreDevice(exercise);
  if (core) {
    lines.push(comment(core.hostname));
    for (const access of accessDevices(exercise)) {
      lines.push(
        `interface ${access.corePort}`,
        " switchport trunk encapsulation dot1q",
        " switchport mode trunk",
        ` switchport trunk allowed vlan ${ids.join(",")}`,
      );
    }
  }
  for (const device of accessDevices(exercise)) {
    lines.push(comment(device.hostname));
    lines.push(
      `interface ${device.uplink}`,
      " switchport mode trunk",
      ` switchport trunk allowed vlan ${ids.join(",")}`,
    );
  }
  return lines;
}

function securityLines(
  exercise: Exercise,
  kind: "snooping" | "dai",
): string[] {
  const lines: string[] = [];
  for (const device of accessDevices(exercise)) {
    const local = localVlanIds(device);
    const ids = local.length > 0 ? local : allVlanIds(exercise);
    lines.push(comment(device.hostname));
    if (kind === "snooping") {
      lines.push(
        "ip dhcp snooping",
        `ip dhcp snooping vlan ${ids.join(",")}`,
        `interface ${device.uplink}`,
        " ip dhcp snooping trust",
      );
    } else {
      lines.push(
        `ip arp inspection vlan ${ids.join(",")}`,
        `interface ${device.uplink}`,
        " ip arp inspection trust",
      );
    }
  }
  return lines;
}

function parkingLines(exercise: Exercise): string[] {
  const lines: string[] = [];
  for (const device of accessDevices(exercise)) {
    if (device.unusedPorts.length === 0) continue;
    lines.push(
      comment(device.hostname),
      `interface ${device.unusedPorts[0]}`,
      " switchport mode access",
      ` switchport access vlan ${exercise.parkingVlan}`,
      " shutdown",
    );
  }
  return lines;
}

export function buildTasks(exercise: Exercise): Task[] {
  const core = coreDevice(exercise);
  const tasks: Task[] = [
    {
      id: "step-0",
      title: "Configuration générale",
      goal: "Nommer chaque équipement et éviter les résolutions DNS parasites.",
      commands: exercise.devices.flatMap((device) => [
        comment(device.hostname),
        `hostname ${device.hostname}`,
        "no ip domain-lookup",
      ]),
      tip: "`enable` puis `configure terminal` avant de saisir ces commandes.",
    },
    {
      id: "step-1",
      title: "Créer les VLANs sur tous les commutateurs",
      goal: exercise.features.parking
        ? "Segmenter les utilisateurs et prévoir le VLAN parking pour les ports inutilisés."
        : "Segmenter les utilisateurs : un VLAN par réseau.",
      commands: [...vlanLines(exercise), "! à répéter sur chaque commutateur"],
      tip: "Un VLAN doit exister sur tous les switches qui le transportent, sinon le trafic est jeté.",
    },
  ];

  if (exercise.features.routing && core) {
    tasks.push({
      id: "step-2",
      title: "Créer les SVI (passerelles par défaut)",
      goal: "Chaque VLAN reçoit une interface virtuelle L3 qui sert de passerelle.",
      commands: exercise.vlans.flatMap((vlan) => [
        `interface Vlan${vlan.id}`,
        ` ip address ${vlan.gateway} ${vlanMask(vlan)}`,
        " no shutdown",
      ]),
      tip: "L'adresse doit être dans le même réseau que les PC et hors de la plage DHCP dynamique.",
    });
    tasks.push({
      id: "step-3",
      title: "Activer le routage inter-VLAN",
      goal: "Sans cette commande, le switch multicouche route… rien.",
      commands: [`hostname ${core.hostname}`, "ip routing"],
      tip: "C'est LA commande du switch Layer 3. Vérifiez ensuite avec `show ip route`.",
    });
  }

  tasks.push({
    id: "step-4",
    title: "Affecter les ports Access",
    goal: "Placer chaque port relié à un poste dans le bon VLAN, en mode access.",
    commands: accessLines(exercise),
    tip: "Un port access appartient à un seul VLAN ; le poste ne voit pas les tags 802.1Q.",
  });

  tasks.push({
    id: "step-5",
    title: "Configurer les trunks 802.1Q",
    goal: "Transporter plusieurs VLANs entre le switch cœur et les switches d'accès.",
    commands: trunkLines(exercise),
    tip: "Vérifiez que la liste `allowed vlan` contient bien tous les VLANs utilisateurs.",
  });

  const router = routerDevice(exercise);
  if (router) {
    const parsed = parseCidr(router.transitSubnet ?? "");
    const mask = parsed ? prefixToMask(parsed.prefix) : "255.255.255.252";
    const core = coreDevice(exercise);
    tasks.push({
      id: "step-router",
      title: "Connecter le routeur (lien routé / route par défaut)",
      goal:
        "Adresser le lien entre le switch cœur et le routeur, puis déclarer la route par défaut.",
      commands: [
        comment(router.hostname),
        `interface ${router.uplink}`,
        ` ip address ${router.routerIp} ${mask}`,
        " no shutdown",
        ...(router.defaultRoute?.trim()
          ? [`ip route 0.0.0.0 0.0.0.0 ${router.defaultRoute.trim()}`]
          : []),
        ...(core
          ? [
              comment(core.hostname),
              `interface ${router.corePort}`,
              ` ip address ${router.coreIp} ${mask}`,
              " no shutdown",
              ...(router.defaultRoute?.trim()
                ? [`ip route 0.0.0.0 0.0.0.0 ${router.routerIp}`]
                : []),
            ]
          : []),
      ],
      tip: "Le switch cœur et le routeur doivent être dans le même réseau de transit et savoir se joindre.",
    });
  }

  if (exercise.features.dhcp && core) {
    tasks.push({
      id: "step-6",
      title: "Créer les pools DHCP",
      goal: "Distribuer automatiquement une adresse, la passerelle et le DNS.",
      commands: exercise.vlans.flatMap((vlan) => [
        `ip dhcp pool VLAN${vlan.id}`,
        ` network ${vlanNetwork(vlan)} ${vlanMask(vlan)}`,
        ` default-router ${vlan.gateway}`,
        ...(exercise.dns.trim() ? [` dns-server ${exercise.dns.trim()}`] : []),
      ]),
      tip: "Un pool par VLAN : `network` + `default-router` sont indispensables.",
    });
  }

  if (exercise.features.snooping) {
    tasks.push({
      id: "step-7",
      title: "Activer DHCP Snooping",
      goal: "Bloquer les serveurs DHCP non autorisés sur les ports d'accès.",
      commands: securityLines(exercise, "snooping"),
      tip: "Le trunk vers le serveur DHCP légitime doit être `trust`. Les ports PC restent untrusted.",
    });
  }

  if (exercise.features.dai) {
    tasks.push({
      id: "step-8",
      title: "Activer DAI (Dynamic ARP Inspection)",
      goal: "Bloquer l'ARP spoofing en s'appuyant sur les bindings DHCP Snooping.",
      commands: securityLines(exercise, "dai"),
      tip: "DAI a besoin de DHCP Snooping actif pour connaître les associations IP/MAC légitimes.",
    });
  }

  if (exercise.features.parking) {
    tasks.push({
      id: "step-9",
      title: `Sécuriser les ports inutilisés (VLAN ${exercise.parkingVlan})`,
      goal: "Neutraliser les prises libres : VLAN parking, mode access et shutdown.",
      commands: parkingLines(exercise),
      tip: "Sur un vrai switch, `interface range` traite tous les ports d'un coup.",
    });
  }

  tasks.push({
    id: "step-10",
    title: "Vérifier et diagnostiquer",
    goal: "Contrôler le routage, les SVI, les baux DHCP et les protections.",
    commands: [
      "show ip interface brief",
      "show ip route",
      "show interfaces trunk",
      "show ip dhcp binding",
      "show ip dhcp snooping binding",
      "show ip arp inspection",
    ],
    tip: "Comparez chaque sortie à l'onglet « Vérification ».",
  });

  return tasks;
}

export type QuizQuestion = {
  id: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
};

export const QUIZ: QuizQuestion[] = [
  {
    id: "q1",
    question: "À quoi sert une interface SVI sur un switch L3 ?",
    options: [
      "À taguer les trames sur un trunk",
      "À fournir une passerelle IP pour un VLAN",
      "À convertir les adresses MAC en IP",
      "À filtrer le DHCP sur les ports d'accès",
    ],
    answer: 1,
    explanation:
      "Une SVI (Switched Virtual Interface) est l'interface L3 du VLAN : elle porte l'adresse de passerelle par défaut des machines de ce VLAN.",
  },
  {
    id: "q2",
    question: "Quelle commande globale active le routage inter-VLAN sur un switch multicouche ?",
    options: ["ip route", "ip routing", "router eigrp", "switchport routing"],
    answer: 1,
    explanation:
      "`ip routing` active le routage IPv4 sur le switch. Sans elle, les SVI existent mais aucun paquet n'est routé entre les VLANs.",
  },
  {
    id: "q3",
    question: "Quelle commande affiche les baux distribués par le serveur DHCP IOS ?",
    options: [
      "show ip dhcp pool",
      "show ip dhcp binding",
      "show ip dhcp snooping binding",
      "show ip route dhcp",
    ],
    answer: 1,
    explanation:
      "`show ip dhcp binding` liste les baux du serveur DHCP IOS. `show ip dhcp snooping binding` montre les associations apprises par snooping, pas les baux du serveur.",
  },
  {
    id: "q4",
    question: "Sur quel type de port active-t-on `ip dhcp snooping trust` ?",
    options: [
      "Tous les ports access des PC",
      "Les ports trunk/uplink vers le serveur DHCP légitime",
      "Le VLAN parking uniquement",
      "Les ports shutdown",
    ],
    answer: 1,
    explanation:
      "Seuls les ports d'où peut venir un serveur DHCP légitime sont de confiance. Les ports access des utilisateurs restent untrusted et les OFFER y sont bloqués.",
  },
  {
    id: "q5",
    question: "Que protège DAI (Dynamic ARP Inspection) ?",
    options: [
      "Le vol de VLAN par double tagging",
      "L'ARP spoofing / empoisonnement de cache ARP",
      "Les attaques par force brute sur le mot de passe",
      "La saturation de la table CAM",
    ],
    answer: 1,
    explanation:
      "DAI compare les messages ARP à la table de bindings DHCP Snooping et jette ceux qui ne correspondent pas : il bloque l'ARP spoofing.",
  },
  {
    id: "q6",
    question: "Quel est le rôle du VLAN parking (ex. 999) ?",
    options: [
      "Accueillir le serveur DHCP",
      "Servir de VLAN natif sur les trunks",
      "Isoler et désactiver les ports inutilisés",
      "Transporter le trafic de management",
    ],
    answer: 2,
    explanation:
      "Les ports non utilisés sont placés dans un VLAN dédié, en access, puis mis en `shutdown` : une prise libre ne donne accès à rien.",
  },
  {
    id: "q7",
    question: "Un trunk 802.1Q transporte…",
    options: [
      "Un seul VLAN, sans tag",
      "Plusieurs VLANs, identifiés par un tag",
      "Uniquement le VLAN 1",
      "Uniquement du trafic routé",
    ],
    answer: 1,
    explanation:
      "802.1Q ajoute un tag de 4 octets qui identifie le VLAN de chaque trame. Le VLAN natif circule sans tag.",
  },
  {
    id: "q8",
    question: "Un PC ne reçoit pas d'adresse DHCP. Quel est le premier réflexe ?",
    options: [
      "Redémarrer tous les switches",
      "Vérifier que le trunk autorise son VLAN et que l'uplink est `snooping trust`",
      "Changer l'adresse MAC du PC",
      "Désactiver le routage inter-VLAN",
    ],
    answer: 1,
    explanation:
      "Le discover DHCP doit traverser le trunk dans le bon VLAN, et l'OFFER doit pouvoir redescendre : VLAN autorisé + uplink trust sont les causes classiques.",
  },
  {
    id: "q9",
    question: "Quelle commande vérifie que les routes des VLANs sont présentes sur le switch L3 ?",
    options: ["show ip route", "show vlan brief", "show interfaces trunk", "show arp inspection"],
    answer: 0,
    explanation:
      "`show ip route` affiche les réseaux directement connectés (les SVI). On doit voir une route `C` par VLAN.",
  },
  {
    id: "q10",
    question: "Que contient obligatoirement un pool DHCP pour fonctionner ?",
    options: [
      "network + default-router",
      "hostname + dns-server",
      "vlan + trunk",
      "ip routing + access-list",
    ],
    answer: 0,
    explanation:
      "Le serveur a besoin du réseau à distribuer (`network`) et de la passerelle annoncée (`default-router`). Le DNS est recommandé mais optionnel.",
  },
  {
    id: "q11",
    question: "Les ports d'un switch d'accès sont par défaut…",
    options: [
      "en mode trunk",
      "en mode access dans le VLAN 1",
      "en mode routé",
      "désactivés",
    ],
    answer: 1,
    explanation:
      "Par défaut, tous les ports sont en mode access dans le VLAN 1 : d'où l'intérêt de créer les VLANs et d'affecter explicitement les ports.",
  },
  {
    id: "q12",
    question: "Pourquoi exclure la passerelle et les adresses basses de la plage DHCP ?",
    options: [
      "Pour accélérer les baux",
      "Pour éviter les conflits d'adresses avec les équipements statiques",
      "Pour activer le routage",
      "Pour que DAI fonctionne",
    ],
    answer: 1,
    explanation:
      "Le serveur ne doit pas distribuer une adresse déjà utilisée par une SVI, un serveur ou une imprimante configurée en statique.",
  },
];

export type VerifyCommand = {
  command: string;
  purpose: string;
  expected: string;
};

export function buildVerify(exercise: Exercise): VerifyCommand[] {
  const ids = allVlanIds(exercise);
  const vlanText = ids.join("/");
  const parking = exercise.features.parking
    ? ` VLAN ${exercise.parkingVlan} pour les ports libres.`
    : "";
  return [
    {
      command: "show version",
      purpose: "Modèle, version IOS, uptime",
      expected: "Le switch répond, l'IOS est celui attendu.",
    },
    {
      command: "show vlan brief",
      purpose: "VLANs existants et ports affectés",
      expected: `VLANs ${vlanText} présents, ports access dans le bon VLAN, ports libres${exercise.features.parking ? ` dans ${exercise.parkingVlan}` : " inchangés"}.${parking}`,
    },
    {
      command: "show ip interface brief",
      purpose: "État des interfaces et SVI",
      expected: exercise.features.routing
        ? "Les SVI des VLANs sont up/up avec l'adresse de passerelle."
        : "Les ports physiques sont up, les VLANs existent.",
    },
    {
      command: "show ip route",
      purpose: "Table de routage",
      expected: exercise.features.routing
        ? "Une route connectée (C) par réseau de VLAN ; le routage est actif."
        : "Pas de routage attendu dans cet exercice.",
    },
    {
      command: "show interfaces trunk",
      purpose: "Trunks et VLANs autorisés",
      expected: `Les liens cœur ↔ accès sont en trunk, VLANs ${vlanText} autorisés et actifs.`,
    },
    {
      command: "show interfaces status",
      purpose: "État physique des ports",
      expected: `Ports PC connectés, ports inutilisés notconnect${exercise.features.parking ? " + shutdown (disabled)" : ""}.`,
    },
    {
      command: "show ip dhcp pool",
      purpose: "Pools configurés",
      expected: exercise.features.dhcp
        ? "Un pool par VLAN avec le bon réseau et la bonne passerelle."
        : "Aucun pool attendu.",
    },
    {
      command: "show ip dhcp binding",
      purpose: "Baux distribués par le serveur",
      expected: exercise.features.dhcp
        ? "Une entrée par poste (IP, MAC, expiration) après renouvellement DHCP."
        : "Aucun bail attendu.",
    },
    {
      command: "show ip dhcp server statistics",
      purpose: "Compteurs DHCP",
      expected: exercise.features.dhcp
        ? "Des DISCOVER/OFFER/REQUEST/ACK reçus et envoyés, aucune erreur anormale."
        : "Non applicable.",
    },
    {
      command: "show ip dhcp snooping",
      purpose: "État global du snooping",
      expected: exercise.features.snooping
        ? "Snooping activé + liste des VLANs surveillés."
        : "Snooping non demandé dans cet exercice.",
    },
    {
      command: "show ip dhcp snooping binding",
      purpose: "Bindings appris par snooping",
      expected: exercise.features.snooping
        ? "IP + MAC + VLAN + port pour chaque poste ; les trunks sont en trust."
        : "Non applicable.",
    },
    {
      command: "show ip arp inspection",
      purpose: "État DAI",
      expected: exercise.features.dai
        ? "DAI actif sur les VLANs utilisateurs, uplink en trust."
        : "DAI non demandé dans cet exercice.",
    },
    {
      command: "show ip arp inspection statistics",
      purpose: "Compteurs DAI",
      expected: exercise.features.dai
        ? "Des ARP valides transmis ; des ARP invalides éventuellement rejetés."
        : "Non applicable.",
    },
    {
      command: "ping 192.168.x.y",
      purpose: "Routage inter-VLAN",
      expected: exercise.features.routing
        ? "Deux postes de VLANs différents se répondent."
        : "Le ping inter-VLAN n'est pas attendu sans routage.",
    },
  ];
}

export type Diagnostic = {
  symptom: string;
  causes: string[];
  checks: string[];
};

export const DIAGNOSTICS: Diagnostic[] = [
  {
    symptom: "Un PC n'obtient pas d'adresse DHCP",
    causes: [
      "Trunk qui n'autorise pas le VLAN du PC",
      "Uplink non déclaré `ip dhcp snooping trust`",
      "SVI du VLAN en shutdown ou mauvaise adresse",
      "Pool DHCP absent ou mauvais réseau",
    ],
    checks: [
      "show interfaces trunk",
      "show ip dhcp snooping",
      "show ip interface brief",
      "show ip dhcp pool",
    ],
  },
  {
    symptom: "Un PC a une adresse mais ne ping pas un autre VLAN",
    causes: [
      "`ip routing` absent sur le switch cœur",
      "SVI du VLAN destination en shutdown",
      "Port access dans le mauvais VLAN",
    ],
    checks: ["show ip route", "show ip interface brief", "show vlan brief"],
  },
  {
    symptom: "Les pings fonctionnent mais DAI bloque certains ARP",
    causes: [
      "Uplink sans `ip arp inspection trust`",
      "DHCP Snooping inactif : pas de bindings pour DAI",
      "Poste configuré en IP statique (pas de binding)",
    ],
    checks: [
      "show ip arp inspection",
      "show ip dhcp snooping binding",
      "show ip arp inspection statistics",
    ],
  },
  {
    symptom: "Un port libre donne encore accès au réseau",
    causes: [
      "Port resté dans le VLAN 1",
      "`switchport mode access` absent",
      "`shutdown` oublié sur le port",
    ],
    checks: ["show vlan brief", "show interfaces status"],
  },
];
