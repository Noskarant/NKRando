# NKRando

PWA de randonnée mobile pensée pour iPhone : carte, routage pédestre, import/export GPX, suivi GPS, pause/reprise, progression sur profil altimétrique, historique local, photos/commentaires et cache cartographique opportuniste.

## Démarrer

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Données / services

- OpenFreeMap + MapLibre GL JS pour la carte vectorielle.
- BRouter (profil `hiking-mountain`, repli `trekking`) pour le routage pédestre.
- Nominatim / OpenStreetMap pour la recherche.
- Esri World Imagery pour la couche satellite.

## iPhone / PWA

Installer depuis Safari via **Partager → Sur l’écran d’accueil**. La PWA garde le tracé, les activités et les itinéraires en local (IndexedDB). Le service worker met en cache l’app et les tuiles de carte effectivement consultées.

### Limitation iOS importante

Une PWA iOS n’a pas le mode natif Core Location `UIBackgroundModes=location`. Le suivi web ne peut donc pas garantir une acquisition GPS continue lorsque l’écran est verrouillé ou lorsque WebKit suspend l’app. Pour un tracking de randonnée fiable téléphone en veille, la même interface devra ensuite être emballée dans un conteneur natif iOS / Capacitor avec un module Core Location de background tracking.

## Sécurité montagne

Le routage repose sur les données OpenStreetMap et peut contenir des erreurs ou des passages non adaptés. Toujours vérifier le terrain, le balisage, les conditions et la difficulté réelle.


## Current features

- Prominent GPS position + heading marker.
- Free GPS recording with no planned route required.
- Automatic route calculation after selecting/tapping a destination.
- Public hiking-route discovery from OpenStreetMap route relations.
- Public circuits drawn directly on the search map.
