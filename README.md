# Assistant de lab Cisco — VLAN / SVI / DHCP

Application web autonome pour **traiter n'importe quel exercice Cisco du même type** :
un switch multicouche (SVI, routage inter-VLAN), des switches d'accès, un routeur
optionnel (lien routé + route par défaut), des VLANs, du DHCP, du DHCP Snooping,
du DAI et un VLAN parking.

L'exercice n'est plus codé en dur : l'onglet **Exercice** décrit l'énoncé
(VLANs, adressage, équipements, ports, fonctions) et toute l'application
s'adapte — topologie, commandes, correction et validation.

> Outil pédagogique indépendant, non officiel. Il ne remplace ni un vrai switch ni Packet Tracer.

## Lancer le projet

```bash
npm install
npm run dev
```

Puis ouvrir l'adresse affichée (par défaut http://localhost:5173).

```bash
npm run build     # vérifie les types puis génère dist/
npm run preview   # sert dist/ localement
```

## Onglets

| Onglet | Contenu |
| --- | --- |
| **Topologie** | Schéma généré depuis l'exercice : switch cœur, switches d'accès, postes, trunks et ports access. Cliquable. |
| **Étapes** | Feuille de route générée selon les fonctions activées, commandes IOS prêtes à copier, progression sauvegardée. |
| **Configuration** | Éditeur par équipement + validateur en direct (score, contrôles ✅/❌, commande corrective). Correction complète, scénarios cassés pour le diagnostic. |
| **Vérification** | Commandes `show` (résultats attendus adaptés à l'exercice) + fiches de diagnostic. |
| **Quiz** | 12 questions transverses (SVI, routage, DHCP, snooping, DAI, VLAN parking). |
| **Exercice** | Définition du lab : identité, fonctions, VLANs/adressage, switches/ports, import/export JSON. |

## Décrire un exercice

Onglet **Exercice** :

- **Identité** : titre, module, énoncé.
- **Fonctions** : routage inter-VLAN, DHCP, DHCP Snooping, DAI, VLAN parking.
- **VLANs** : ID, libellé, réseau CIDR, passerelle SVI, plage DHCP (début/fin).
- **Switches** : hostname, port uplink et port côté cœur (trunk), ports access
  (`port = vlan = nom`), ports inutilisés (`FastEthernet0/3-24`).
- **Routeur** (optionnel) : ports LAN/côté cœur, réseau de transit (CIDR), IP du
  routeur et du cœur, next-hop de la route par défaut.
- **Exemples** : TP5 complet ou variante courte à deux VLANs.
- **Import / export JSON** : bouton « Importer un exercice » (PDF de l'énoncé,
  fichier JSON, JSON collé) et export de la définition courante.

### Import PDF

Le PDF est lu **localement** (pdf.js, aucun envoi réseau). L'outil extrait le
texte puis propose un exercice :

- titre (`TP5 — …`) et module détectés ;
- VLANs repérés par leurs IDs, sinon déduits du nombre de postes (`PC-A`,
  `PC-B`…) ;
- adressage lu dans le texte (CIDR ou IP + masque) ; à défaut,
  `192.168.<id>.0/24` avec passerelle `.254` ;
- équipements (`SW-L3`, `SW-L2-A/B`, `R1`…) et fonctions (DHCP, snooping, DAI,
  parking) ;
- ports access proposés automatiquement.

Un écran de revue affiche le résultat, les hypothèses et le texte extrait avant
création. Les PDF **scannés (images)** ne contiennent pas de texte : dans ce cas
utilisez l'import JSON ou saisissez l'exercice. Comme les schémas sont souvent
des images, **relisez toujours l'adressage et la répartition des ports** après
import.

Les PC de la topologie sont déduits des ports access. Ajouter un VLAN ou un
switch met immédiatement à jour la topologie, les étapes, la correction et les
contrôles.

## Validateur

Il analyse une configuration IOS collée dans l'éditeur et vérifie, selon
l'exercice et le rôle du switch :

- **cœur** : hostname, `ip routing`, VLANs, SVI (adresse + `no shutdown`),
  trunks (ports côté cœur), lien routé vers le routeur, route par défaut, pools
  DHCP (`network` + `default-router`) ;
- **accès** : hostname, VLANs + parking, ports access (mode + VLAN), trunk
  uplink, `ip dhcp snooping` + VLANs + `trust`, `ip arp inspection` + VLANs +
  `trust`, ports inutilisés en VLAN parking + `shutdown` ;
- **routeur** : hostname, IP du lien LAN, `no shutdown`, route par défaut.

Il est tolérant : abréviations (`fa0/1`, `gi0/1`), `interface range`, listes de
VLANs sur plusieurs lignes, ordre des sections, `switchport trunk allowed vlan add …`.

## Structure

```
src/
  App.tsx                 onglets, état global, persistance
  components/
    Topology.tsx          schéma généré + panneau équipement
    TaskBoard.tsx         feuille de route générée
    ConfigLab.tsx         éditeur + rapport de validation
    VerifyTab.tsx         commandes show + diagnostic
    QuizTab.tsx           quiz
    ExerciseTab.tsx       définition de l'exercice (VLANs, switches, routeur)
    ImportDialog.tsx      import PDF / JSON (fichier, collage, exemples)
  data/content.ts         étapes, quiz, vérifications, diagnostics (générés)
  lib/
    net.ts                IPv4, masques, normalisation des interfaces
    exercise.ts           modèle d'exercice, exemples, cohérence, ports
    pdfImport.ts          extraction PDF + heuristiques d'analyse
    parser.ts             analyse d'une running-config
    validator.ts          règles de validation
    generator.ts          correction + scénarios cassés
    storage.ts            localStorage + presse-papiers
```

Les données (exercice, configurations, progression) restent dans le navigateur
(`localStorage`).
